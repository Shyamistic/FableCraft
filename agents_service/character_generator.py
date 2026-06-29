"""
Character Generator Service.
Generates animated character images via Amazon Bedrock image generation
(Titan Image Generator or Stability AI).
Applies child-safety content filters via negative prompts.
"""

import asyncio
import base64
import json
import logging
import uuid
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from storage_service import StorageService

logger = logging.getLogger(__name__)


class CharacterGenerator:
    """Generates animated character images from drawing analysis."""

    def __init__(self):
        from config import settings

        self.settings = settings
        self._bedrock_client = boto3.client(
            "bedrock-runtime", region_name=settings.aws_region
        )
        from image_provider import ImageProvider

        self._image_provider = ImageProvider()

    # Safety negative prompt applied to all character generation requests
    SAFETY_NEGATIVE_PROMPT = (
        "violence, weapons, gore, horror, scary monsters, "
        "sexually explicit content, drugs, alcohol, blood, "
        "death, nudity, frightening, dark themes"
    )

    def _build_prompt(
        self,
        character_description: str,
        character_type: str,
        colors: list,
        artistic_style: str,
        mood: str,
    ) -> str:
        """
        Build the positive prompt for character image generation.

        Constructs a detailed prompt emphasizing child-friendly, colorful,
        animated cartoon style.
        """
        color_str = ", ".join(colors) if colors else "colorful"
        prompt = (
            f"A cute, friendly, colorful animated cartoon character: "
            f"{character_description}. "
            f"Character type: {character_type}. "
            f"Colors: {color_str}. "
            f"Art style: {artistic_style}, child-friendly cartoon, rounded shapes, "
            f"soft lighting, storybook illustration. "
            f"Mood: {mood}. "
            f"High quality, centered composition, solid white background, "
            f"single character, full body, PNG style with clean edges."
        )
        return prompt

    def _build_request_body(self, prompt: str) -> str:
        """
        Build the request body for Bedrock image generation.

        Supports Stability AI SDXL model format.
        Requests 512x512 minimum resolution PNG output.
        """
        request_body = {
            "text_prompts": [
                {"text": prompt, "weight": 1.0},
                {"text": self.SAFETY_NEGATIVE_PROMPT, "weight": -1.0},
            ],
            "cfg_scale": 7,
            "steps": 50,
            "seed": 0,
            "width": 512,
            "height": 512,
            "samples": 1,
        }
        return json.dumps(request_body)

    async def _invoke_bedrock(self, prompt: str) -> bytes:
        """
        Generate a character image via the configured image provider
        (Bedrock when available, otherwise Pollinations).

        Args:
            prompt: The positive text prompt for generation.

        Returns:
            Raw image bytes (PNG/JPEG).

        Raises:
            GenerationFailedError: If no provider could produce an image.
        """
        from image_provider import ImageGenerationUnavailable

        try:
            return await self._image_provider.generate(
                prompt=prompt,
                width=512,
                height=512,
                negative_prompt=self.SAFETY_NEGATIVE_PROMPT,
            )
        except ImageGenerationUnavailable as e:
            logger.warning(f"Character image generation unavailable: {e}")
            raise GenerationFailedError(str(e))
        except Exception as e:  # noqa: BLE001
            logger.error(f"Character image generation failed: {e}")
            raise GenerationFailedError(f"Image generation failed: {e}")

    async def _invoke_bedrock_legacy(self, prompt: str) -> bytes:
        """Deprecated direct Bedrock path (kept for reference/tests)."""
        request_body = self._build_request_body(prompt)
        model_id = self.settings.bedrock_image_model

        def _call_bedrock():
            response = self._bedrock_client.invoke_model(
                modelId=model_id,
                contentType="application/json",
                accept="application/json",
                body=request_body,
            )
            return json.loads(response["body"].read())

        try:
            response_body = await asyncio.to_thread(_call_bedrock)
        except (BotoCoreError, ClientError) as e:
            logger.error(f"Bedrock image generation failed: {e}")
            raise GenerationFailedError(f"Image generation failed: {e}")

        # Check for content filter blocking
        if response_body.get("result") == "filtered":
            raise ContentFilteredError(
                "Content safety filter blocked the generated image."
            )

        # Extract image artifacts
        artifacts = response_body.get("artifacts", [])
        if not artifacts:
            raise GenerationFailedError(
                "No image artifacts returned from generation model."
            )

        artifact = artifacts[0]

        # Check individual artifact finish reason for content filtering
        finish_reason = artifact.get("finishReason", "")
        if finish_reason == "CONTENT_FILTERED":
            raise ContentFilteredError(
                "Content safety filter blocked the generated image."
            )

        if finish_reason == "ERROR":
            raise GenerationFailedError(
                "Image generation model returned an error for the artifact."
            )

        # Decode the base64 image data
        image_b64 = artifact.get("base64", "")
        if not image_b64:
            raise GenerationFailedError(
                "No base64 image data in generation response."
            )

        image_bytes = base64.b64decode(image_b64)
        return image_bytes

    async def generate_character(
        self,
        character_description: str,
        character_type: str,
        colors: list,
        artistic_style: str,
        mood: str,
        session_id: str,
    ) -> dict:
        """
        Generate an animated character image.

        Args:
            character_description: Full text description of the character
            character_type: Type of character (bunny, dragon, etc.)
            colors: List of colors from the original drawing
            artistic_style: Art style (whimsical, bold, etc.)
            mood: Character mood (happy, curious, etc.)
            session_id: Current session identifier

        Returns:
            dict with 'image_url' (S3/CDN URL) and 'image_id' (UUID)

        Raises:
            GenerationFailedError if image generation fails after retry
            ContentFilteredError if safety filter blocks generation
        """
        prompt = self._build_prompt(
            character_description, character_type, colors, artistic_style, mood
        )

        # Attempt generation with one automatic retry on failure
        image_bytes: Optional[bytes] = None
        last_error: Optional[Exception] = None

        for attempt in range(2):  # Max 2 attempts (initial + 1 retry)
            try:
                image_bytes = await self._invoke_bedrock(prompt)
                break
            except ContentFilteredError:
                # Do not retry content filter blocks - raise immediately
                raise
            except GenerationFailedError as e:
                last_error = e
                if attempt == 0:
                    logger.warning(
                        f"Character generation failed on attempt 1, retrying: {e}"
                    )
                    await asyncio.sleep(1.0)  # Brief delay before retry
                else:
                    logger.error(
                        f"Character generation failed on attempt 2: {e}"
                    )

        if image_bytes is None:
            raise GenerationFailedError(
                f"Character generation failed after 2 attempts: {last_error}"
            )

        # Store generated image in S3 with UUID linked to session
        image_id = str(uuid.uuid4())
        storage = StorageService()

        image_url = await storage.upload_bytes(
            data=image_bytes,
            filename=f"{image_id}.png",
            content_type="image/png",
            session_id=session_id,
        )

        logger.info(
            f"Character generated successfully: image_id={image_id}, "
            f"session_id={session_id}"
        )

        return {
            "image_url": image_url,
            "image_id": image_id,
        }


class GenerationFailedError(Exception):
    """Raised when image generation fails after all retries."""

    pass


class ContentFilteredError(Exception):
    """Raised when content safety filter blocks the generated image."""

    pass
