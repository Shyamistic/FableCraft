"""
Property-based tests for TTSService - TTS audio caching.
Tests that cached audio is returned for repeated text within the same session,
and that different text or different sessions invoke Polly again.

**Validates: Requirements 9.7**
"""

import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


# --- Strategies ---

# Strategy for text content (non-empty printable strings, simulating narrative text)
st_text = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=1,
    max_size=200,
).filter(lambda t: t.strip() != "")

# Strategy for session IDs (UUID-like strings)
st_session_id = st.from_regex(r"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}", fullmatch=True)

# Strategy for audio URLs returned by storage
st_audio_url = st.from_regex(r"https://cdn\.example\.com/audio/[a-f0-9]{8}\.mp3", fullmatch=True)

# Strategy for audio byte sizes (determines duration estimate)
st_audio_bytes_size = st.integers(min_value=100, max_value=50000)


# --- Helpers ---


def make_tts_service():
    """Create a TTSService with mocked Polly and storage dependencies."""
    mock_settings = MagicMock()
    mock_settings.aws_region = "us-east-1"
    mock_settings.polly_voice_id = "Ruth"
    mock_settings.polly_engine = "neural"
    mock_settings.polly_speaking_rate = "90%"

    mock_polly_client = MagicMock()
    mock_storage_service = AsyncMock()

    with patch("config.settings", mock_settings):
        from tts_service import TTSService

        service = TTSService(storage_service=mock_storage_service)
        service._polly_client = mock_polly_client
        service.settings = mock_settings
        return service, mock_polly_client, mock_storage_service


def setup_polly_mock(mock_polly_client, audio_bytes: bytes):
    """Configure the Polly mock to return given audio bytes."""
    mock_audio_stream = MagicMock()
    mock_audio_stream.read.return_value = audio_bytes

    mock_polly_client.synthesize_speech.return_value = {
        "AudioStream": mock_audio_stream,
    }


# --- Property 17: TTS Audio Caching ---


