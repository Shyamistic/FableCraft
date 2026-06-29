"""
Unit tests for the Quest Engine service.
Tests prompt building, LLM response parsing, validation, and quest generation.
"""

import json
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from quest_engine import (
    QuestEngine,
    QuestGenerationError,
    _build_system_prompt,
    _build_user_prompt,
    _parse_llm_response,
    _validate_and_build_scenes,
    GENRE_SETTINGS,
    CONTENT_SAFETY_RULES,
)
from models import Genre, Scene, Option


# --- Helper: build a valid 8-scene LLM response ---

def _make_valid_scene(scene_number: int, character_name: str = "Sparkle") -> dict:
    """Create a valid scene dict in the option_a/option_b format."""
    return {
        "scene_number": scene_number,
        "narrative": f"{character_name} the pink bunny sees a friend who needs help in the meadow.",
        "question": f"What should {character_name} do?",
        "option_a": {
            "text": "Help the friend kindly",
            "is_correct": True,
            "feedback": "Great job being kind!",
        },
        "option_b": {
            "text": "Walk away and ignore them",
            "is_correct": False,
            "feedback": "That wasn't very kind. Try again!",
        },
    }


def _make_valid_response(character_name: str = "Sparkle") -> str:
    """Create a valid 8-scene JSON response."""
    scenes = [_make_valid_scene(i + 1, character_name) for i in range(8)]
    return json.dumps({"scenes": scenes})


# --- Tests for _build_system_prompt ---


class TestBuildSystemPrompt:
    """Tests for the system prompt builder."""

    def test_includes_character_name(self):
        prompt = _build_system_prompt("Sparkle", "A pink bunny with stars", "sharing", Genre.fantasy_kingdom)
        assert "Sparkle" in prompt

    def test_includes_character_description(self):
        prompt = _build_system_prompt("Mila", "A cheerful pink bunny with sparkly star patterns", "kindness", Genre.outer_space)
        assert "A cheerful pink bunny with sparkly star patterns" in prompt

    def test_includes_lesson(self):
        prompt = _build_system_prompt("Rex", "A green dragon", "honesty", Genre.jungle_safari)
        assert "honesty" in prompt

    def test_includes_genre_setting(self):
        prompt = _build_system_prompt("Finn", "A blue fish", "sharing", Genre.underwater_world)
        genre_config = GENRE_SETTINGS[Genre.underwater_world]
        assert genre_config["setting"] in prompt

    def test_includes_genre_vocabulary(self):
        prompt = _build_system_prompt("Astro", "A robot", "patience", Genre.outer_space)
        assert "planet" in prompt
        assert "rocket" in prompt

    def test_includes_genre_characters(self):
        prompt = _build_system_prompt("Leo", "A lion cub", "sharing", Genre.jungle_safari)
        assert "friendly monkeys" in prompt

    def test_includes_story_structure_instructions(self):
        prompt = _build_system_prompt("Rex", "A dragon", "courage", Genre.fantasy_kingdom)
        assert "Scenes 1-2" in prompt
        assert "INTRODUCTION" in prompt
        assert "Scenes 3-6" in prompt
        assert "RISING ACTION" in prompt
        assert "Scenes 7-8" in prompt
        assert "RESOLUTION" in prompt

    def test_includes_word_count_limits(self):
        prompt = _build_system_prompt("Rex", "A dragon", "sharing", Genre.fantasy_kingdom)
        assert "MAXIMUM 40 words" in prompt
        assert "MAXIMUM 15 words" in prompt
        assert "MAXIMUM 20 words" in prompt
        assert "MAXIMUM 25 words" in prompt

    def test_includes_content_safety_rules(self):
        prompt = _build_system_prompt("Rex", "A dragon", "sharing", Genre.fantasy_kingdom)
        assert "NO violence" in prompt
        assert "NO weapons" in prompt
        assert "NO death" in prompt
        assert "NO dangerous situations" in prompt

    def test_includes_prosocial_instructions(self):
        prompt = _build_system_prompt("Rex", "A dragon", "sharing", Genre.fantasy_kingdom)
        assert "PROSOCIAL" in prompt
        assert "ANTISOCIAL" in prompt

    def test_requires_8_scenes(self):
        prompt = _build_system_prompt("Rex", "A dragon", "sharing", Genre.fantasy_kingdom)
        assert "8 scenes" in prompt or "EXACTLY 8" in prompt

    def test_requires_character_name_in_every_scene(self):
        prompt = _build_system_prompt("Sparkle", "A pink bunny", "sharing", Genre.fantasy_kingdom)
        # The prompt should instruct to mention name in EVERY scene
        assert "EVERY scene" in prompt


