"""
Unit tests for the POST /api/lessons/validate endpoint.
Tests the full endpoint flow with mocked ContentModerator.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from fastapi.testclient import TestClient

from main import app
from models import ErrorCode
from content_moderator import ModerationError


client = TestClient(app)


def _make_request_body(custom_lesson="learning to share with friends", session_id="test-session-123"):
    """Create a valid request body for the endpoint."""
    return {
        "custom_lesson": custom_lesson,
        "session_id": session_id,
    }


class TestValidateLessonEndpoint:
    """Tests for POST /api/lessons/validate."""

    @patch("main.ContentModerator")
    def test_appropriate_lesson_returns_200(self, mock_moderator_cls):
        """An appropriate lesson returns 200 with is_appropriate=True."""
        mock_moderator = MagicMock()
        mock_moderator.validate_lesson = AsyncMock(return_value={
            "is_appropriate": True,
            "sanitized_lesson": "learning to share with friends",
            "rejection_reason": None,
        })
        mock_moderator_cls.return_value = mock_moderator

        response = client.post("/api/lessons/validate", json=_make_request_body())

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["is_appropriate"] is True
        assert data["sanitized_lesson"] == "learning to share with friends"

    @patch("main.ContentModerator")
    def test_inappropriate_lesson_returns_200_with_false(self, mock_moderator_cls):
        """An inappropriate lesson returns 200 with is_appropriate=False."""
        mock_moderator = MagicMock()
        mock_moderator.validate_lesson = AsyncMock(return_value={
            "is_appropriate": False,
            "sanitized_lesson": "violence and fighting",
            "rejection_reason": "Contains violent themes",
        })
        mock_moderator_cls.return_value = mock_moderator

        response = client.post(
            "/api/lessons/validate",
            json=_make_request_body(custom_lesson="violence and fighting"),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["is_appropriate"] is False
        assert data["sanitized_lesson"] == "violence and fighting"

    def test_too_short_lesson_returns_422(self):
        """Lesson with fewer than 3 chars fails Pydantic validation (422)."""
        response = client.post(
            "/api/lessons/validate",
            json=_make_request_body(custom_lesson="ab"),
        )

        assert response.status_code == 422

    def test_too_long_lesson_returns_422(self):
        """Lesson with more than 200 chars fails Pydantic validation (422)."""
        response = client.post(
            "/api/lessons/validate",
            json=_make_request_body(custom_lesson="a" * 201),
        )

        assert response.status_code == 422

    def test_exactly_3_chars_is_valid(self):
        """Lesson with exactly 3 chars passes Pydantic validation."""
        with patch("main.ContentModerator") as mock_moderator_cls:
            mock_moderator = MagicMock()
            mock_moderator.validate_lesson = AsyncMock(return_value={
                "is_appropriate": True,
                "sanitized_lesson": "abc",
                "rejection_reason": None,
            })
            mock_moderator_cls.return_value = mock_moderator

            response = client.post(
                "/api/lessons/validate",
                json=_make_request_body(custom_lesson="abc"),
            )

            assert response.status_code == 200

    def test_exactly_200_chars_is_valid(self):
        """Lesson with exactly 200 chars passes Pydantic validation."""
        lesson_200 = "a" * 200
        with patch("main.ContentModerator") as mock_moderator_cls:
            mock_moderator = MagicMock()
            mock_moderator.validate_lesson = AsyncMock(return_value={
                "is_appropriate": True,
                "sanitized_lesson": lesson_200,
                "rejection_reason": None,
            })
            mock_moderator_cls.return_value = mock_moderator

            response = client.post(
                "/api/lessons/validate",
                json=_make_request_body(custom_lesson=lesson_200),
            )

            assert response.status_code == 200

    @patch("main.ContentModerator")
    def test_value_error_returns_400(self, mock_moderator_cls):
        """If ContentModerator raises ValueError, endpoint returns 400."""
        mock_moderator = MagicMock()
        mock_moderator.validate_lesson = AsyncMock(
            side_effect=ValueError("Lesson text must be at least 3 characters long")
        )
        mock_moderator_cls.return_value = mock_moderator

        response = client.post("/api/lessons/validate", json=_make_request_body())

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.VALIDATION_ERROR.value

    @patch("main.ContentModerator")
    def test_moderation_error_returns_500(self, mock_moderator_cls):
        """If ContentModerator raises ModerationError, endpoint returns 500."""
        mock_moderator = MagicMock()
        mock_moderator.validate_lesson = AsyncMock(
            side_effect=ModerationError("Content moderation system failure")
        )
        mock_moderator_cls.return_value = mock_moderator

        response = client.post("/api/lessons/validate", json=_make_request_body())

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.SERVICE_UNAVAILABLE.value
        # Verify child-friendly message (no technical jargon)
        assert "stack" not in detail["message"].lower()
        assert "exception" not in detail["message"].lower()
        assert "try again" in detail["message"].lower() or "moment" in detail["message"].lower()

    @patch("main.ContentModerator")
    def test_error_message_is_child_friendly(self, mock_moderator_cls):
        """Error messages should not contain technical jargon."""
        mock_moderator = MagicMock()
        mock_moderator.validate_lesson = AsyncMock(
            side_effect=ModerationError("RuntimeError: unexpected system crash")
        )
        mock_moderator_cls.return_value = mock_moderator

        response = client.post("/api/lessons/validate", json=_make_request_body())

        assert response.status_code == 500
        detail = response.json()["detail"]
        # Should not leak the raw error message
        assert "RuntimeError" not in detail["message"]
        assert "crash" not in detail["message"]

    def test_missing_custom_lesson_returns_422(self):
        """Missing custom_lesson field returns validation error."""
        response = client.post(
            "/api/lessons/validate",
            json={"session_id": "test-session"},
        )
        assert response.status_code == 422

    def test_missing_session_id_returns_422(self):
        """Missing session_id field returns validation error."""
        response = client.post(
            "/api/lessons/validate",
            json={"custom_lesson": "learning to share"},
        )
        assert response.status_code == 422

    @patch("main.ContentModerator")
    def test_sanitized_lesson_returned_from_moderator(self, mock_moderator_cls):
        """The sanitized_lesson from the moderator is correctly passed through."""
        mock_moderator = MagicMock()
        mock_moderator.validate_lesson = AsyncMock(return_value={
            "is_appropriate": True,
            "sanitized_lesson": "Learning to Share with Friends",
            "rejection_reason": None,
        })
        mock_moderator_cls.return_value = mock_moderator

        response = client.post(
            "/api/lessons/validate",
            json=_make_request_body(custom_lesson="learning to share with friends"),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["sanitized_lesson"] == "Learning to Share with Friends"

    @patch("main.ContentModerator")
    def test_moderator_called_with_correct_args(self, mock_moderator_cls):
        """Verify ContentModerator.validate_lesson is called with the right arguments."""
        mock_moderator = MagicMock()
        mock_moderator.validate_lesson = AsyncMock(return_value={
            "is_appropriate": True,
            "sanitized_lesson": "patience",
            "rejection_reason": None,
        })
        mock_moderator_cls.return_value = mock_moderator

        client.post(
            "/api/lessons/validate",
            json=_make_request_body(custom_lesson="patience", session_id="session-456"),
        )

        mock_moderator.validate_lesson.assert_called_once_with(
            text="patience",
            session_id="session-456",
        )
