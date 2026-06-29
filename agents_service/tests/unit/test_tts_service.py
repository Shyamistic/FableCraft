"""
Unit tests for TTSService.
Tests text-to-speech synthesis, caching, SSML generation, and error handling.
"""

import sys
import os
from unittest.mock import MagicMock, patch, AsyncMock

import pytest
from botocore.exceptions import ClientError, BotoCoreError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


@pytest.fixture
def mock_settings():
    """Create mock settings for testing."""
    settings = MagicMock()
    settings.aws_region = "us-east-1"
    settings.polly_voice_id = "Ruth"
    settings.polly_engine = "neural"
    settings.polly_speaking_rate = "90%"
    settings.s3_bucket_name = "test-bucket"
    settings.cloudfront_domain = None
    settings.presigned_url_expiry_seconds = 3600
    settings.cache_control_max_age = 3600
    settings.max_retries = 3
    settings.retry_base_delay_ms = 100
    settings.tts_timeout_ms = 10000
    return settings


@pytest.fixture
def mock_polly_client():
    """Create a mock Polly client."""
    client = MagicMock()
    # Default successful response
    mock_audio_stream = MagicMock()
    mock_audio_stream.read.return_value = b"\x00" * 6000  # ~2 seconds of audio
    client.synthesize_speech.return_value = {
        "AudioStream": mock_audio_stream,
    }
    return client


@pytest.fixture
def mock_storage_service():
    """Create a mock StorageService."""
    storage = MagicMock()
    storage.upload_bytes = AsyncMock(
        return_value="https://cdn.example.com/audio/test-uuid.mp3"
    )
    return storage


@pytest.fixture
def tts_service(mock_settings, mock_polly_client, mock_storage_service):
    """Create a TTSService instance with mocked dependencies."""
    with patch("tts_service.boto3") as mock_boto3:
        mock_boto3.client.return_value = mock_polly_client
        with patch("config.settings", mock_settings):
            from tts_service import TTSService

            service = TTSService(storage_service=mock_storage_service)
            service._polly_client = mock_polly_client
            service.settings = mock_settings
            return service


class TestSSMLGeneration:
    """Tests for SSML wrapping with speaking rate."""

    def test_build_ssml_wraps_text_with_prosody(self, tts_service):
        """SSML should wrap text in prosody tag with configured speaking rate."""
        ssml = tts_service._build_ssml("Hello world")
        assert '<prosody rate="90%">' in ssml
        assert "Hello world" in ssml
        assert ssml.startswith("<speak>")
        assert ssml.endswith("</speak>")

    def test_build_ssml_uses_configured_rate(self, tts_service):
        """SSML should use the polly_speaking_rate from settings."""
        tts_service.settings.polly_speaking_rate = "85%"
        ssml = tts_service._build_ssml("Test text")
        assert '<prosody rate="85%">' in ssml

    def test_build_ssml_at_100_percent(self, tts_service):
        """SSML should work with 100% rate."""
        tts_service.settings.polly_speaking_rate = "100%"
        ssml = tts_service._build_ssml("Fast text")
        assert '<prosody rate="100%">' in ssml


class TestCacheKey:
    """Tests for cache key generation."""

    def test_cache_key_format(self, tts_service):
        """Cache key should be session_id:text_hash format."""
        key = tts_service._get_cache_key("Hello", "session-123")
        assert key.startswith("session-123:")
        # Hash part should be 16 hex characters
        hash_part = key.split(":")[1]
        assert len(hash_part) == 16

    def test_same_text_same_session_produces_same_key(self, tts_service):
        """Same text + session should produce identical cache keys."""
        key1 = tts_service._get_cache_key("Hello world", "session-1")
        key2 = tts_service._get_cache_key("Hello world", "session-1")
        assert key1 == key2

    def test_different_text_produces_different_key(self, tts_service):
        """Different text with same session should produce different keys."""
        key1 = tts_service._get_cache_key("Hello", "session-1")
        key2 = tts_service._get_cache_key("Goodbye", "session-1")
        assert key1 != key2

    def test_different_session_produces_different_key(self, tts_service):
        """Same text with different sessions should produce different keys."""
        key1 = tts_service._get_cache_key("Hello", "session-1")
        key2 = tts_service._get_cache_key("Hello", "session-2")
        assert key1 != key2