# --- Tests for _build_user_prompt ---


class TestBuildUserPrompt:
    """Tests for the user prompt builder."""

    def test_includes_character_name(self):
        prompt = _build_user_prompt("Sparkle", "A pink bunny", "sharing", Genre.fantasy_kingdom)
        assert "Sparkle" in prompt

    def test_includes_lesson(self):
        prompt = _build_user_prompt("Rex", "A dragon", "kindness", Genre.outer_space)
        assert "kindness" in prompt

    def test_includes_genre(self):
        prompt = _build_user_prompt("Rex", "A dragon", "sharing", Genre.underwater_world)
        assert "underwater world" in prompt


# --- Tests for _parse_llm_response ---


class TestParseLlmResponse:
    """Tests for parsing LLM JSON responses."""

    def test_parses_valid_json_with_scenes_key(self):
        response = _make_valid_response()
        scenes = _parse_llm_response(response)
        assert len(scenes) == 8

    def test_parses_json_list_directly(self):
        scenes_list = [_make_valid_scene(i + 1) for i in range(8)]
        response = json.dumps(scenes_list)
        scenes = _parse_llm_response(response)
        assert len(scenes) == 8

    def test_strips_markdown_code_blocks(self):
        raw = "```json\n" + _make_valid_response() + "\n```"
        scenes = _parse_llm_response(raw)
        assert len(scenes) == 8

    def test_strips_markdown_code_blocks_without_language(self):
        raw = "```\n" + _make_valid_response() + "\n```"
        scenes = _parse_llm_response(raw)
        assert len(scenes) == 8

    def test_raises_on_invalid_json(self):
        with pytest.raises(QuestGenerationError, match="Failed to parse"):
            _parse_llm_response("this is not json at all")

    def test_raises_on_missing_scenes_key(self):
        with pytest.raises(QuestGenerationError, match="missing 'scenes' key"):
            _parse_llm_response('{"data": "something"}')

    def test_handles_whitespace_around_response(self):
        response = "  \n" + _make_valid_response() + "\n  "
        scenes = _parse_llm_response(response)
        assert len(scenes) == 8


# --- Tests for _validate_and_build_scenes ---


