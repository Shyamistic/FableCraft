"""
Animation Service.
Uses Amazon Nova Reel (amazon.nova-reel-v1:0) to generate short character
intro videos and animated scene clips.

Nova Reel is an async API: you submit a job and poll until it completes.
Output is written directly to an S3 bucket you own (NOVA_REEL_OUTPUT_BUCKET).

Prerequisites (one-time setup):
  1. Bedrock console → Model access → enable "Amazon Nova Reel"
  2. Set NOVA_REEL_ENABLED=true in .env
  3. Set NOVA_REEL_OUTPUT_BUCKET=<your-s3-bucket> (must be in us-east-1)

Typical generation time: 60-90 seconds for a 6-second clip.
"""

import asyncio
import json
import logging
import uuid
from typing import Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class AnimationUnavailableError(Exception):
    """Raised when Nova Reel is disabled or not accessible."""
    pass


class AnimationJobError(Exception):
    """Raised when a Nova Reel job fails."""
    pass


class AnimationService:
    """Generates short character animation videos via Amazon Nova Reel."""

    # Max seconds to wait for a Nova Reel job before giving up
    _JOB_TIMEOUT_SECONDS = 180
    _POLL_INTERVAL_SECONDS = 8

    def __init__(self):
        from config import settings
        self.settings = settings
        self._bedrock = boto3.client(
            "bedrock-runtime", region_name=settings.aws_region
        )
        self._s3 = boto3.client("s3", region_name=settings.aws_region)

    # ─── Public API ──────────────────────────────────────────────────────────

    async def generate_character_intro(
        self,
        character_name: str,
        character_description: str,
        genre: str,
        session_id: str,
    ) -> Optional[str]:
        """
        Generate a 6-second character introduction animation.

        Returns the S3 URL of the generated .mp4, or None if Nova Reel
        is disabled / times out (caller falls back to static image).

        Args:
            character_name: e.g. "Captain Blob"
            character_description: visual description from the drawing analysis
            genre: one of fantasy_kingdom | outer_space | underwater_world | jungle_safari
            session_id: used to namespace the S3 output key
        """
        if not self.settings.nova_reel_enabled:
            return None
        if not self.settings.nova_reel_output_bucket:
            logger.warning("NOVA_REEL_OUTPUT_BUCKET not set — skipping animation")
            return None

        genre_mood = {
            "fantasy_kingdom": "magical glowing forest with fireflies, soft golden light",
            "outer_space": "swirling nebula background, twinkling stars, deep space",
            "underwater_world": "shimmering ocean light, bubbles floating upward, coral reef",
            "jungle_safari": "lush green jungle, dappled sunlight through leaves, tropical",
        }.get(genre, "storybook whimsical background")

        prompt = (
            f"A cute, friendly animated character named {character_name} "
            f"({character_description}) appears in a {genre_mood}. "
            f"The character waves and smiles warmly at the viewer, then strikes "
            f"a heroic pose. Soft watercolor storybook art style, child-friendly, "
            f"no text, no violence, warm pastel colors, smooth animation."
        )

        output_key = f"{session_id}/intro-{uuid.uuid4()}.mp4"
        s3_uri = f"s3://{self.settings.nova_reel_output_bucket}/{output_key}"

        try:
            invocation_arn = await self._start_job(prompt, s3_uri)
            video_s3_uri = await self._wait_for_job(invocation_arn)
            public_url = self._s3_uri_to_url(video_s3_uri)
            logger.info(f"Nova Reel intro generated: {public_url}")
            return public_url
        except AnimationUnavailableError:
            return None
        except Exception as e:
            logger.warning(f"Nova Reel intro failed, falling back to static: {e}")
            return None

    async def generate_character_poses(
        self,
        image_provider,
        character_description: str,
        genre: str,
    ) -> dict:
        """
        Generate 3 character pose images (neutral, talking, happy) via Nova Canvas.
        Used for the frontend lip-sync talking animation.

        Returns:
            {
                "neutral": "<url>",
                "talking": "<url>",
                "happy":   "<url>",
            }
        All keys present; any failed pose falls back to None (frontend uses CSS).
        """
        base_prompt = (
            f"Cute cartoon storybook character: {character_description}. "
            f"Child-friendly, soft watercolor style, white background, "
            f"full body portrait, no text."
        )

        poses = {
            "neutral": f"{base_prompt} Character standing calmly, neutral expression.",
            "talking": f"{base_prompt} Character with mouth open mid-speech, animated gesture.",
            "happy": f"{base_prompt} Character grinning widely, arms raised in excitement.",
        }

        results = {}
        for pose_name, pose_prompt in poses.items():
            try:
                image_bytes = await image_provider.generate(
                    prompt=pose_prompt,
                    width=512,
                    height=512,
                )
                results[pose_name] = image_bytes
            except Exception as e:
                logger.warning(f"Pose '{pose_name}' generation failed: {e}")
                results[pose_name] = None

        return results

    # ─── Nova Reel internals ─────────────────────────────────────────────────

    async def _start_job(self, prompt: str, output_s3_uri: str) -> str:
        """Submit a Nova Reel async job and return the invocation ARN."""
        model_id = self.settings.nova_reel_model

        request_body = json.dumps({
            "taskType": "TEXT_VIDEO",
            "textToVideoParams": {
                "text": prompt[:512],
            },
            "videoGenerationConfig": {
                "durationSeconds": 6,
                "fps": 24,
                "dimension": "1280x720",
                "seed": 42,
            },
        })

        def _invoke():
            return self._bedrock.start_async_invoke(
                modelId=model_id,
                modelInput=json.loads(request_body),
                outputDataConfig={"s3OutputDataConfig": {"s3Uri": output_s3_uri}},
            )

        try:
            response = await asyncio.to_thread(_invoke)
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code == "AccessDeniedException":
                raise AnimationUnavailableError(
                    "Nova Reel: model access not granted. "
                    "Enable it at Bedrock console → Model access."
                )
            raise

        invocation_arn = response.get("invocationArn")
        if not invocation_arn:
            raise AnimationJobError("Nova Reel: no invocationArn in response")

        logger.info(f"Nova Reel job started: {invocation_arn}")
        return invocation_arn

    async def _wait_for_job(self, invocation_arn: str) -> str:
        """
        Poll the Nova Reel job until completion.
        Returns the S3 URI of the generated video.
        Raises AnimationJobError on failure or timeout.
        """
        elapsed = 0

        while elapsed < self._JOB_TIMEOUT_SECONDS:
            await asyncio.sleep(self._POLL_INTERVAL_SECONDS)
            elapsed += self._POLL_INTERVAL_SECONDS

            def _get_status():
                return self._bedrock.get_async_invoke(
                    invocationArn=invocation_arn
                )

            try:
                status_response = await asyncio.to_thread(_get_status)
            except Exception as e:
                logger.warning(f"Nova Reel status check failed: {e}")
                continue

            status = status_response.get("status", "")
            logger.debug(f"Nova Reel job status ({elapsed}s): {status}")

            if status == "Completed":
                output_uri = (
                    status_response
                    .get("outputDataConfig", {})
                    .get("s3OutputDataConfig", {})
                    .get("s3Uri", "")
                )
                if not output_uri:
                    raise AnimationJobError("Nova Reel completed but no output S3 URI")
                # Nova Reel writes to a subfolder; find the .mp4
                return self._resolve_video_s3_uri(output_uri)

            if status == "Failed":
                failure_msg = status_response.get("failureMessage", "unknown error")
                raise AnimationJobError(f"Nova Reel job failed: {failure_msg}")

        raise AnimationJobError(
            f"Nova Reel job timed out after {self._JOB_TIMEOUT_SECONDS}s"
        )

    def _resolve_video_s3_uri(self, output_uri: str) -> str:
        """
        Nova Reel writes output/{invocationId}/output.mp4 under the S3 prefix.
        Given the base output S3 URI, list the bucket to find the .mp4 file.
        """
        # output_uri format: s3://bucket/prefix/
        if output_uri.startswith("s3://"):
            without_scheme = output_uri[5:]
            bucket, _, prefix = without_scheme.partition("/")
        else:
            return output_uri  # fallback: return as-is

        try:
            resp = self._s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
            for obj in resp.get("Contents", []):
                key = obj.get("Key", "")
                if key.endswith(".mp4"):
                    return f"s3://{bucket}/{key}"
        except Exception as e:
            logger.warning(f"Could not list Nova Reel output objects: {e}")

        return output_uri

    def _s3_uri_to_url(self, s3_uri: str) -> str:
        """Convert s3://bucket/key to a public HTTPS URL (CloudFront or direct S3)."""
        if not s3_uri.startswith("s3://"):
            return s3_uri

        without_scheme = s3_uri[5:]
        bucket, _, key = without_scheme.partition("/")

        if self.settings.cloudfront_domain:
            return f"https://{self.settings.cloudfront_domain}/{key}"

        region = self.settings.aws_region
        return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
