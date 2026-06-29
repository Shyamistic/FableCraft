"""
Unit tests for the Content Moderator service.
Tests length validation, LLM-based moderation, response parsing, and error handling.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from content_moderator import ContentModerator, ModerationError, MIN_LESSON_LENGTH, MAX_LESSON_LENGTH
from llm_router import LLMRouterError


@pytest.fixture
def moderator():
    """Create a ContentModerator with a mocked LLM Router."""
    with patch("content_moderator.LLMRouter") as MockRouter:
        mock_router_instance = MagicMock()
        MockRouter.return_value = mock_router_instance
        mod = ContentModerator()
        yield mod


class TestLengthValidation:
    """Tests for lesson text length validation."""

    def test_valid_minimum_length(self, moderator):
        """Text with exactly 3 characters is valid."""
        assert moderator._validate_length("abc") is True

    def test_valid_maximum_length(self, moderator):
        """Text with exactly 200 characters is valid."""
        assert moderator._validate_length("a" * 200) is True

    def test_valid_mid_range(self, moderator):
        """Text with a typical length is valid."""
        assert moderator._validate_length("learning to share with friends") is True

    def test_too_short(self, moderator):
        """Text with fewer than 3 characters is invalid."""
        assert moderator._validate_length("ab") is False
        assert moderator._validate_length("") is False

    def test_too_long(self, moderator):
        """Text with more than 200 characters is invalid."""
        assert moderator._validate_length("a" * 201) is False

    def test_single_character(self, moderator):
        """Single character is too short."""
        assert moderator._validate_length("x") is False


class TestValidateLesson:
    """Tests for the validate_lesson async method."""

    @pytest.mark.asyncio
    async def test_too_short_raises_value_error(self, moderator):
        """Text shorter than 3 chars raises ValueError."""
        with pytest.raises(ValueError, match="at least 3 characters"):
            await moderator.validate_lesson("ab", "session-123")

    @pytest.mark.asyncio
    async def test_too_long_raises_value_error(self, moderator):
        """Text longer than 200 chars raises ValueError."""
        with pytest.raises(ValueError, match="at most 200 characters"):
            await moderator.validate_lesson("a" * 201, "session-123")

    @pytest.mark.asyncio
    async def test_appropriate_lesson_returns_approved(self, moderator):
        """Appropriate lesson text returns is_appropriate=True."""
        llm_response = {
            "content": json.dumps({
                "is_appropriate": True,
                "sanitized_lesson": "learning to share with friends",
                "rejection_reason": None,
            }),
            "provider": "bedrock",
            "latency_ms": 500,
        }
        moderator.llm_router.content_moderation = AsyncMock(return_value=llm_response)

        result = await moderator.validate_lesson("learning to share with friends", "session-123")

        assert result["is_appropriate"] is True
        assert result["sanitized_lesson"] == "learning to share with friends"
        assert result["rejection_reason"] is None

    @pytest.mark.asyncio
    async def test_inappropriate_lesson_returns_rejected(self, moderator):
        """Inappropriate lesson text returns is_appropriate=False with reason."""
        llm_response = {
            "content": json.dumps({
                "is_appropriate": False,
                "sanitized_lesson": "violence and fighting",
                "rejection_reason": "Contains violent themes inappropriate for children",
            }),
            "provider": "bedrock",
            "latency_ms": 450,
        }
        moderator.llm_router.content_moderation = AsyncMock(return_value=llm_response)

        result = await moderator.validate_lesson("violence and fighting", "session-123")

        assert result["is_appropriate"] is False
        assert result["rejection_reason"] == "Contains violent themes inappropriate for children"

    @pytest.mark.asyncio
    async def test_llm_router_failure_rejects_with_message(self, moderator):
        """When LLM Router fails, err on the side of caution and reject."""
        moderator.llm_router.content_moderation = AsyncMock(
            side_effect=LLMRouterError(
                "Both providers failed",
                bedrock_error="timeout",
                openrouter_error="connection error",
            )
        )

        result = await moderator.validate_lesson("kindness to animals", "session-123")

        assert result["is_appropriate"] is False
        assert result["sanitized_lesson"] == "kindness to animals"
        assert "Unable to verify" in result["rejection_reason"]

    @pytest.mark.asyncio
    async def test_unexpected_error_raises_moderation_error(self, moderator):
        """Unexpected system errors raise ModerationError."""
        moderator.llm_router.content_moderation = AsyncMock(
            side_effect=RuntimeError("unexpected crash")
        )

        with pytest.raises(ModerationError, match="system failure"):
            await moderator.validate_lesson("being kind", "session-123")

    @pytest.mark.asyncio
    async def test_malformed_json_response_rejects(self, moderator):
        """If LLM returns non-JSON, err on the side of caution."""
        llm_response = {
            "content": "I think this lesson is fine!",
            "provider": "bedrock",
            "latency_ms": 300,
        }
        moderator.llm_router.content_moderation = AsyncMock(return_value=llm_response)

        result = await moderator.validate_lesson("sharing toys", "session-123")

        assert result["is_appropriate"] is False
        assert result["sanitized_lesson"] == "sharing toys"
        assert "Unable to verify" in result["rejection_reason"]

    @pytest.mark.asyncio
    async def test_json_wrapped_in_code_block(self, moderator):
        """Handles JSON wrapped in markdown code blocks."""
        json_content = json.dumps({
            "is_appropriate": True,
            "sanitized_lesson": "being a good friend",
            "rejection_reason": None,
        })
        llm_response = {
            "content": f"```json\n{json_content}\n```",
            "provider": "openrouter",
            "latency_ms": 600,
        }
        moderator.llm_router.content_moderation = AsyncMock(return_value=llm_response)

        result = await moderator.validate_lesson("being a good friend", "session-123")

        assert result["is_appropriate"] is True
        assert result["sanitized_lesson"] == "being a good friend"

    @pytest.mark.asyncio
    async def test_sanitized_lesson_length_capped(self, moderator):
        """Sanitized lesson is capped at 200 characters."""
        long_sanitized = "a" * 300
        llm_response = {
            "content": json.dumps({
                "is_appropriate": True,
                "sanitized_lesson": long_sanitized,
                "rejection_reason": None,
            }),
            "provider": "bedrock",
            "latency_ms": 400,
        }
        moderator.llm_router.content_moderation = AsyncMock(return_value=llm_response)

        result = await moderator.validate_lesson("helping others", "session-123")

        assert len(result["sanitized_lesson"]) <= MAX_LESSON_LENGTH

    @pytest.mark.asyncio
    async def test_calls_llm_router_content_moderation(self, moderator):
        """Verify the LLM Router's content_moderation method is called with proper args."""
        llm_response = {
            "content": json.dumps({
                "is_appropriate": True,
                "sanitized_lesson": "patience",
                "rejection_reason": None,
            }),
            "provider": "bedrock",
            "latency_ms": 200,
        }
        moderator.llm_router.content_moderation = AsyncMock(return_value=llm_response)

        await moderator.validate_lesson("patience", "session-456")

        moderator.llm_router.content_moderation.assert_called_once()
        call_kwargs = moderator.llm_router.content_moderation.call_args
        assert "patience" in call_kwargs.kwargs["prompt"]
        assert call_kwargs.kwargs["system_prompt"] is not None

    @pytest.mark.asyncio
    async def test_rejection_reason_null_string_normalized(self, moderator):
        """rejection_reason of 'null' string is normalized to None."""
        llm_response = {
            "content": json.dumps({
                "is_appropriate": True,
                "sanitized_lesson": "honesty",
                "rejection_reason": "null",
            }),
            "provider": "bedrock",
            "latency_ms": 300,
        }
        moderator.llm_router.content_moderation = AsyncMock(return_value=llm_response)

        result = await moderator.validate_lesson("honesty", "session-789")

        assert result["rejection_reason"] is None


