"""
Validation tests for task 1.3: Backend project structure verification.
Ensures all modules, models, config, and dependencies are properly set up.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from pydantic import ValidationError


class TestModuleImports:
    """Verify all 9 service modules can be imported."""

    def test_import_llm_router(self):
        from llm_router import LLMRouter, LLMRouterError
        assert LLMRouter is not None

    def test_import_vision_analyzer(self):
        from vision_analyzer import VisionAnalyzer, ContentBlockedError, VisionAnalysisError
        assert VisionAnalyzer is not None

    def test_import_character_generator(self):
        from character_generator import CharacterGenerator, GenerationFailedError, ContentFilteredError
        assert CharacterGenerator is not None

    def test_import_quest_engine(self):
        from quest_engine import QuestEngine, QuestGenerationError
        assert QuestEngine is not None

    def test_import_scene_illustrator(self):
        from scene_illustrator import SceneIllustrator
        assert SceneIllustrator is not None

    def test_import_tts_service(self):
        from tts_service import TTSService
        assert TTSService is not None

    def test_import_storage_service(self):
        from storage_service import StorageService, StorageError
        assert StorageService is not None

    def test_import_content_moderator(self):
        from content_moderator import ContentModerator, ModerationError
        assert ContentModerator is not None

    def test_import_collab_manager(self):
        from collab_manager import CollabManager, CollabRoom, RoomExpiredError, RoomFullError
        assert CollabManager is not None


class TestConfigSettings:
    """Verify environment variable configuration loads properly."""

    def test_config_loads(self):
        from config import settings
        assert settings is not None

    def test_config_defaults(self):
        from config import settings
        assert settings.aws_region == "us-east-1"
        assert settings.app_name == "fablecraft"
        assert settings.bedrock_timeout_ms == 15000
        assert settings.openrouter_timeout_ms == 15000
        assert settings.max_retries == 3
        assert settings.presigned_url_expiry_seconds == 3600
        assert settings.cache_control_max_age == 3600

    def test_config_model_ids(self):
        from config import settings
        assert "claude" in settings.bedrock_vision_model
        assert "claude" in settings.bedrock_quest_model
        assert "claude" in settings.bedrock_moderation_model
        assert settings.bedrock_image_model != ""

    def test_config_openrouter_models(self):
        from config import settings
        assert settings.openrouter_vision_model != ""
        assert settings.openrouter_quest_model != ""
        assert settings.openrouter_moderation_model != ""

    def test_config_polly(self):
        from config import settings
        assert settings.polly_voice_id != ""
        assert settings.polly_engine == "neural"


class TestPydanticModels:
    """Verify Pydantic models validate correctly per design contracts."""

    def test_character_generate_request_valid(self):
        from models import CharacterGenerateRequest
        req = CharacterGenerateRequest(
            drawing_data="base64data",
            character_name="Sparkle",
            session_id="550e8400-e29b-41d4-a716-446655440000",
        )
        assert req.character_name == "Sparkle"

    def test_character_generate_request_rejects_empty_name(self):
        from models import CharacterGenerateRequest
        with pytest.raises(ValidationError):
            CharacterGenerateRequest(
                drawing_data="data",
                character_name="",
                session_id="sid",
            )

    def test_quest_generate_request_valid(self):
        from models import QuestGenerateRequest, Genre
        req = QuestGenerateRequest(
            character_id="id1",
            character_name="Sparkle",
            character_description="A pink bunny",
            lesson="sharing",
            genre=Genre.fantasy_kingdom,
            session_id="sid1",
        )
        assert req.genre == Genre.fantasy_kingdom

    def test_quest_generate_request_defaults_genre(self):
        from models import QuestGenerateRequest, Genre
        req = QuestGenerateRequest(
            character_id="id1",
            character_name="Sparkle",
            character_description="desc",
            lesson="kindness",
            session_id="sid1",
        )
        assert req.genre == Genre.fantasy_kingdom

    def test_tts_synthesize_request_valid(self):
        from models import TTSSynthesizeRequest
        req = TTSSynthesizeRequest(text="Hello world", session_id="sid")
        assert req.text == "Hello world"

    def test_tts_synthesize_request_rejects_empty_text(self):
        from models import TTSSynthesizeRequest
        with pytest.raises(ValidationError):
            TTSSynthesizeRequest(text="", session_id="sid")

    def test_lesson_validate_request_valid(self):
        from models import LessonValidateRequest
        req = LessonValidateRequest(custom_lesson="being kind to others", session_id="sid")
        assert req.custom_lesson == "being kind to others"

    def test_lesson_validate_request_rejects_short(self):
        from models import LessonValidateRequest
        with pytest.raises(ValidationError):
            LessonValidateRequest(custom_lesson="ab", session_id="sid")

    def test_lesson_validate_request_rejects_long(self):
        from models import LessonValidateRequest
        with pytest.raises(ValidationError):
            LessonValidateRequest(custom_lesson="x" * 201, session_id="sid")

    def test_genre_enum_values(self):
        from models import Genre
        assert Genre.fantasy_kingdom.value == "fantasy_kingdom"
        assert Genre.outer_space.value == "outer_space"
        assert Genre.underwater_world.value == "underwater_world"
        assert Genre.jungle_safari.value == "jungle_safari"

    def test_error_response_model(self):
        from models import ErrorResponse, ErrorCode
        err = ErrorResponse(
            code=ErrorCode.CONTENT_BLOCKED,
            message="Let's try drawing something different!",
        )
        assert err.status == "error"
        assert err.code == ErrorCode.CONTENT_BLOCKED

    def test_parent_dashboard_response(self):
        from models import ParentDashboardResponse, ParentDashboardStats
        resp = ParentDashboardResponse(
            stats=ParentDashboardStats(
                quests_completed=5,
                lessons_covered=3,
                total_coins=40,
                characters_created=2,
                total_time_minutes=120,
            ),
            recent_quests=[],
        )
        assert resp.stats.quests_completed == 5

    def test_collab_events(self):
        from models import CollabJoinEvent, CollabAnswerEvent
        join = CollabJoinEvent(player_name="Alex", room_code="1234")
        assert join.type == "join"
        answer = CollabAnswerEvent(scene_number=1, option_id="a")
        assert answer.type == "select_answer"

    def test_scene_model_constraints(self):
        from models import Scene, Option
        scene = Scene(
            scene_number=1,
            narrative="Test narrative",
            question="What should we do?",
            options=[
                Option(id="a", text="Help", is_correct=True, feedback="Great!"),
                Option(id="b", text="Ignore", is_correct=False, feedback="Try again!"),
            ],
            image_url="https://example.com/img.png",
        )
        assert scene.scene_number == 1
        assert len(scene.options) == 2

    def test_scene_rejects_invalid_number(self):
        from models import Scene, Option
        with pytest.raises(ValidationError):
            Scene(
                scene_number=9,  # Must be 1-8
                narrative="Test",
                question="Q?",
                options=[
                    Option(id="a", text="A", is_correct=True, feedback="OK"),
                    Option(id="b", text="B", is_correct=False, feedback="No"),
                ],
                image_url="https://example.com/img.png",
            )


class TestFastAPIApp:
    """Verify the FastAPI application loads with correct routes."""

    def test_app_imports(self):
        from main import app
        assert app is not None

    def test_app_title(self):
        from main import app
        assert app.title == "Fablecraft API"

    def test_app_routes_exist(self):
        from main import app
        route_paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert "/api/characters/generate" in route_paths
        assert "/api/quests/generate" in route_paths
        assert "/api/tts/synthesize" in route_paths
        assert "/api/lessons/validate" in route_paths
        assert "/api/parent/dashboard" in route_paths
        assert "/health" in route_paths
        assert "/" in route_paths
