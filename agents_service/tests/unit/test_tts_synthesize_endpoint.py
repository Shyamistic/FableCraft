"""
Unit tests for the POST /api/tts/synthesize endpoint.
Tests the full endpoint flow with mocked TTSService.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from fastapi.testclient import TestClient

from main import app
from models import ErrorCode


client = TestClient(app)


def _make_request_body(text="Sparkle found a basket of golden apples.", session_id="test-session-123"):
    """Create a valid request body for the endpoint."""
    return {
        "text": text,
        "session_id": session_id,
    }


class TestTTSSynthesizeEndpoint:
    """Tests for POST /api/tts/synthesize."""

    @patch("main.TTSService")
    def test_successful_synthesis_returns_200(self, mock_tts_cls):
        """Successful TTS synthesis returns 200 with audio_url and duration_seconds."""
        mock_tts = MagicMock()
        mock_tts.synthesize = AsyncMock(return_value={
            "audio_url": "https://cdn.example.com/audio/narration.mp3",
            "duration_seconds": 3.5,
            "available": True,
        })
        mock_tts_cls.return_value = mock_tts

        response = client.post("/api/tts/synthesize", json=_make_request_body())

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["audio_url"] == "https://cdn.example.com/audio/narration.mp3"
        assert data["duration_seconds"] == 3.5

    @patch("main.TTSService")
    def test_tts_unavailable_returns_500(self, mock_tts_cls):
        """When TTS service returns available=False, endpoint returns 500."""
        mock_tts = MagicMock()
        mock_tts.synthesize = AsyncMock(return_value={
            "audio_url": "",
            "duration_seconds": 0.0,
            "available": False,
            "error_message": "The read-aloud button isn't working right now, but you can keep reading!",
        })
        mock_tts_cls.return_value = mock_tts

        response = client.post("/api/tts/synthesize", json=_make_request_body())

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.SERVICE_UNAVAILABLE.value
        assert "read-aloud" in detail["message"].lower() or "reading" in detail["message"].lower()

    @patch("main.TTSService")
    def test_error_message_is_child_friendly(self, mock_tts_cls):
        """Error messages should be child-friendly (no technical jargon)."""
        mock_tts = MagicMock()
        mock_tts.synthesize = AsyncMock(return_value={
            "audio_url": "",
            "duration_seconds": 0.0,
            "available": False,
            "error_message": "Service error",
        })
        mock_tts_cls.return_value = mock_tts

        response = client.post("/api/tts/synthesize", json=_make_request_body())

        assert response.status_code == 500
        detail = response.json()["detail"]
        msg = detail["message"]
        # Should not contain technical terms
        assert "exception" not in msg.lower()
        assert "error" not in msg.lower()
        assert "stack" not in msg.lower()
        assert "traceback" not in msg.lower()

    @patch("main.TTSService")
    def test_service_called_with_correct_args(self, mock_tts_cls):
        """TTSService.synthesize is called with the correct text and session_id."""
        mock_tts = MagicMock()
        mock_tts.synthesize = AsyncMock(return_value={
            "audio_url": "https://cdn.example.com/audio/narration.mp3",
            "duration_seconds": 2.0,
            "available": True,
        })
        mock_tts_cls.return_value = mock_tts

        client.post(
            "/api/tts/synthesize",
            json=_make_request_body(text="Hello world", session_id="session-456"),
        )

        mock_tts.synthesize.assert_called_once_with(
            text="Hello world",
            session_id="session-456",
        )

    def test_missing_text_returns_422(self):
        """Missing text field returns validation error."""
        response = client.post(
            "/api/tts/synthesize",
            json={"session_id": "test-session"},
        )
        assert response.status_code == 422

    def test_missing_session_id_returns_422(self):
        """Missing session_id field returns validation error."""
        response = client.post(
            "/api/tts/synthesize",
            json={"text": "Hello world"},
        )
        assert response.status_code == 422

    def test_empty_text_returns_422(self):
        """Empty text string fails Pydantic min_length=1 validation."""
        response = client.post(
            "/api/tts/synthesize",
            json={"text": "", "session_id": "test-session"},
        )
        assert response.status_code == 422

    @patch("main.TTSService")
    def test_response_contains_required_fields(self, mock_tts_cls):
        """Successful response contains status, audio_url, and duration_seconds."""
        mock_tts = MagicMock()
        mock_tts.synthesize = AsyncMock(return_value={
            "audio_url": "https://cdn.example.com/audio/narration.mp3",
            "duration_seconds": 4.2,
            "available": True,
        })
        mock_tts_cls.return_value = mock_tts

        response = client.post("/api/tts/synthesize", json=_make_request_body())

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "audio_url" in data
        assert "duration_seconds" in data

    @patch("main.TTSService")
    def test_duration_is_numeric(self, mock_tts_cls):
        """duration_seconds in the response should be a numeric value."""
        mock_tts = MagicMock()
        mock_tts.synthesize = AsyncMock(return_value={
            "audio_url": "https://cdn.example.com/audio/narration.mp3",
            "duration_seconds": 5.7,
            "available": True,
        })
        mock_tts_cls.return_value = mock_tts

        response = client.post("/api/tts/synthesize", json=_make_request_body())

        data = response.json()
        assert isinstance(data["duration_seconds"], (int, float))
        assert data["duration_seconds"] == 5.7