class TestParseResponse:
    """Tests for _parse_moderation_response."""

    def test_valid_json(self, moderator):
        """Parses valid JSON response correctly."""
        content = json.dumps({
            "is_appropriate": True,
            "sanitized_lesson": "being brave",
            "rejection_reason": None,
        })
        result = moderator._parse_moderation_response(content, "being brave")
        assert result["is_appropriate"] is True
        assert result["sanitized_lesson"] == "being brave"
        assert result["rejection_reason"] is None

    def test_invalid_json_falls_back(self, moderator):
        """Invalid JSON returns cautious rejection."""
        result = moderator._parse_moderation_response("not json at all", "test text")
        assert result["is_appropriate"] is False
        assert result["sanitized_lesson"] == "test text"
        assert "Unable to verify" in result["rejection_reason"]

    def test_empty_content_falls_back(self, moderator):
        """Empty content returns cautious rejection."""
        result = moderator._parse_moderation_response("", "original text")
        assert result["is_appropriate"] is False

    def test_sanitized_lesson_too_short_uses_original(self, moderator):
        """If sanitized_lesson is too short, falls back to original text."""
        content = json.dumps({
            "is_appropriate": True,
            "sanitized_lesson": "a",
            "rejection_reason": None,
        })
        result = moderator._parse_moderation_response(content, "learning patience")
        assert result["sanitized_lesson"] == "learning patience"
