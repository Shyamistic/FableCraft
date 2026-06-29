"""
Scene Illustrator Service.
Generates scene illustrations in batches via Amazon Bedrock image generation.
Maintains character consistency and applies genre-specific visual styles.
"""

import asyncio
import base64
import json
import logging
import uuid
from typing import List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from models import Genre
from storage_service import StorageService

logger = logging.getLogger(__name__)

# Placeholder image URL used when all retries are exhausted for a scene
PLACEHOLDER_IMAGE_URL = "https://placehold.co/1024x576/e2e8f0/64748b?text=Scene+Illustration+Unavailable"

# Genre-themed placeholder backgrounds (used when image generation is unavailable).
# Soft, on-brand colors so the storybook still looks intentional and cute.
GENRE_PLACEHOLDERS = {
    "fantasy_kingdom": ("F3E8FF", "8B5CF6", "Fantasy Kingdom"),
    "outer_space": ("E0F2FE", "0EA5E9", "Outer Space"),
    "underwater_world": ("CFFAFE", "06B6D4", "Underwater World"),
    "jungle_safari": ("DCFCE7", "16A34A", "Jungle Safari"),
}


def themed_placeholder(genre, scene_number: int = 0) -> str:
    """Build a soft, genre-themed placeholder image URL."""
    genre_value = genre.value if hasattr(genre, "value") else str(genre)
    bg, fg, label = GENRE_PLACEHOLDERS.get(
        genre_value, ("F3E8FF", "8B5CF6", "Storybook")
    )
    import urllib.parse

    text = urllib.parse.quote(f"{label}\nScene {scene_number}" if scene_number else label)
    return f"https://placehold.co/1024x576/{bg}/{fg}?text={text}&font=poppins"


class SceneIllustrationError(Exception):
    """Raised when scene illustration generation fails."""

    pass


