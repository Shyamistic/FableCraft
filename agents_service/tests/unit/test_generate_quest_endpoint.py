"""
Unit tests for the POST /api/quests/generate endpoint.
Tests the full endpoint flow with mocked external services.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from fastapi.testclient import TestClient

from main import app, PREDEFINED_LESSON_IDS
from models import ErrorCode, Genre, Scene, Option
from quest_engine import QuestGenerationError
from content_moderator import ModerationError
from scene_illustrator import PLACEHOLDER_IMAGE_URL


client = TestClient(app)


# --- Helpers ---


def _make_scene_model(scene_number: int) -> Scene:
    """Create a Scene model instance as QuestEngine returns."""
    return Scene(
        scene_number=scene_number,
        narrative=f"Sparkle the pink bunny finds a friend in scene {scene_number}.",
        question="What should Sparkle do?",
        options=[
            Option(id="a", text="Help the friend kindly", is_correct=True, feedback="Great job!"),
            Option(id="b", text="Walk away and ignore them", is_correct=False, feedback="Try again!"),
        ],
        image_url="",  # QuestEngine returns empty, illustrator fills it
    )


def _make_8_scenes() -> list:
    """Create a list of 8 Scene models."""
    return [_make_scene_model(i + 1) for i in range(8)]


def _make_illustration_results() -> list:
    """Create illustration results for 8 scenes."""
    return [
        {"scene_number": i + 1, "image_url": f"https://cdn.example.com/scenes/scene-{i+1}.png"}
        for i in range(8)
    ]


def _make_request_body(
    character_id="test-char-uuid",
    character_name="Sparkle",
    character_description="A cheerful pink bunny with sparkly star patterns",
    lesson="sharing",
    genre="fantasy_kingdom",
    session_id="test-session-123",
):
    """Create a valid request body for the endpoint."""
    return {
        "character_id": character_id,
        "character_name": character_name,
        "character_description": character_description,
        "lesson": lesson,
        "genre": genre,
        "session_id": session_id,
    }


# --- Tests ---


class TestGenerateQuestEndpointSuccess:
    """Tests for successful quest generation."""

    @patch("main.SceneIllustrator")
    @patch("main.QuestEngine")
    def test_successful_predefined_lesson_quest(self, mock_engine_cls, mock_illustrator_cls):
        """A predefined lesson skips moderation and returns full quest."""
        # Setup QuestEngine mock
        mock_engine = MagicMock()
        mock_engine.generate_quest = AsyncMock(return_value=_make_8_scenes())
        mock_engine_cls.return_value = mock_engine

        # Setup SceneIllustrator mock
        mock_illustrator = MagicMock()
        mock_illustrator.illustrate_scenes = AsyncMock(return_value=_make_illustration_results())
        mock_illustrator_cls.return_value = mock_illustrator

        response = client.post("/api/quests/generate", json=_make_request_body())

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "quest" in data
        quest = data["quest"]
        assert quest["lesson"] == "sharing"
        assert quest["genre"] == "fantasy_kingdom"
        assert quest["character_name"] == "Sparkle"
        assert quest["total_scenes"] == 8
        assert len(quest["scenes"]) == 8
        assert "id" in quest
        assert "title" in quest

    @patch("main.SceneIllustrator")
    @patch("main.QuestEngine")
    def test_response_scenes_have_image_urls(self, mock_engine_cls, mock_illustrator_cls):
        """Each scene in the response has a valid image URL from illustrator."""
        mock_engine = MagicMock()
        mock_engine.generate_quest = AsyncMock(return_value=_make_8_scenes())
        mock_engine_cls.return_value = mock_engine

        mock_illustrator = MagicMock()
        mock_illustrator.illustrate_scenes = AsyncMock(return_value=_make_illustration_results())
        mock_illustrator_cls.return_value = mock_illustrator

        response = client.post("/api/quests/generate", json=_make_request_body())

        assert response.status_code == 200
        scenes = response.json()["quest"]["scenes"]
        for i, scene in enumerate(scenes):
            assert scene["image_url"] == f"https://cdn.example.com/scenes/scene-{i+1}.png"
            assert scene["scene_number"] == i + 1

    @patch("main.SceneIllustrator")
    @patch("main.QuestEngine")
    def test_each_scene_has_two_options(self, mock_engine_cls, mock_illustrator_cls):
        """Each scene has exactly 2 options with required fields."""
        mock_engine = MagicMock()
        mock_engine.generate_quest = AsyncMock(return_value=_make_8_scenes())
        mock_engine_cls.return_value = mock_engine

        mock_illustrator = MagicMock()
        mock_illustrator.illustrate_scenes = AsyncMock(return_value=_make_illustration_results())
        mock_illustrator_cls.return_value = mock_illustrator

        response = client.post("/api/quests/generate", json=_make_request_body())

        assert response.status_code == 200
        scenes = response.json()["quest"]["scenes"]
        for scene in scenes:
            assert len(scene["options"]) == 2
            for opt in scene["options"]:
                assert "id" in opt
                assert "text" in opt
                assert "is_correct" in opt
                assert "feedback" in opt

    @patch("main.SceneIllustrator")
    @patch("main.QuestEngine")
    def test_quest_title_includes_character_name(self, mock_engine_cls, mock_illustrator_cls):
        """Quest title includes the character name."""
        mock_engine = MagicMock()
        mock_engine.generate_quest = AsyncMock(return_value=_make_8_scenes())
        mock_engine_cls.return_value = mock_engine

        mock_illustrator = MagicMock()
        mock_illustrator.illustrate_scenes = AsyncMock(return_value=_make_illustration_results())
        mock_illustrator_cls.return_value = mock_illustrator

        response = client.post("/api/quests/generate", json=_make_request_body(character_name="Rex"))

        assert response.status_code == 200
        title = response.json()["quest"]["title"]
        assert "Rex" in title


class TestGenerateQuestEndpointCustomLesson:
    """Tests for custom lesson moderation flow."""

    @patch("main.SceneIllustrator")
    @patch("main.QuestEngine")
    @patch("main.ContentModerator")
    def test_custom_lesson_approved_generates_quest(
        self, mock_moderator_cls, mock_engine_cls, mock_illustrator_cls
    ):
        """An approved custom lesson generates a quest with sanitized text."""
        # Setup ContentModerator mock
        mock_moderator = MagicMock()
        mock_moderator.validate_lesson = AsyncMock(return_value={
            "is_appropriate": True,
            "sanitized_lesson": "Learning to share with siblings",
            "rejection_reason": None,
        })
        mock_moderator_cls.return_value = mock_moderator

        # Setup QuestEngine mock
        mock_engine = MagicMock()
        mock_engine.generate_quest = AsyncMock(return_value=_make_8_scenes())
        mock_engine_cls.return_value = mock_engine

        # Setup SceneIllustrator mock
        mock_illustrator = MagicMock()
        mock_illustrator.illustrate_scenes = AsyncMock(return_value=_make_illustration_results())
        mock_illustrator_cls.return_value = mock_illustrator

        body = _make_request_body(lesson="learning to share with my brother")
        response = client.post("/api/quests/generate", json=body)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        # Uses sanitized lesson text
        assert data["quest"]["lesson"] == "Learning to share with siblings"
        # Moderation was called
        mock_moderator.validate_lesson.assert_called_once()

    @patch("main.ContentModerator")
    def test_custom_lesson_rejected_returns_422(self, mock_moderator_cls):
        """A rejected custom lesson returns 422 with child-friendly message."""
        mock_moderator = MagicMock()
        mock_moderator.validate_lesson = AsyncMock(return_value={
            "is_appropriate": False,
            "sanitized_lesson": "inappropriate topic",
            "rejection_reason": "Content not suitable for children",
        })
        mock_moderator_cls.return_value = mock_moderator

        body = _make_request_body(lesson="something inappropriate for kids")
        response = client.post("/api/quests/generate", json=body)

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.CUSTOM_LESSON_REJECTED.value
        assert "pick a different topic" in detail["message"].lower() or "fun lessons" in detail["message"].lower()

    @patch("main.ContentModerator")
    def test_moderation_system_error_returns_500(self, mock_moderator_cls):
        """A ModerationError returns 500 with child-friendly message."""
        mock_moderator = MagicMock()
        mock_moderator.validate_lesson = AsyncMock(
            side_effect=ModerationError("LLM system failure")
        )
        mock_moderator_cls.return_value = mock_moderator

        body = _make_request_body(lesson="custom topic about friendship")
        response = client.post("/api/quests/generate", json=body)

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.SERVICE_UNAVAILABLE.value
        # No technical jargon
        assert "LLM" not in detail["message"]
        assert "system" not in detail["message"].lower() or "story helper" in detail["message"].lower()

    @patch("main.SceneIllustrator")
    @patch("main.QuestEngine")
    def test_predefined_lesson_skips_moderation(self, mock_engine_cls, mock_illustrator_cls):
        """Predefined lessons (e.g. 'sharing') do not trigger content moderation."""
        mock_engine = MagicMock()
        mock_engine.generate_quest = AsyncMock(return_value=_make_8_scenes())
        mock_engine_cls.return_value = mock_engine

        mock_illustrator = MagicMock()
        mock_illustrator.illustrate_scenes = AsyncMock(return_value=_make_illustration_results())
        mock_illustrator_cls.return_value = mock_illustrator

        # Use a predefined lesson
        body = _make_request_body(lesson="kindness")
        with patch("main.ContentModerator") as mock_mod_cls:
            response = client.post("/api/quests/generate", json=body)
            # ContentModerator should not be instantiated for predefined lessons
            mock_mod_cls.assert_not_called()

        assert response.status_code == 200


class TestGenerateQuestEndpointErrors:
    """Tests for error handling."""

    @patch("main.QuestEngine")
    def test_quest_generation_failure_returns_500(self, mock_engine_cls):
        """QuestGenerationError returns 500 with child-friendly message."""
        mock_engine = MagicMock()
        mock_engine.generate_quest = AsyncMock(
            side_effect=QuestGenerationError("Both providers failed")
        )
        mock_engine_cls.return_value = mock_engine

        response = client.post("/api/quests/generate", json=_make_request_body())

        assert response.status_code == 500
        detail = response.json()["detail"]
        assert detail["code"] == ErrorCode.GENERATION_FAILED.value
        # No technical jargon
        assert "provider" not in detail["message"].lower()
        assert "error" not in detail["message"].lower()

    @patch("main.SceneIllustrator")
    @patch("main.QuestEngine")
    def test_illustration_failure_uses_placeholders(self, mock_engine_cls, mock_illustrator_cls):
        """When illustration fails entirely, placeholders are used for all scenes."""
        mock_engine = MagicMock()
        mock_engine.generate_quest = AsyncMock(return_value=_make_8_scenes())
        mock_engine_cls.return_value = mock_engine

        mock_illustrator = MagicMock()
        mock_illustrator.illustrate_scenes = AsyncMock(
            side_effect=Exception("Bedrock image service down")
        )
        mock_illustrator_cls.return_value = mock_illustrator

        response = client.post("/api/quests/generate", json=_make_request_body())

        # Should still succeed with placeholder images
        assert response.status_code == 200
        scenes = response.json()["quest"]["scenes"]
        assert len(scenes) == 8
        for scene in scenes:
            assert scene["image_url"] == PLACEHOLDER_IMAGE_URL

    @patch("main.SceneIllustrator")
    @patch("main.QuestEngine")
    def test_partial_illustration_failure_uses_mixed_urls(self, mock_engine_cls, mock_illustrator_cls):
        """When some illustrations fail, those scenes get placeholders."""
        mock_engine = MagicMock()
        mock_engine.generate_quest = AsyncMock(return_value=_make_8_scenes())
        mock_engine_cls.return_value = mock_engine

        # Only 6 scenes got illustrations, scenes 3 and 7 are missing
        partial_results = [
            {"scene_number": i + 1, "image_url": f"https://cdn.example.com/scene-{i+1}.png"}
            for i in range(8)
            if (i + 1) not in (3, 7)
        ]
        # Scenes 3 and 7 got placeholders from the illustrator itself
        partial_results.append({"scene_number": 3, "image_url": PLACEHOLDER_IMAGE_URL})
        partial_results.append({"scene_number": 7, "image_url": PLACEHOLDER_IMAGE_URL})

        mock_illustrator = MagicMock()
        mock_illustrator.illustrate_scenes = AsyncMock(return_value=partial_results)
        mock_illustrator_cls.return_value = mock_illustrator

        response = client.post("/api/quests/generate", json=_make_request_body())

        assert response.status_code == 200
        scenes = response.json()["quest"]["scenes"]
        # Scene 3 and 7 should have placeholders
        assert scenes[2]["image_url"] == PLACEHOLDER_IMAGE_URL
        assert scenes[6]["image_url"] == PLACEHOLDER_IMAGE_URL
        # Others should have real URLs
        assert "cdn.example.com" in scenes[0]["image_url"]

    def test_missing_required_fields_returns_422(self):
        """Missing required fields return 422 validation error."""
        # Missing character_name
        body = {
            "character_id": "test-uuid",
            "character_description": "A bunny",
            "lesson": "sharing",
            "session_id": "test-session",
        }
        response = client.post("/api/quests/generate", json=body)
        assert response.status_code == 422

    def test_invalid_genre_returns_422(self):
        """Invalid genre value returns 422 validation error."""
        body = _make_request_body(genre="invalid_genre")
        response = client.post("/api/quests/generate", json=body)
        assert response.status_code == 422

    @patch("main.SceneIllustrator")
    @patch("main.QuestEngine")
    def test_default_genre_is_fantasy_kingdom(self, mock_engine_cls, mock_illustrator_cls):
        """When genre is not specified, defaults to fantasy_kingdom."""
        mock_engine = MagicMock()
        mock_engine.generate_quest = AsyncMock(return_value=_make_8_scenes())
        mock_engine_cls.return_value = mock_engine

        mock_illustrator = MagicMock()
        mock_illustrator.illustrate_scenes = AsyncMock(return_value=_make_illustration_results())
        mock_illustrator_cls.return_value = mock_illustrator

        # Request without genre field
        body = {
            "character_id": "test-uuid",
            "character_name": "Sparkle",
            "character_description": "A pink bunny",
            "lesson": "sharing",
            "session_id": "test-session",
        }
        response = client.post("/api/quests/generate", json=body)

        assert response.status_code == 200
        assert response.json()["quest"]["genre"] == "fantasy_kingdom"


class TestGenerateQuestEndpointChildFriendly:
    """Tests that all error messages are child-friendly."""

    @patch("main.QuestEngine")
    def test_generation_error_no_technical_jargon(self, mock_engine_cls):
        """Generation failure message has no technical language."""
        mock_engine = MagicMock()
        mock_engine.generate_quest = AsyncMock(
            side_effect=QuestGenerationError("ConnectionTimeout to Bedrock")
        )
        mock_engine_cls.return_value = mock_engine

        response = client.post("/api/quests/generate", json=_make_request_body())

        assert response.status_code == 500
        message = response.json()["detail"]["message"]
        assert "Bedrock" not in message
        assert "Connection" not in message
        assert "Timeout" not in message
        assert "timeout" not in message

    @patch("main.ContentModerator")
    def test_moderation_rejection_no_technical_jargon(self, mock_moderator_cls):
        """Moderation rejection message is child-friendly."""
        mock_moderator = MagicMock()
        mock_moderator.validate_lesson = AsyncMock(return_value={
            "is_appropriate": False,
            "sanitized_lesson": "bad topic",
            "rejection_reason": "violent content detected",
        })
        mock_moderator_cls.return_value = mock_moderator

        body = _make_request_body(lesson="a violent topic")
        response = client.post("/api/quests/generate", json=body)

        assert response.status_code == 422
        message = response.json()["detail"]["message"]
        # Should not expose the rejection reason
        assert "violent" not in message.lower()
        assert "detected" not in message.lower()
