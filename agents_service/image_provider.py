"""
Multi-provider image generation.

Generates images via the first available provider, in priority order:
  1. Amazon Bedrock (Nova Canvas / Stability / Titan) - best quality, used in
     production. Becomes available once the AWS account has a verified payment
     instrument and model access.
  2. Pollinations.ai - free hosted image generation. Reliable when a token is
     configured (POLLINATIONS_TOKEN); the free tier without a token is heavily
     rate-limited.

If no provider succeeds, ImageGenerationUnavailable is raised and callers fall
back to a themed placeholder.

This abstraction means the rest of the app does not change as providers come
online: set IMAGE_PROVIDER and the relevant credentials and real images appear.
"""

import asyncio
import base64
import json
import logging
import urllib.parse

import boto3
import httpx
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


class ImageGenerationUnavailable(Exception):
    """Raised when no configured image provider could produce an image."""

    pass


class ImageProvider:
    """Generates raw image bytes using the best available provider."""

    def __init__(self):
        from config import settings

        self.settings = settings
        self._bedrock = boto3.client(
            "bedrock-runtime", region_name=settings.aws_region
        )

    # ─── Public API ──────────────────────────────────────────────────────────

    async def generate(
        self,
        prompt: str,
        width: int,
        height: int,
        negative_prompt: str = "",
        seed: int = 42,
    ) -> bytes:
        """
        Generate an image and return raw bytes (PNG/JPEG).

        Tries providers based on settings.image_provider. Raises
        ImageGenerationUnavailable if all configured providers fail.
        """
        provider = (self.settings.image_provider or "auto").lower()

        if provider == "placeholder":
            raise ImageGenerationUnavailable("Image provider set to placeholder")

        order = []
        if provider == "auto":
            # Nova Canvas takes priority when enabled (requires Bedrock model access)
            if self.settings.nova_canvas_enabled:
                order = ["nova_canvas", "clipdrop", "gemini", "bedrock", "pollinations"]
            else:
                order = ["clipdrop", "gemini", "bedrock", "pollinations"]
        elif provider == "nova_canvas":
            order = ["nova_canvas"]
        elif provider in ("clipdrop", "gemini", "bedrock", "pollinations"):
            order = [provider]
        else:
            order = ["clipdrop", "gemini", "bedrock", "pollinations"]

        last_error = None
        for name in order:
            try:
                if name == "nova_canvas":
                    return await self._invoke_nova_canvas(prompt, width, height, negative_prompt)
                if name == "clipdrop":
                    if not self.settings.clipdrop_api_key:
                        continue
                    return await self._invoke_clipdrop(prompt, width, height)
                if name == "gemini":
                    if not self.settings.gemini_api_key:
                        continue
                    return await self._invoke_gemini(prompt, width, height)
                if name == "bedrock":
                    return await self._invoke_bedrock(prompt, width, height, negative_prompt)
                if name == "pollinations":
                    return await self._invoke_pollinations(prompt, width, height, seed)
            except Exception as e:  # noqa: BLE001 - try next provider
                last_error = e
                logger.warning(f"Image provider '{name}' failed: {str(e)[:160]}")

        raise ImageGenerationUnavailable(
            f"All image providers failed. Last error: {last_error}"
        )

    # ─── ClipDrop (Stability AI) ─────────────────────────────────────────────

    async def _invoke_clipdrop(self, prompt: str, width: int, height: int) -> bytes:
        """Generate image via ClipDrop/Stability AI text-to-image API.
        Supports primary + fallback API key for credit exhaustion resilience."""
        keys = [k.strip() for k in self.settings.clipdrop_api_key.split(",") if k.strip()]
        if not keys:
            raise RuntimeError("No ClipDrop API key configured")

        last_error = None
        for api_key in keys:
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        "https://clipdrop-api.co/text-to-image/v1",
                        headers={"x-api-key": api_key},
                        files={"prompt": (None, prompt[:1000])},
                    )

                if resp.status_code == 429:
                    last_error = RuntimeError("ClipDrop rate limit exceeded")
                    continue
                if resp.status_code == 402:
                    logger.warning(f"ClipDrop key ...{api_key[-8:]} credits exhausted, trying next key")
                    last_error = RuntimeError("ClipDrop credits exhausted")
                    continue
                if resp.status_code != 200:
                    raise RuntimeError(
                        f"ClipDrop status {resp.status_code}: {resp.text[:150]}"
                    )

                content_type = resp.headers.get("content-type", "")
                if "image" not in content_type:
                    raise RuntimeError(f"ClipDrop returned non-image: {content_type}")

                return resp.content
            except RuntimeError as e:
                last_error = e
                continue

        raise last_error or RuntimeError("All ClipDrop keys failed")

    # ─── Gemini ────────────────────────────────────────────────────────────────

    async def _invoke_gemini(self, prompt: str, width: int, height: int) -> bytes:
        """Generate image via Google Gemini Flash Image API (free tier: 500/day)."""
        api_key = self.settings.gemini_api_key
        model = self.settings.gemini_image_model
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/"
            f"models/{model}:generateContent?key={api_key}"
        )

        # Build the prompt with size hint
        full_prompt = (
            f"{prompt} "
            f"The image should be {width}x{height} pixels, high quality."
        )

        payload = {
            "contents": [{"parts": [{"text": full_prompt}]}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
        }

        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(url, json=payload)

        if resp.status_code == 429:
            raise RuntimeError("Gemini rate limit exceeded (quota resets daily)")
        if resp.status_code != 200:
            raise RuntimeError(
                f"Gemini status {resp.status_code}: {resp.text[:150]}"
            )

        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise RuntimeError("Gemini returned no candidates")

        parts = candidates[0].get("content", {}).get("parts", [])
        for part in parts:
            if "inlineData" in part:
                import base64 as b64mod

                return b64mod.b64decode(part["inlineData"]["data"])

        raise RuntimeError("Gemini response contained no image data")

    # ─── Nova Canvas ───────────────────────────────────────────────────────────

    async def _invoke_nova_canvas(
        self, prompt: str, width: int, height: int, negative_prompt: str = ""
    ) -> bytes:
        """
        Generate image via Amazon Nova Canvas (amazon.nova-canvas-v1:0).
        Requires model access granted in Bedrock console (us-east-1).
        """
        model_id = self.settings.nova_canvas_model
        params: dict = {
            "taskType": "TEXT_IMAGE",
            "textToImageParams": {"text": prompt[:1024]},
            "imageGenerationConfig": {
                "numberOfImages": 1,
                "width": width,
                "height": height,
                "cfgScale": 7.0,
                "quality": "standard",
            },
        }
        if negative_prompt:
            params["textToImageParams"]["negativeText"] = negative_prompt[:1024]

        body = json.dumps(params)

        def _call():
            resp = self._bedrock.invoke_model(
                modelId=model_id,
                contentType="application/json",
                accept="application/json",
                body=body,
            )
            return json.loads(resp["body"].read())

        try:
            response_body = await asyncio.to_thread(_call)
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code == "AccessDeniedException":
                raise RuntimeError(
                    "Nova Canvas: model access not granted. "
                    "Enable it at Bedrock console → Model access."
                )
            raise

        images = response_body.get("images")
        if not images:
            raise RuntimeError("Nova Canvas returned no images")
        return base64.b64decode(images[0])

    # ─── Bedrock ───────────────────────────────────────────────────────────────

    def _build_bedrock_body(self, model_id: str, prompt: str, width: int, height: int, negative_prompt: str) -> str:
        """Build a request body matching the configured Bedrock image model family."""
        mid = model_id.lower()
        if "nova-canvas" in mid:
            params = {
                "taskType": "TEXT_IMAGE",
                "textToImageParams": {"text": prompt[:1024]},
                "imageGenerationConfig": {
                    "numberOfImages": 1,
                    "width": width,
                    "height": height,
                    "cfgScale": 7.0,
                },
            }
            if negative_prompt:
                params["textToImageParams"]["negativeText"] = negative_prompt[:1024]
            return json.dumps(params)
        if "titan-image" in mid:
            params = {
                "taskType": "TEXT_IMAGE",
                "textToImageParams": {"text": prompt[:512]},
                "imageGenerationConfig": {
                    "numberOfImages": 1,
                    "width": width,
                    "height": height,
                    "cfgScale": 8.0,
                },
            }
            if negative_prompt:
                params["textToImageParams"]["negativeText"] = negative_prompt[:512]
            return json.dumps(params)
        # Default: Stability SDXL text_prompts format
        text_prompts = [{"text": prompt, "weight": 1.0}]
        if negative_prompt:
            text_prompts.append({"text": negative_prompt, "weight": -1.0})
        return json.dumps(
            {
                "text_prompts": text_prompts,
                "cfg_scale": 7,
                "steps": 40,
                "seed": 0,
                "width": width,
                "height": height,
                "samples": 1,
            }
        )

    def _extract_bedrock_image(self, response_body: dict) -> bytes:
        """Extract base64 image bytes from a Bedrock image response."""
        # Nova Canvas / Titan: {"images": ["<b64>"]}
        images = response_body.get("images")
        if images:
            return base64.b64decode(images[0])
        # Stability: {"artifacts": [{"base64": "..."}]}
        artifacts = response_body.get("artifacts", [])
        if artifacts and artifacts[0].get("base64"):
            return base64.b64decode(artifacts[0]["base64"])
        raise ValueError("No image data in Bedrock response")

    async def _invoke_bedrock(self, prompt: str, width: int, height: int, negative_prompt: str) -> bytes:
        model_id = self.settings.bedrock_image_model
        body = self._build_bedrock_body(model_id, prompt, width, height, negative_prompt)

        def _call():
            resp = self._bedrock.invoke_model(
                modelId=model_id,
                contentType="application/json",
                accept="application/json",
                body=body,
            )
            return json.loads(resp["body"].read())

        try:
            response_body = await asyncio.to_thread(_call)
        except (BotoCoreError, ClientError) as e:
            raise RuntimeError(f"Bedrock image error: {e}")

        return self._extract_bedrock_image(response_body)

    # ─── Pollinations ────────────────────────────────────────────────────────

    async def _invoke_pollinations(self, prompt: str, width: int, height: int, seed: int) -> bytes:
        base = self.settings.pollinations_base_url.rstrip("/") + "/"
        encoded = urllib.parse.quote(prompt[:900])
        params = {
            "width": width,
            "height": height,
            "seed": seed,
            "nologo": "true",
            "model": self.settings.pollinations_model,
        }
        token = (self.settings.pollinations_token or "").strip()
        if token:
            params["token"] = token
        url = f"{base}{encoded}?{urllib.parse.urlencode(params)}"

        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(timeout=90.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                raise RuntimeError(
                    f"Pollinations status {resp.status_code}: {resp.text[:120]}"
                )
            content_type = resp.headers.get("content-type", "")
            if "image" not in content_type:
                raise RuntimeError(f"Pollinations returned non-image: {content_type}")
            return resp.content