class SceneIllustrator:
    """Generates storybook-style illustrations for quest scenes."""

    def __init__(self):
        from config import settings

        self.settings = settings
        self._bedrock_client = boto3.client(
            "bedrock-runtime", region_name=settings.aws_region
        )
        self._storage = StorageService()
        from image_provider import ImageProvider

        self._image_provider = ImageProvider()

    # Safety negative prompt for all scene illustrations
    SAFETY_NEGATIVE_PROMPT = (
        "violence, weapons, blood, gore, horror, death, "
        "adult content, frightening, scary, nudity, drugs, alcohol, "
        "sexually explicit content, dark themes, monsters"
    )

    # Genre-specific visual style prompts
    GENRE_STYLES = {
        "fantasy_kingdom": (
            "watercolor style, magical kingdom, fairytale, soft colors, "
            "enchanted forest, castle turrets, glowing lanterns, whimsical"
        ),
        "outer_space": (
            "bold digital art, cosmic, stars, planets, futuristic, "
            "vibrant colors, nebulae, spacecraft, glowing elements"
        ),
        "underwater_world": (
            "soft pastels, ocean, coral reef, bubbles, aquatic, "
            "serene blue tones, sea creatures, shimmering light rays"
        ),
        "jungle_safari": (
            "lush greens, tropical, wildlife, adventure, "
            "warm earth tones, exotic plants, dappled sunlight"
        ),
    }

    # Maximum retries per scene
    MAX_RETRIES_PER_SCENE = 3

    def _get_genre_style(self, genre: Genre) -> str:
        """Get the visual style prompt for a genre."""
        genre_value = genre.value if isinstance(genre, Genre) else genre
        return self.GENRE_STYLES.get(genre_value, self.GENRE_STYLES["fantasy_kingdom"])

    def _build_scene_prompt(
        self,
        narrative: str,
        character_description: str,
        character_type: str,
        genre: Genre,
    ) -> str:
        """
        Build the positive prompt for a scene illustration.

        Includes:
        - Scene narrative for context
        - Character description for visual consistency
        - Genre-specific visual style
        - Child-friendly storybook art direction
        """
        genre_style = self._get_genre_style(genre)

        prompt = (
            f"A child-friendly storybook illustration in 16:9 widescreen format. "
            f"Scene: {narrative} "
            f"Main character: {character_description} (a {character_type}). "
            f"The character must be clearly visible and recognizable in the scene. "
            f"Visual style: {genre_style}. "
            f"Art direction: colorful, warm, inviting, rounded shapes, "
            f"soft lighting, suitable for children ages 4-8, "
            f"storybook quality, detailed background, "
            f"consistent character appearance throughout."
        )
        return prompt

    def _build_request_body(self, prompt: str) -> str:
        """
        Build the request body for Bedrock image generation.

        Uses Stability AI SDXL model format with 16:9 aspect ratio (1024x576).
        """
        request_body = {
            "text_prompts": [
                {"text": prompt, "weight": 1.0},
                {"text": self.SAFETY_NEGATIVE_PROMPT, "weight": -1.0},
            ],
            "cfg_scale": 7,
            "steps": 50,
            "seed": 0,
            "width": 1024,
            "height": 576,
            "samples": 1,
        }
        return json.dumps(request_body)

    async def _invoke_bedrock(self, prompt: str) -> bytes:
        """
        Generate a scene illustration via the configured image provider
        (Bedrock when available, otherwise Pollinations).

        Args:
            prompt: The positive text prompt for generation.

        Returns:
            Raw image bytes (16:9).

        Raises:
            SceneIllustrationError: If no provider could produce an image.
        """
        from image_provider import ImageGenerationUnavailable

        try:
            return await self._image_provider.generate(
                prompt=prompt,
                width=1024,
                height=576,
                negative_prompt=self.SAFETY_NEGATIVE_PROMPT,
            )
        except ImageGenerationUnavailable as e:
            raise SceneIllustrationError(str(e))
        except Exception as e:  # noqa: BLE001
            raise SceneIllustrationError(f"Scene illustration failed: {e}")

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
            logger.error(f"Bedrock scene illustration failed: {e}")
            raise SceneIllustrationError(f"Scene illustration failed: {e}")

        # Check for content filter blocking
        if response_body.get("result") == "filtered":
            raise SceneIllustrationError(
                "Content safety filter blocked the scene illustration."
            )

        # Extract image artifacts
        artifacts = response_body.get("artifacts", [])
        if not artifacts:
            raise SceneIllustrationError(
                "No image artifacts returned from generation model."
            )

        artifact = artifacts[0]

        # Check individual artifact finish reason
        finish_reason = artifact.get("finishReason", "")
        if finish_reason == "CONTENT_FILTERED":
            raise SceneIllustrationError(
                "Content safety filter blocked the scene illustration."
            )

        if finish_reason == "ERROR":
            raise SceneIllustrationError(
                "Image generation model returned an error for the scene."
            )

        # Decode the base64 image data
        image_b64 = artifact.get("base64", "")
        if not image_b64:
            raise SceneIllustrationError(
                "No base64 image data in generation response."
            )

        image_bytes = base64.b64decode(image_b64)
        return image_bytes

    async def _generate_single_scene(
        self,
        scene: dict,
        character_description: str,
        character_type: str,
        genre: Genre,
        session_id: str,
    ) -> dict:
        """
        Generate illustration for a single scene with retry logic.

        Retries up to 3 times on failure. If all retries are exhausted,
        returns a placeholder URL instead of failing.

        Args:
            scene: Scene dict with 'narrative' and 'scene_number'
            character_description: Character description for consistency
            character_type: Type of character (bunny, dragon, etc.)
            genre: Story genre for visual style
            session_id: Current session identifier

        Returns:
            dict with 'scene_number' and 'image_url'
        """
        scene_number = scene.get("scene_number", 0)
        narrative = scene.get("narrative", "")

        prompt = self._build_scene_prompt(
            narrative=narrative,
            character_description=character_description,
            character_type=character_type,
            genre=genre,
        )

        last_error: Optional[Exception] = None

        for attempt in range(self.MAX_RETRIES_PER_SCENE):
            try:
                image_bytes = await self._invoke_bedrock(prompt)

                # Upload to S3
                image_id = str(uuid.uuid4())
                image_url = await self._storage.upload_bytes(
                    data=image_bytes,
                    filename=f"scene-{scene_number}-{image_id}.png",
                    content_type="image/png",
                    session_id=session_id,
                )

                logger.info(
                    f"Scene {scene_number} illustration generated successfully "
                    f"(attempt {attempt + 1})"
                )

                return {
                    "scene_number": scene_number,
                    "image_url": image_url,
                }

            except SceneIllustrationError as e:
                last_error = e
                # If image generation is globally unavailable (no provider),
                # don't waste time retrying — go straight to the themed placeholder.
                msg = str(e).lower()
                if "all image providers failed" in msg or "unavailable" in msg:
                    logger.warning(
                        f"Scene {scene_number}: image generation unavailable, "
                        f"using placeholder immediately"
                    )
                    break
                if attempt < self.MAX_RETRIES_PER_SCENE - 1:
                    delay = 1.0 * (2 ** attempt)  # Exponential backoff
                    logger.warning(
                        f"Scene {scene_number} illustration failed "
                        f"(attempt {attempt + 1}/{self.MAX_RETRIES_PER_SCENE}), "
                        f"retrying in {delay:.1f}s: {e}"
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        f"Scene {scene_number} illustration failed after "
                        f"{self.MAX_RETRIES_PER_SCENE} attempts: {e}"
                    )

        # All retries exhausted — use a soft, genre-themed placeholder
        logger.warning(
            f"Scene {scene_number} using placeholder after all retries exhausted. "
            f"Last error: {last_error}"
        )
        return {
            "scene_number": scene_number,
            "image_url": themed_placeholder(genre, scene_number),
        }

    async def _generate_batch(
        self,
        scenes: List[dict],
        character_description: str,
        character_type: str,
        genre: Genre,
        session_id: str,
    ) -> List[dict]:
        """
        Generate illustrations for a batch of scenes concurrently.

        Args:
            scenes: List of scene dicts in the batch
            character_description: Character description for consistency
            character_type: Type of character
            genre: Story genre
            session_id: Current session identifier

        Returns:
            List of dicts with 'scene_number' and 'image_url'
        """
        tasks = [
            self._generate_single_scene(
                scene=scene,
                character_description=character_description,
                character_type=character_type,
                genre=genre,
                session_id=session_id,
            )
            for scene in scenes
        ]

        results = await asyncio.gather(*tasks)
        return list(results)

    async def illustrate_scenes(
        self,
        scenes: List[dict],
        character_description: str,
        character_type: str,
        genre: Genre,
        session_id: str,
    ) -> List[dict]:
        """
        Generate illustrations for quest scenes in batches.

        Batch processing: scenes 1-4 first, then scenes 5-8.
        Each batch is processed concurrently within itself.

        Args:
            scenes: List of scene dicts with 'narrative' and 'scene_number'
            character_description: Full character description for visual consistency
            character_type: Type of character (e.g., 'bunny', 'dragon')
            genre: Story genre for visual style
            session_id: Current session identifier

        Returns:
            List of dicts with 'scene_number' and 'image_url' for all 8 scenes.
            Some may have placeholder URLs if generation failed.
        """
        if not scenes:
            return []

        # Split into two batches: scenes 1-4 and scenes 5-8
        batch_1 = [s for s in scenes if s.get("scene_number", 0) <= 4]
        batch_2 = [s for s in scenes if s.get("scene_number", 0) > 4]

        logger.info(
            f"Starting scene illustration: batch 1 ({len(batch_1)} scenes), "
            f"batch 2 ({len(batch_2)} scenes)"
        )

        # Process batch 1 first
        results_batch_1 = await self._generate_batch(
            scenes=batch_1,
            character_description=character_description,
            character_type=character_type,
            genre=genre,
            session_id=session_id,
        )

        logger.info(f"Batch 1 complete ({len(results_batch_1)} scenes)")

        # Process batch 2
        results_batch_2 = await self._generate_batch(
            scenes=batch_2,
            character_description=character_description,
            character_type=character_type,
            genre=genre,
            session_id=session_id,
        )

        logger.info(f"Batch 2 complete ({len(results_batch_2)} scenes)")

        # Combine and sort by scene number
        all_results = results_batch_1 + results_batch_2
        all_results.sort(key=lambda r: r["scene_number"])

        return all_results
