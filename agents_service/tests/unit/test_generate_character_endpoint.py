"""
Unit tests for the POST /api/characters/generate endpoint.
Tests the full endpoint flow with mocked external services.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import base64
import io
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from fastapi.testclient import TestClient
from PIL import Image

from main import app
from models import ErrorCode
from file_validator import ValidationResult
from vision_analyzer import ContentBlockedError, VisionAnalysisError
from character_generator import GenerationFailedError, ContentFilteredError
from storage_service import StorageError


client = TestClient(app)


def _make_valid_png_base64(width=100, height=100, color=(255, 0, 0)):
    """Create a valid PNG image as base64 with non-white pixels."""
    img = Image.new("RGB", (width, height), color)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _make_request_body(drawing_data=None, character_name="Sparkle", session_id="test-session-123"):
    """Create a valid request body for the endpoint."""
    if drawing_data is None:
        drawing_data = _make_valid_png_base64()
    return {
        "drawing_data": drawing_data,
        "character_name": character_name,
        "session_id": session_id,
    }


MOCK_VISION_RESULT = {
    "character_type": "bunny",
    "character_description": "A cheerful pink bunny with sparkly star patterns",
    "colors_used": ["pink", "gold", "white"],
    "artistic_style": "whimsical",
    "mood": "happy",
    "age_appropriate": True,
}

MOCK_GENERATION_RESULT = {
    "image_url": "https://cdn.example.com/characters/test-uuid.png",
    "image_id": "test-uuid-1234",
}


class TestGenerateCharacterEndpoint:
    """Tests for POST /api/characters/generate."""

    @patch("main.StorageService")
    @patch("main.CharacterGenerator")
    @patch("main.VisionAnalyzer")
    def test_successful_character_generation(
        self, mock_vision_cls, mock_gen_cls, mock_storage_cls
    ):
        """Test full successful flow returns 200 with character data."""
        # Setup mocks
        mock_vision = MagicMock()
        mock_vision.analyze_drawing = AsyncMock(return_value=MOCK_VISION_RESULT)
        mock_vision_cls.return_value = mock_vision

        mock_gen = MagicMock()
        mock_gen.generate_character = AsyncMock(return_value=MOCK_GENERATION_RESULT)
        mock_gen_cls.return_value = mock_gen

        mock_storage = MagicMock()
        mock_storage.upload_bytes = AsyncMock(
            return_value="https://cdn.example.com/drawings/original.png"
        )
        mock_storage_cls.return_value = mock_storage

        response = client.post("/api/characters/generate", json=_make_request_body())

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["character"]["name"] == "Sparkle"
        assert data["character"]["character_type"] == "bunny"
        assert data["character"]["character_description"] == "A cheerful pink bunny with sparkly star patterns"
        assert data["character"]["colors_used"] == ["pink", "gold", "white"]
        assert data["character"]["artistic_style"] == "whimsical"
        assert data["character"]["mood"] == "happy"
        assert data["character"]["generated_image_url"] == "https://cdn.example.com/characters/test-uuid.png"
        assert data["character"]["original_drawing_url"] == "https://cdn.example.com/drawings/original.png"
        assert data["character"]["id"] == "test-uuid-1234"
        assert "created_at" in data["character"]

    def test_invalid_file_format_returns_400(self):
        """Test that invalid base64 data returns 400 with child-friendly message."""
        body = _make_request_body(drawing_data="not-valid-base64!!!")
        response = client.post("/api/characters/generate", json=body)

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.UNSUPPORTED_FORMAT.value
        assert "PNG" in detail["message"] or "picture" in detail["message"]

    def test_file_too_large_returns_400(self):
        """Test that a file over 5MB returns 400 with child-friendly message."""
        # Create a base64 string that decodes to >5MB
        large_data = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * (6 * 1024 * 1024)).decode("utf-8")
        body = _make_request_body(drawing_data=large_data)
        response = client.post("/api/characters/generate", json=body)

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.FILE_TOO_LARGE.value
        assert "big" in detail["message"] or "large" in detail["message"]

    def test_empty_drawing_returns_400(self):
        """Test that a white-only image returns 400."""
        # Create a white image with no content
        white_data = _make_valid_png_base64(width=10, height=10, color=(255, 255, 255))
        body = _make_request_body(drawing_data=white_data)
        response = client.post("/api/characters/generate", json=body)

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.EMPTY_DRAWING.value
        assert "more" in detail["message"].lower()

    @patch("main.VisionAnalyzer")
    def test_content_blocked_returns_422(self, mock_vision_cls):
        """Test that content blocked by vision analyzer returns 422."""
        mock_vision = MagicMock()
        mock_vision.analyze_drawing = AsyncMock(
            side_effect=ContentBlockedError(
                "Let's try drawing something different! Your character needs to be friendly and fun."
            )
        )
        mock_vision_cls.return_value = mock_vision

        response = client.post("/api/characters/generate", json=_make_request_body())

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.CONTENT_BLOCKED.value
        assert "friendly" in detail["message"]

    @patch("main.VisionAnalyzer")
    def test_vision_analysis_error_returns_500(self, mock_vision_cls):
        """Test that vision analysis failure returns 500 with child-friendly message."""
        mock_vision = MagicMock()
        mock_vision.analyze_drawing = AsyncMock(
            side_effect=VisionAnalysisError("LLM timeout")
        )
        mock_vision_cls.return_value = mock_vision

        response = client.post("/api/characters/generate", json=_make_request_body())

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.SERVICE_UNAVAILABLE.value
        # Ensure no technical jargon in the message
        assert "stack" not in detail["message"].lower()
        assert "error" not in detail["message"].lower() or "art helper" in detail["message"].lower()

    @patch("main.CharacterGenerator")
    @patch("main.VisionAnalyzer")
    def test_content_filtered_during_generation_returns_422(
        self, mock_vision_cls, mock_gen_cls
    ):
        """Test that content filter during generation returns 422."""
        mock_vision = MagicMock()
        mock_vision.analyze_drawing = AsyncMock(return_value=MOCK_VISION_RESULT)
        mock_vision_cls.return_value = mock_vision

        mock_gen = MagicMock()
        mock_gen.generate_character = AsyncMock(
            side_effect=ContentFilteredError("Content filtered")
        )
        mock_gen_cls.return_value = mock_gen

        response = client.post("/api/characters/generate", json=_make_request_body())

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.CONTENT_BLOCKED.value
        assert "friendly" in detail["message"] and "fun" in detail["message"]

    @patch("main.CharacterGenerator")
    @patch("main.VisionAnalyzer")
    def test_generation_failed_returns_500(self, mock_vision_cls, mock_gen_cls):
        """Test that generation failure returns 500 with child-friendly message."""
        mock_vision = MagicMock()
        mock_vision.analyze_drawing = AsyncMock(return_value=MOCK_VISION_RESULT)
        mock_vision_cls.return_value = mock_vision

        mock_gen = MagicMock()
        mock_gen.generate_character = AsyncMock(
            side_effect=GenerationFailedError("Bedrock timeout")
        )
        mock_gen_cls.return_value = mock_gen

        response = client.post("/api/characters/generate", json=_make_request_body())

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.GENERATION_FAILED.value
        # Ensure child-friendly, no technical jargon
        assert "Bedrock" not in detail["message"]
        assert "timeout" not in detail["message"]

    @patch("main.StorageService")
    @patch("main.CharacterGenerator")
    @patch("main.VisionAnalyzer")
    def test_storage_failure_returns_500(
        self, mock_vision_cls, mock_gen_cls, mock_storage_cls
    ):
        """Test that storage failure returns 500 with child-friendly message."""
        mock_vision = MagicMock()
        mock_vision.analyze_drawing = AsyncMock(return_value=MOCK_VISION_RESULT)
        mock_vision_cls.return_value = mock_vision

        mock_gen = MagicMock()
        mock_gen.generate_character = AsyncMock(return_value=MOCK_GENERATION_RESULT)
        mock_gen_cls.return_value = mock_gen

        mock_storage = MagicMock()
        mock_storage.upload_bytes = AsyncMock(
            side_effect=StorageError("S3 upload failed")
        )
        mock_storage_cls.return_value = mock_storage

        response = client.post("/api/characters/generate", json=_make_request_body())

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.SERVICE_UNAVAILABLE.value
        assert "S3" not in detail["message"]

    def test_missing_character_name_returns_422(self):
        """Test that missing character_name returns validation error."""
        body = {"drawing_data": _make_valid_png_base64(), "session_id": "test-session"}
        response = client.post("/api/characters/generate", json=body)
        # FastAPI returns 422 for validation errors (missing field)
        assert response.status_code == 422

    def test_empty_character_name_returns_422(self):
        """Test that empty character_name returns validation error."""
        body = _make_request_body(character_name="")
        response = client.post("/api/characters/generate", json=body)
        assert response.status_code == 422

    @patch("main.StorageService")
    @patch("main.CharacterGenerator")
    @patch("main.VisionAnalyzer")
    def test_error_messages_are_child_friendly(
        self, mock_vision_cls, mock_gen_cls, mock_storage_cls
    ):
        """Test that all error messages are plain-language, no technical jargon."""
        mock_vision = MagicMock()
        mock_vision.analyze_drawing = AsyncMock(return_value=MOCK_VISION_RESULT)
        mock_vision_cls.return_value = mock_vision

        mock_gen = MagicMock()
        mock_gen.generate_character = AsyncMock(return_value=MOCK_GENERATION_RESULT)
        mock_gen_cls.return_value = mock_gen

        mock_storage = MagicMock()
        mock_storage.upload_bytes = AsyncMock(
            return_value="https://cdn.example.com/drawings/original.png"
        )
        mock_storage_cls.return_value = mock_storage

        # Verify successful response has no technical jargon
        response = client.post("/api/characters/generate", json=_make_request_body())
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert data["status"] == "success"