class TestValidateAndBuildScenes:
    """Tests for scene validation and model building."""

    def test_valid_8_scenes_returns_scene_models(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(8)]
        scenes = _validate_and_build_scenes(raw_scenes)
        assert len(scenes) == 8
        assert all(isinstance(s, Scene) for s in scenes)

    def test_each_scene_has_two_options(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(8)]
        scenes = _validate_and_build_scenes(raw_scenes)
        for scene in scenes:
            assert len(scene.options) == 2

    def test_each_scene_has_one_correct_option(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(8)]
        scenes = _validate_and_build_scenes(raw_scenes)
        for scene in scenes:
            correct_count = sum(1 for opt in scene.options if opt.is_correct)
            assert correct_count == 1

    def test_scene_numbers_match(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(8)]
        scenes = _validate_and_build_scenes(raw_scenes)
        for i, scene in enumerate(scenes):
            assert scene.scene_number == i + 1

    def test_raises_if_not_8_scenes(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(5)]
        with pytest.raises(QuestGenerationError, match="Expected exactly 8 scenes"):
            _validate_and_build_scenes(raw_scenes)

    def test_raises_if_no_correct_option(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(8)]
        # Make scene 3 have no correct option
        raw_scenes[2]["option_a"]["is_correct"] = False
        raw_scenes[2]["option_b"]["is_correct"] = False
        with pytest.raises(QuestGenerationError, match="exactly 1 correct option"):
            _validate_and_build_scenes(raw_scenes)

    def test_raises_if_two_correct_options(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(8)]
        # Make scene 1 have two correct options
        raw_scenes[0]["option_a"]["is_correct"] = True
        raw_scenes[0]["option_b"]["is_correct"] = True
        with pytest.raises(QuestGenerationError, match="exactly 1 correct option"):
            _validate_and_build_scenes(raw_scenes)

    def test_raises_if_missing_narrative(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(8)]
        raw_scenes[0]["narrative"] = ""
        with pytest.raises(QuestGenerationError, match="missing narrative or question"):
            _validate_and_build_scenes(raw_scenes)

    def test_raises_if_missing_question(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(8)]
        raw_scenes[0]["question"] = ""
        with pytest.raises(QuestGenerationError, match="missing narrative or question"):
            _validate_and_build_scenes(raw_scenes)

    def test_raises_if_missing_options(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(8)]
        del raw_scenes[0]["option_a"]
        del raw_scenes[0]["option_b"]
        with pytest.raises(QuestGenerationError, match="missing options"):
            _validate_and_build_scenes(raw_scenes)

    def test_supports_options_as_list_format(self):
        """Support alternative format where options come as a list."""
        raw_scenes = []
        for i in range(8):
            raw_scenes.append({
                "scene_number": i + 1,
                "narrative": f"Sparkle the bunny sees a friend in scene {i + 1}.",
                "question": "What should Sparkle do?",
                "options": [
                    {"id": "a", "text": "Help the friend", "is_correct": True, "feedback": "Great!"},
                    {"id": "b", "text": "Walk away", "is_correct": False, "feedback": "Try again!"},
                ],
            })
        scenes = _validate_and_build_scenes(raw_scenes)
        assert len(scenes) == 8

    def test_option_ids_assigned_correctly(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(8)]
        scenes = _validate_and_build_scenes(raw_scenes)
        for scene in scenes:
            ids = [opt.id for opt in scene.options]
            assert "a" in ids
            assert "b" in ids

    def test_image_url_defaults_to_empty(self):
        raw_scenes = [_make_valid_scene(i + 1) for i in range(8)]
        scenes = _validate_and_build_scenes(raw_scenes)
        for scene in scenes:
            assert scene.image_url == ""


# --- Tests for QuestEngine.generate_quest ---