class TestSynthesize:
    """Tests for the main synthesize method."""

    @pytest.mark.asyncio
    async def test_synthesize_success(
        self, tts_service, mock_polly_client, mock_storage_service
    ):
        """Successful synthesis returns audio URL and duration."""
        result = await tts_service.synthesize(
            "Sparkle found a basket of golden apples.", "session-1"
        )

        assert result["available"] is True
        assert result["audio_url"] == "https://cdn.example.com/audio/test-uuid.mp3"
        assert result["duration_seconds"] > 0
        assert "error_message" not in result

    @pytest.mark.asyncio
    async def test_synthesize_calls_polly_with_correct_params(
        self, tts_service, mock_polly_client
    ):
        """Polly should be called with neural engine, SSML, and correct voice."""
        await tts_service.synthesize("Test text", "session-1")

        mock_polly_client.synthesize_speech.assert_called_once()
        call_kwargs = mock_polly_client.synthesize_speech.call_args[1]
        assert call_kwargs["TextType"] == "ssml"
        assert call_kwargs["OutputFormat"] == "mp3"
        assert call_kwargs["VoiceId"] == "Ruth"
        assert call_kwargs["Engine"] == "neural"
        assert '<prosody rate="90%">' in call_kwargs["Text"]
        assert "Test text" in call_kwargs["Text"]

    @pytest.mark.asyncio
    async def test_synthesize_uploads_to_s3(
        self, tts_service, mock_storage_service
    ):
        """Synthesized audio should be uploaded to S3 via StorageService."""
        await tts_service.synthesize("Hello", "session-1")

        mock_storage_service.upload_bytes.assert_called_once()
        call_kwargs = mock_storage_service.upload_bytes.call_args[1]
        assert call_kwargs["filename"] == "narration.mp3"
        assert call_kwargs["content_type"] == "audio/mpeg"
        assert call_kwargs["session_id"] == "session-1"
        assert isinstance(call_kwargs["data"], bytes)

    @pytest.mark.asyncio
    async def test_synthesize_caches_result(self, tts_service, mock_polly_client):
        """Second call with same text/session should return cached result."""
        # First call
        result1 = await tts_service.synthesize("Cached text", "session-1")
        assert mock_polly_client.synthesize_speech.call_count == 1

        # Second call - should use cache
        result2 = await tts_service.synthesize("Cached text", "session-1")
        assert mock_polly_client.synthesize_speech.call_count == 1  # Not called again

        assert result1 == result2

    @pytest.mark.asyncio
    async def test_synthesize_different_text_not_cached(
        self, tts_service, mock_polly_client
    ):
        """Different text should not use cache."""
        await tts_service.synthesize("Text one", "session-1")
        await tts_service.synthesize("Text two", "session-1")

        assert mock_polly_client.synthesize_speech.call_count == 2

    @pytest.mark.asyncio
    async def test_synthesize_different_session_not_cached(
        self, tts_service, mock_polly_client
    ):
        """Same text in different session should not use cache."""
        await tts_service.synthesize("Same text", "session-1")
        await tts_service.synthesize("Same text", "session-2")

        assert mock_polly_client.synthesize_speech.call_count == 2


