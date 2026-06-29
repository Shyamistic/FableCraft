"""
TTS Service.
Converts text to speech via Amazon Polly Neural voices.
Caches results per session to avoid regeneration within the same session.
"""

import hashlib
import logging
import asyncio
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


class TTSService:
    """Text-to-speech service using Amazon Polly Neural."""

    def __init__(self, storage_service=None):
        from config import settings

        self.settings = settings
        self._polly_client = boto3.client("polly", region_name=settings.aws_region)

        # Use injected storage_service or create a new one
        if storage_service is not None:
            self._storage_service = storage_service
        else:
            from storage_service import StorageService
            self._storage_service = StorageService()

        # In-memory cache: maps cache_key -> {audio_url, duration_seconds}
        self._cache: dict[str, dict] = {}

    def _get_cache_key(self, text: str, session_id: str) -> str:
        """Generate a cache key from text and session."""
        text_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
        return f"{session_id}:{text_hash}"

    def _build_ssml(self, text: str) -> str:
        """
        Wrap text in SSML with the configured speaking rate.

        The speaking rate is configured via settings (default 90%, range 85-100%).
        """
        rate = self.settings.polly_speaking_rate
        return f'<speak><prosody rate="{rate}">{text}</prosody></speak>'

    def _is_generative(self) -> bool:
        """Whether the configured engine is the generative (human-like) engine."""
        return str(self.settings.polly_engine).lower() == "generative"

    async def synthesize(self, text: str, session_id: str) -> dict:
        """
        Convert text to speech using Amazon Polly Neural.

        Args:
            text: Text to synthesize (narrative, question, or option text)
            session_id: Current session identifier for caching

        Returns:
            dict with keys:
                - audio_url (str): S3/CDN URL to the MP3 audio
                - duration_seconds (float): Estimated duration of the audio
                - available (bool): True if synthesis succeeded

            On failure, returns:
                - audio_url: ""
                - duration_seconds: 0.0
                - available: False
                - error_message: Human-friendly message
        """
        # Check cache first
        cache_key = self._get_cache_key(text, session_id)
        if cache_key in self._cache:
            logger.info(f"TTS cache hit for session={session_id}")
            return self._cache[cache_key]

        # Build SSML with speaking rate
        ssml_text = self._build_ssml(text)

        try:
            # The generative (human-like) engine has limited SSML support and
            # sounds most natural with plain text. Neural/standard engines use
            # SSML to control the speaking rate.
            if self._is_generative():
                synth_kwargs = dict(
                    Text=text,
                    TextType="text",
                    OutputFormat="mp3",
                    VoiceId=self.settings.polly_voice_id,
                    Engine="generative",
                )
            else:
                synth_kwargs = dict(
                    Text=ssml_text,
                    TextType="ssml",
                    OutputFormat="mp3",
                    VoiceId=self.settings.polly_voice_id,
                    Engine=self.settings.polly_engine,
                )

            # Call Amazon Polly
            response = await asyncio.to_thread(
                self._polly_client.synthesize_speech,
                **synth_kwargs,
            )

            # Read audio stream
            audio_stream = response["AudioStream"]
            audio_bytes = await asyncio.to_thread(audio_stream.read)

            # Estimate duration from audio bytes
            # MP3 at 22050 Hz mono ~= 4KB/sec for Polly output
            # A more precise estimate uses the content length
            duration_seconds = self._estimate_duration(audio_bytes)

            # Upload to S3 via StorageService
            audio_url = await self._storage_service.upload_bytes(
                data=audio_bytes,
                filename="narration.mp3",
                content_type="audio/mpeg",
                session_id=session_id,
            )

            result = {
                "audio_url": audio_url,
                "duration_seconds": duration_seconds,
                "available": True,
            }

            # Store in cache
            self._cache[cache_key] = result
            logger.info(
                f"TTS synthesis complete: duration={duration_seconds:.1f}s, "
                f"session={session_id}"
            )
            return result

        except (BotoCoreError, ClientError) as e:
            logger.error(f"Polly synthesis failed: {e}")
            return {
                "audio_url": "",
                "duration_seconds": 0.0,
                "available": False,
                "error_message": (
                    "The read-aloud button isn't working right now, "
                    "but you can keep reading!"
                ),
            }
        except Exception as e:
            logger.error(f"Unexpected TTS error: {e}")
            return {
                "audio_url": "",
                "duration_seconds": 0.0,
                "available": False,
                "error_message": (
                    "The read-aloud button isn't working right now, "
                    "but you can keep reading!"
                ),
            }

    def _estimate_duration(self, audio_bytes: bytes) -> float:
        """
        Estimate audio duration from MP3 byte length.

        Amazon Polly Neural outputs MP3 at ~24kbps for speech.
        This provides a reasonable estimate without parsing MP3 frames.
        """
        # Polly Neural typically outputs at ~24kbps (3000 bytes/sec)
        byte_count = len(audio_bytes)
        if byte_count == 0:
            return 0.0
        # 24kbps = 3000 bytes per second
        return round(byte_count / 3000.0, 1)