@pytest.mark.property
class TestProperty17TTSAudioCaching:
    """
    Property 17: TTS Audio Caching

    For any text that has been synthesized to audio within the same session,
    a subsequent request for the same text SHALL return the previously cached
    audio URL from the Asset_Store without re-invoking Amazon Polly. Different
    text or a different session must invoke Polly again.

    **Validates: Requirements 9.7**
    """

    @settings(max_examples=50, deadline=None)
    @given(
        text=st_text,
        session_id=st_session_id,
        audio_url=st_audio_url,
        audio_size=st_audio_bytes_size,
    )
    def test_same_text_same_session_returns_cached_without_polly(
        self, text, session_id, audio_url, audio_size
    ):
        """
        For any text synthesized in a session, a second request with the same
        text and same session_id must return the cached audio_url without
        re-invoking Polly.

        **Validates: Requirements 9.7**
        """
        service, mock_polly, mock_storage = make_tts_service()

        audio_bytes = b"\x00" * audio_size
        setup_polly_mock(mock_polly, audio_bytes)
        mock_storage.upload_bytes.return_value = audio_url

        # First call - should invoke Polly
        result1 = asyncio.run(service.synthesize(text, session_id))
        assert result1["available"] is True
        assert result1["audio_url"] == audio_url
        assert mock_polly.synthesize_speech.call_count == 1

        # Second call with same text and session - should use cache
        result2 = asyncio.run(service.synthesize(text, session_id))
        assert result2["available"] is True
        assert result2["audio_url"] == audio_url

        # Polly should NOT have been called again
        assert mock_polly.synthesize_speech.call_count == 1
        # Storage upload should NOT have been called again
        assert mock_storage.upload_bytes.call_count == 1

    @settings(max_examples=50, deadline=None)
    @given(
        text1=st_text,
        text2=st_text,
        session_id=st_session_id,
        audio_url1=st_audio_url,
        audio_url2=st_audio_url,
        audio_size=st_audio_bytes_size,
    )
    def test_different_text_same_session_invokes_polly_again(
        self, text1, text2, session_id, audio_url1, audio_url2, audio_size
    ):
        """
        For any two distinct texts within the same session, each must invoke
        Polly separately (no cross-text caching).

        **Validates: Requirements 9.7**
        """
        # Ensure texts are actually different
        assume(text1 != text2)

        service, mock_polly, mock_storage = make_tts_service()

        audio_bytes = b"\x00" * audio_size
        setup_polly_mock(mock_polly, audio_bytes)
        mock_storage.upload_bytes.side_effect = [audio_url1, audio_url2]

        # First call with text1
        result1 = asyncio.run(service.synthesize(text1, session_id))
        assert result1["available"] is True
        assert mock_polly.synthesize_speech.call_count == 1

        # Second call with different text
        result2 = asyncio.run(service.synthesize(text2, session_id))
        assert result2["available"] is True

        # Polly must be called again for different text
        assert mock_polly.synthesize_speech.call_count == 2
        assert mock_storage.upload_bytes.call_count == 2

    @settings(max_examples=50, deadline=None)
    @given(
        text=st_text,
        session_id1=st_session_id,
        session_id2=st_session_id,
        audio_url1=st_audio_url,
        audio_url2=st_audio_url,
        audio_size=st_audio_bytes_size,
    )
    def test_same_text_different_session_invokes_polly_again(
        self, text, session_id1, session_id2, audio_url1, audio_url2, audio_size
    ):
        """
        For the same text but a different session_id, Polly must be invoked
        again (cache is per-session).

        **Validates: Requirements 9.7**
        """
        # Ensure session IDs are actually different
        assume(session_id1 != session_id2)

        service, mock_polly, mock_storage = make_tts_service()

        audio_bytes = b"\x00" * audio_size
        setup_polly_mock(mock_polly, audio_bytes)
        mock_storage.upload_bytes.side_effect = [audio_url1, audio_url2]

        # First call with session 1
        result1 = asyncio.run(service.synthesize(text, session_id1))
        assert result1["available"] is True
        assert mock_polly.synthesize_speech.call_count == 1

        # Same text, different session
        result2 = asyncio.run(service.synthesize(text, session_id2))
        assert result2["available"] is True

        # Polly must be called again for a different session
        assert mock_polly.synthesize_speech.call_count == 2
        assert mock_storage.upload_bytes.call_count == 2

    @settings(max_examples=50, deadline=None)
    @given(
        text=st_text,
        session_id=st_session_id,
        audio_url=st_audio_url,
        audio_size=st_audio_bytes_size,
        repeat_count=st.integers(min_value=2, max_value=5),
    )
    def test_multiple_cache_hits_never_reinvoke_polly(
        self, text, session_id, audio_url, audio_size, repeat_count
    ):
        """
        For any number of repeated requests with the same text and session,
        Polly is invoked exactly once and subsequent calls always return
        the cached result.

        **Validates: Requirements 9.7**
        """
        service, mock_polly, mock_storage = make_tts_service()

        audio_bytes = b"\x00" * audio_size
        setup_polly_mock(mock_polly, audio_bytes)
        mock_storage.upload_bytes.return_value = audio_url

        # First call invokes Polly
        first_result = asyncio.run(service.synthesize(text, session_id))
        assert first_result["available"] is True

        # Subsequent calls should all hit cache
        for _ in range(repeat_count):
            result = asyncio.run(service.synthesize(text, session_id))
            assert result["audio_url"] == first_result["audio_url"]
            assert result["duration_seconds"] == first_result["duration_seconds"]
            assert result["available"] is True

        # Polly was only called once total
        assert mock_polly.synthesize_speech.call_count == 1
        assert mock_storage.upload_bytes.call_count == 1

    @settings(max_examples=50, deadline=None)
    @given(
        text=st_text,
        session_id=st_session_id,
        audio_url=st_audio_url,
        audio_size=st_audio_bytes_size,
    )
    def test_cached_result_preserves_all_fields(
        self, text, session_id, audio_url, audio_size
    ):
        """
        The cached result must contain the same audio_url, duration_seconds,
        and available fields as the original synthesis result.

        **Validates: Requirements 9.7**
        """
        service, mock_polly, mock_storage = make_tts_service()

        audio_bytes = b"\x00" * audio_size
        setup_polly_mock(mock_polly, audio_bytes)
        mock_storage.upload_bytes.return_value = audio_url

        # First call
        original = asyncio.run(service.synthesize(text, session_id))

        # Second call (cached)
        cached = asyncio.run(service.synthesize(text, session_id))

        # Cached result must be identical
        assert cached["audio_url"] == original["audio_url"]
        assert cached["duration_seconds"] == original["duration_seconds"]
        assert cached["available"] == original["available"]
