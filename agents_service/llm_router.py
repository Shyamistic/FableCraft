"""
LLM Router Service.
Routes LLM requests to Amazon Bedrock (primary) or OpenRouter (fallback).
Logs latency, status, and provider for each request.
Supports different models per task type via environment variables.
Implements exponential backoff retry (up to 3 retries) for AWS service errors.
"""

import asyncio
import json
import time
import logging
from typing import Optional

import boto3
import httpx
from botocore.exceptions import (
    ClientError,
    BotoCoreError,
    ConnectionError as BotoConnectionError,
    ReadTimeoutError,
)

from config import settings

logger = logging.getLogger(__name__)

# Valid task types
TASK_TYPES = ("vision", "quest", "moderation")


class LLMRouterError(Exception):
    """Raised when both Bedrock and OpenRouter fail."""

    def __init__(
        self,
        message: str,
        bedrock_error: Optional[str] = None,
        openrouter_error: Optional[str] = None,
    ):
        super().__init__(message)
        self.bedrock_error = bedrock_error
        self.openrouter_error = openrouter_error


class LLMRouter:
    """Routes LLM requests to Bedrock primary or OpenRouter fallback."""

    def __init__(self):
        self.settings = settings
        self._bedrock_client = None
        self._http_client = None

    @property
    def bedrock_client(self):
        """Lazily initialize the Bedrock runtime client."""
        if self._bedrock_client is None:
            self._bedrock_client = boto3.client(
                "bedrock-runtime",
                region_name=self.settings.aws_region,
            )
        return self._bedrock_client

    @property
    def http_client(self) -> httpx.AsyncClient:
        """Lazily initialize the httpx async client for OpenRouter."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(
                base_url=self.settings.openrouter_base_url,
                timeout=httpx.Timeout(
                    self.settings.openrouter_timeout_ms / 1000.0
                ),
            )
        return self._http_client

    async def close(self):
        """Clean up resources."""
        if self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None

    # ─── Public API ───────────────────────────────────────────────────────

    async def vision_analysis(
        self,
        prompt: str,
        image_data: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> dict:
        """Route a vision analysis request through the LLM Router.

        Args:
            prompt: The text prompt describing what to analyze.
            image_data: Optional base64-encoded image data.
            system_prompt: Optional system prompt for the model.

        Returns:
            dict with 'content', 'provider', 'latency_ms'.
        """
        return await self._route_request("vision", prompt, image_data, system_prompt)

    async def quest_generation(
        self,
        prompt: str,
        image_data: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> dict:
        """Route a quest generation request through the LLM Router.

        Args:
            prompt: The text prompt for quest generation.
            image_data: Optional base64-encoded image (unused for quests, kept for consistency).
            system_prompt: Optional system prompt for the model.

        Returns:
            dict with 'content', 'provider', 'latency_ms'.
        """
        return await self._route_request("quest", prompt, image_data, system_prompt)

    async def content_moderation(
        self,
        prompt: str,
        image_data: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> dict:
        """Route a content moderation request through the LLM Router.

        Args:
            prompt: The text to moderate.
            image_data: Optional base64-encoded image for visual moderation.
            system_prompt: Optional system prompt for the model.

        Returns:
            dict with 'content', 'provider', 'latency_ms'.
        """
        return await self._route_request("moderation", prompt, image_data, system_prompt)

    # ─── Internal Routing ─────────────────────────────────────────────────

    async def _route_request(
        self,
        task_type: str,
        prompt: str,
        image_data: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> dict:
        """
        Route an LLM request to Bedrock, falling back to OpenRouter on failure.

        Bedrock calls use exponential backoff retry (up to 3 retries) for
        AWS service errors. If all Bedrock attempts fail, the request is
        routed to OpenRouter with its own timeout.

        Args:
            task_type: One of 'vision', 'quest', 'moderation'
            prompt: The text prompt to send
            image_data: Optional base64 image data for vision tasks
            system_prompt: Optional system prompt

        Returns:
            dict with 'content' (response text), 'provider', 'latency_ms'

        Raises:
            LLMRouterError if both providers fail
        """
        # Try Bedrock first with exponential backoff retry
        start = time.time()
        bedrock_error = None
        try:
            result = await self._call_bedrock_with_retry(
                task_type, prompt, image_data, system_prompt
            )
            latency_ms = int((time.time() - start) * 1000)
            self._log_request(task_type, "bedrock", "success", latency_ms)
            return {
                "content": result,
                "provider": "bedrock",
                "latency_ms": latency_ms,
            }
        except Exception as e:
            bedrock_error = str(e)
            latency_ms = int((time.time() - start) * 1000)
            self._log_request(task_type, "bedrock", "error", latency_ms)
            logger.warning(f"Bedrock failed for {task_type}: {bedrock_error}")

        # Fallback to OpenRouter
        start = time.time()
        openrouter_error = None
        try:
            result = await self._call_openrouter(
                task_type, prompt, image_data, system_prompt
            )
            latency_ms = int((time.time() - start) * 1000)
            self._log_request(task_type, "openrouter", "success", latency_ms)
            return {
                "content": result,
                "provider": "openrouter",
                "latency_ms": latency_ms,
            }
        except Exception as e:
            openrouter_error = str(e)
            latency_ms = int((time.time() - start) * 1000)
            self._log_request(task_type, "openrouter", "error", latency_ms)
            logger.error(
                f"OpenRouter also failed for {task_type}: {openrouter_error}"
            )

        # Both failed
        raise LLMRouterError(
            f"Both providers failed for {task_type}. "
            f"Bedrock: {bedrock_error}. OpenRouter: {openrouter_error}.",
            bedrock_error=bedrock_error,
            openrouter_error=openrouter_error,
        )

    # ─── Bedrock Client ───────────────────────────────────────────────────

    async def _call_bedrock_with_retry(
        self,
        task_type: str,
        prompt: str,
        image_data: Optional[str],
        system_prompt: Optional[str],
    ) -> str:
        """
        Call Bedrock with exponential backoff retry (up to max_retries attempts).

        Retries on AWS service errors (throttling, 5xx, connection errors).
        Uses the configured bedrock_timeout_ms for each individual attempt.
        """
        max_retries = self.settings.max_retries
        base_delay_ms = self.settings.retry_base_delay_ms
        last_error: Optional[Exception] = None

        for attempt in range(max_retries):
            try:
                return await self._call_bedrock(
                    task_type, prompt, image_data, system_prompt
                )
            except (ClientError, BotoCoreError, BotoConnectionError, ReadTimeoutError) as e:
                last_error = e
                if attempt < max_retries - 1:
                    # Exponential backoff: base * 2^attempt (in seconds)
                    delay_s = (base_delay_ms / 1000.0) * (2 ** attempt)
                    logger.info(
                        f"Bedrock retry {attempt + 1}/{max_retries} for {task_type} "
                        f"after {delay_s:.1f}s delay. Error: {e}"
                    )
                    await asyncio.sleep(delay_s)
            except asyncio.TimeoutError as e:
                last_error = e
                # Timeout errors are not retried — fall through to OpenRouter
                break
            except Exception as e:
                # Non-retryable errors break immediately
                last_error = e
                break

        raise last_error  # type: ignore[misc]

    async def _call_bedrock(
        self,
        task_type: str,
        prompt: str,
        image_data: Optional[str],
        system_prompt: Optional[str],
    ) -> str:
        """
        Call Amazon Bedrock with the appropriate model for the task type.

        Uses the Converse API for Claude models via bedrock-runtime.
        Wraps the synchronous boto3 call in asyncio.to_thread for async support.
        Enforces the configured bedrock_timeout_ms.
        """
        model_id = self._get_bedrock_model(task_type)
        timeout_s = self.settings.bedrock_timeout_ms / 1000.0

        # Build the messages payload
        messages = self._build_bedrock_messages(prompt, image_data)

        # Build request kwargs
        invoke_kwargs: dict = {
            "modelId": model_id,
            "messages": messages,
        }

        if system_prompt:
            invoke_kwargs["system"] = [{"text": system_prompt}]

        # Run synchronous boto3 call in a thread with timeout
        result = await asyncio.wait_for(
            asyncio.to_thread(self._invoke_bedrock, invoke_kwargs),
            timeout=timeout_s,
        )

        return result

    def _invoke_bedrock(self, invoke_kwargs: dict) -> str:
        """Synchronous Bedrock invocation using the Converse API."""
        response = self.bedrock_client.converse(**invoke_kwargs)

        # Extract text from the response
        output = response.get("output", {})
        message = output.get("message", {})
        content_blocks = message.get("content", [])

        texts = []
        for block in content_blocks:
            if "text" in block:
                texts.append(block["text"])

        if not texts:
            raise ValueError("Bedrock returned empty response content")

        return "\n".join(texts)

    def _build_bedrock_messages(
        self, prompt: str, image_data: Optional[str]
    ) -> list:
        """Build the messages array for Bedrock Converse API."""
        content: list = []

        if image_data:
            # Add image content block for vision tasks
            content.append(
                {
                    "image": {
                        "format": "png",
                        "source": {"bytes": self._decode_base64(image_data)},
                    }
                }
            )

        content.append({"text": prompt})

        return [{"role": "user", "content": content}]

    # ─── OpenRouter Client ────────────────────────────────────────────────

    async def _call_openrouter(
        self,
        task_type: str,
        prompt: str,
        image_data: Optional[str],
        system_prompt: Optional[str],
    ) -> str:
        """
        Call OpenRouter API as fallback with the appropriate model.

        Uses httpx.AsyncClient with the configured openrouter_timeout_ms.
        Follows the OpenAI-compatible chat completions API format.
        """
        model_id = self._get_openrouter_model(task_type)
        timeout_s = self.settings.openrouter_timeout_ms / 1000.0

        # Build messages
        messages = self._build_openrouter_messages(prompt, image_data, system_prompt)

        # Build request payload
        payload = {
            "model": model_id,
            "messages": messages,
        }

        headers = {
            "Authorization": f"Bearer {self.settings.openrouter_api_key}",
            "Content-Type": "application/json",
        }

        response = await self.http_client.post(
            "/chat/completions",
            json=payload,
            headers=headers,
            timeout=timeout_s,
        )

        if response.status_code != 200:
            raise httpx.HTTPStatusError(
                f"OpenRouter returned status {response.status_code}: {response.text}",
                request=response.request,
                response=response,
            )

        data = response.json()
        choices = data.get("choices", [])
        if not choices:
            raise ValueError("OpenRouter returned empty choices")

        content = choices[0].get("message", {}).get("content", "")
        if not content:
            raise ValueError("OpenRouter returned empty content")

        return content

    def _build_openrouter_messages(
        self,
        prompt: str,
        image_data: Optional[str],
        system_prompt: Optional[str],
    ) -> list:
        """Build the messages array for OpenRouter (OpenAI-compatible format)."""
        messages = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        if image_data:
            # Multimodal message with image
            messages.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_data}"
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            )
        else:
            messages.append({"role": "user", "content": prompt})

        return messages

    # ─── Helpers ──────────────────────────────────────────────────────────

    def _get_bedrock_model(self, task_type: str) -> str:
        """Get the Bedrock model ID for the given task type."""
        model_map = {
            "vision": self.settings.bedrock_vision_model,
            "quest": self.settings.bedrock_quest_model,
            "moderation": self.settings.bedrock_moderation_model,
        }
        return model_map.get(task_type, self.settings.bedrock_quest_model)

    def _get_openrouter_model(self, task_type: str) -> str:
        """Get the OpenRouter model ID for the given task type."""
        model_map = {
            "vision": self.settings.openrouter_vision_model,
            "quest": self.settings.openrouter_quest_model,
            "moderation": self.settings.openrouter_moderation_model,
        }
        return model_map.get(task_type, self.settings.openrouter_quest_model)

    def _log_request(
        self, task_type: str, provider: str, status: str, latency_ms: int
    ) -> None:
        """Log each LLM request with provider, task type, status, and latency."""
        logger.info(
            f"LLM Request: provider={provider} task={task_type} "
            f"status={status} latency_ms={latency_ms}"
        )

    @staticmethod
    def _decode_base64(data: str) -> bytes:
        """Decode a base64 string to bytes."""
        import base64

        return base64.b64decode(data)


# Module-level convenience instance
_router: Optional[LLMRouter] = None


def get_router() -> LLMRouter:
    """Get or create the singleton LLM router instance."""
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router


# Convenience async functions matching task types
async def vision_analysis(
    prompt: str,
    image_data: Optional[str] = None,
    system_prompt: Optional[str] = None,
) -> dict:
    """Route a vision analysis request through the LLM Router."""
    return await get_router().vision_analysis(prompt, image_data, system_prompt)


async def quest_generation(
    prompt: str,
    image_data: Optional[str] = None,
    system_prompt: Optional[str] = None,
) -> dict:
    """Route a quest generation request through the LLM Router."""
    return await get_router().quest_generation(prompt, image_data, system_prompt)


async def content_moderation(
    prompt: str,
    image_data: Optional[str] = None,
    system_prompt: Optional[str] = None,
) -> dict:
    """Route a content moderation request through the LLM Router."""
    return await get_router().content_moderation(prompt, image_data, system_prompt)