class TestQuestEngineGenerateQuest:
    """Tests for the full generate_quest method."""

    @pytest.fixture
    def engine(self):
        """Create a QuestEngine with mocked dependencies."""
        with patch("config.settings") as mock_settings, \
             patch("llm_router.LLMRouter") as mock_router_class:
            mock_settings.aws_region = "us-east-1"
            mock_router_instance = AsyncMock()
            mock_router_class.return_value = mock_router_instance
            engine = QuestEngine()
            engine.llm_router = mock_router_instance
            yield engine

    @pytest.mark.asyncio
    async def test_returns_8_scenes_on_success(self, engine):
        """Successful generation returns a list of 8 Scene objects."""
        engine.llm_router.quest_generation.return_value = {
            "content": _make_valid_response("Sparkle"),
            "provider": "bedrock",
            "latency_ms": 5000,
        }

        scenes = await engine.generate_quest(
            character_name="Sparkle",
            character_description="A pink bunny with sparkly star patterns",
            lesson="sharing",
            genre=Genre.fantasy_kingdom,
            session_id="test-session-123",
        )

        assert len(scenes) == 8
        assert all(isinstance(s, Scene) for s in scenes)

    @pytest.mark.asyncio
    async def test_calls_llm_router_quest_generation(self, engine):
        """Routes through LLM Router's quest_generation method."""
        engine.llm_router.quest_generation.return_value = {
            "content": _make_valid_response("Rex"),
            "provider": "bedrock",
            "latency_ms": 3000,
        }

        await engine.generate_quest(
            character_name="Rex",
            character_description="A green dragon with golden wings",
            lesson="honesty",
            genre=Genre.outer_space,
            session_id="test-session-456",
        )

        engine.llm_router.quest_generation.assert_called_once()
        call_kwargs = engine.llm_router.quest_generation.call_args[1]
        assert "prompt" in call_kwargs
        assert "system_prompt" in call_kwargs
        assert "Rex" in call_kwargs["prompt"]

    @pytest.mark.asyncio
    async def test_raises_quest_generation_error_on_llm_failure(self, engine):
        """Raises QuestGenerationError when LLM Router fails."""
        engine.llm_router.quest_generation.side_effect = Exception("Both providers failed")

        with pytest.raises(QuestGenerationError, match="Quest generation failed"):
            await engine.generate_quest(
                character_name="Sparkle",
                character_description="A pink bunny",
                lesson="sharing",
                genre=Genre.fantasy_kingdom,
                session_id="test-session",
            )

    @pytest.mark.asyncio
    async def test_raises_quest_generation_error_on_invalid_json(self, engine):
        """Raises QuestGenerationError when LLM returns unparseable response."""
        engine.llm_router.quest_generation.return_value = {
            "content": "Sorry, I cannot generate that quest.",
            "provider": "bedrock",
            "latency_ms": 2000,
        }

        with pytest.raises(QuestGenerationError):
            await engine.generate_quest(
                character_name="Sparkle",
                character_description="A pink bunny",
                lesson="sharing",
                genre=Genre.fantasy_kingdom,
                session_id="test-session",
            )

    @pytest.mark.asyncio
    async def test_raises_quest_generation_error_on_wrong_scene_count(self, engine):
        """Raises QuestGenerationError when LLM returns wrong number of scenes."""
        # Only 5 scenes
        bad_response = json.dumps({
            "scenes": [_make_valid_scene(i + 1) for i in range(5)]
        })
        engine.llm_router.quest_generation.return_value = {
            "content": bad_response,
            "provider": "openrouter",
            "latency_ms": 4000,
        }

        with pytest.raises(QuestGenerationError, match="Expected exactly 8"):
            await engine.generate_quest(
                character_name="Rex",
                character_description="A dragon",
                lesson="sharing",
                genre=Genre.jungle_safari,
                session_id="test-session",
            )

    @pytest.mark.asyncio
    async def test_system_prompt_contains_genre_and_character(self, engine):
        """System prompt includes genre settings and character details."""
        engine.llm_router.quest_generation.return_value = {
            "content": _make_valid_response("Nemo"),
            "provider": "bedrock",
            "latency_ms": 3000,
        }

        await engine.generate_quest(
            character_name="Nemo",
            character_description="A blue fish with orange stripes",
            lesson="patience",
            genre=Genre.underwater_world,
            session_id="test-session",
        )

        call_kwargs = engine.llm_router.quest_generation.call_args[1]
        system_prompt = call_kwargs["system_prompt"]
        assert "Nemo" in system_prompt
        assert "underwater" in system_prompt.lower()
        assert "patience" in system_prompt

    @pytest.mark.asyncio
    async def test_handles_markdown_wrapped_response(self, engine):
        """Handles LLM responses wrapped in markdown code blocks."""
        wrapped = "```json\n" + _make_valid_response("Sparkle") + "\n```"
        engine.llm_router.quest_generation.return_value = {
            "content": wrapped,
            "provider": "bedrock",
            "latency_ms": 5000,
        }

        scenes = await engine.generate_quest(
            character_name="Sparkle",
            character_description="A pink bunny with stars",
            lesson="sharing",
            genre=Genre.fantasy_kingdom,
            session_id="test-session",
        )

        assert len(scenes) == 8


# --- Tests for genre settings ---


class TestGenreSettings:
    """Tests for genre-specific configuration."""

    def test_all_genres_have_settings(self):
        for genre in Genre:
            assert genre in GENRE_SETTINGS

    def test_each_genre_has_required_keys(self):
        for genre, config in GENRE_SETTINGS.items():
            assert "setting" in config
            assert "vocabulary" in config
            assert "characters" in config

    def test_fantasy_kingdom_setting(self):
        config = GENRE_SETTINGS[Genre.fantasy_kingdom]
        assert "castle" in config["setting"] or "kingdom" in config["setting"]

    def test_outer_space_setting(self):
        config = GENRE_SETTINGS[Genre.outer_space]
        assert "space" in config["setting"] or "planet" in config["setting"]

    def test_underwater_world_setting(self):
        config = GENRE_SETTINGS[Genre.underwater_world]
        assert "underwater" in config["setting"] or "ocean" in config["setting"]

    def test_jungle_safari_setting(self):
        config = GENRE_SETTINGS[Genre.jungle_safari]
        assert "jungle" in config["setting"]