class TestSynthesizeErrorHandling:
    """Tests for error handling in synthesize."""

    @pytest.mark.asyncio
    async def test_polly_client_error_returns_unavailable(
        self, tts_service, mock_polly_client
    ):
        """ClientError from Polly should return available=False."""
        error_response = {
            "Error": {"Code": "ServiceUnavailable", "Message": "Service down"}
        }
        mock_polly_client.synthesize_speech.side_effect = ClientError(
            error_response, "SynthesizeSpeech"
        )

        result = await tts_service.synthesize("Hello", "session-1")

        assert result["available"] is False
        assert result["audio_url"] == ""
        assert result["duration_seconds"] == 0.0
        assert "error_message" in result
        assert "read-aloud" in result["error_message"]

    @pytest.mark.asyncio
    async def test_boto_core_error_returns_unavailable(
        self, tts_service, mock_polly_client
    ):
        """BotoCoreError from Polly should return available=False."""
        mock_polly_client.synthesize_speech.side_effect = BotoCoreError()

        result = await tts_service.synthesize("Hello", "session-1")

        assert result["available"] is False
        assert result["audio_url"] == ""
        assert result["duration_seconds"] == 0.0
        assert "error_message" in result

    @pytest.mark.asyncio
    async def test_unexpected_error_returns_unavailable(
        self, tts_service, mock_polly_client
    ):
        """Unexpected exceptions should still return graceful failure."""
        mock_polly_client.synthesize_speech.side_effect = RuntimeError(
            "Unexpected failure"
        )

        result = await tts_service.synthesize("Hello", "session-1")

        assert result["available"] is False
        assert result["audio_url"] == ""
        assert result["duration_seconds"] == 0.0
        assert "error_message" in result

    @pytest.mark.asyncio
    async def test_error_message_is_child_friendly(
        self, tts_service, mock_polly_client
    ):
        """Error message should be suitable for children (no technical jargon)."""
        error_response = {
            "Error": {"Code": "ThrottlingException", "Message": "Rate exceeded"}
        }
        mock_polly_client.synthesize_speech.side_effect = ClientError(
            error_response, "SynthesizeSpeech"
        )

        result = await tts_service.synthesize("Hello", "session-1")

        msg = result["error_message"]
        # Should not contain technical terms
        assert "exception" not in msg.lower()
        assert "error" not in msg.lower()
        assert "throttl" not in msg.lower()
        # Should be encouraging
        assert "keep reading" in msg.lower()

    @pytest.mark.asyncio
    async def test_failed_synthesis_not_cached(
        self, tts_service, mock_polly_client
    ):
        """Failed synthesis results should NOT be cached."""
        error_response = {
            "Error": {"Code": "500", "Message": "Error"}
        }
        mock_polly_client.synthesize_speech.side_effect = ClientError(
            error_response, "SynthesizeSpeech"
        )

        # First call fails
        result1 = await tts_service.synthesize("Hello", "session-1")
        assert result1["available"] is False

        # Reset to succeed
        mock_audio_stream = MagicMock()
        mock_audio_stream.read.return_value = b"\x00" * 3000
        mock_polly_client.synthesize_speech.side_effect = None
        mock_polly_client.synthesize_speech.return_value = {
            "AudioStream": mock_audio_stream
        }

        # Second call should try again (not return cached failure)
        result2 = await tts_service.synthesize("Hello", "session-1")
        assert result2["available"] is True


class TestDurationEstimation:
    """Tests for audio duration estimation."""

    def test_estimate_duration_returns_positive_for_audio(self, tts_service):
        """Non-empty audio bytes should return positive duration."""
        duration = tts_service._estimate_duration(b"\x00" * 6000)
        assert duration > 0

    def test_estimate_duration_zero_for_empty(self, tts_service):
        """Empty bytes should return 0.0 duration."""
        duration = tts_service._estimate_duration(b"")
        assert duration == 0.0

    def test_estimate_duration_proportional_to_size(self, tts_service):
        """Larger audio should have longer estimated duration."""
        short_duration = tts_service._estimate_duration(b"\x00" * 3000)
        long_duration = tts_service._estimate_duration(b"\x00" * 12000)
        assert long_duration > short_duration
