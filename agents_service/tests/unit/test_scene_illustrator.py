"""
Unit tests for SceneIllustrator service.
Tests scene illustration generation, batch processing, retry logic,
genre styles, character consistency, safety filtering, and placeholder fallback.
"""

import base64
import json
import uuid
from unittest.mock import MagicMock, patch, AsyncMock

import pytest
from botocore.exceptions import ClientError, BotoCoreError

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


@pytest.fixture
def mock_settings():
    """Create mock settings for testing."""
    settings = MagicMock()
    settings.aws_region = "us-east-1"
    settings.bedrock_image_model = "stability.stable-diffusion-xl-v1"
    settings.s3_bucket_name = "test-bucket"
    settings.cloudfront_domain = None
    settings.presigned_url_expiry_seconds = 3600
    settings.cache_control_max_age = 3600
    settings.max_retries = 3
    settings.retry_base_delay_ms = 100
    return settings


@pytest.fixture
def mock_bedrock_client():
    """Create a mock Bedrock runtime client."""
    return MagicMock()


@pytest.fixture
def mock_storage():
    """Create a mock StorageService."""
    storage = MagicMock()
    storage.upload_bytes = AsyncMock(return_value="https://cdn.example.com/scenes/test.png")
    return storage


@pytest.fixture
def scene_illustrator(mock_settings, mock_bedrock_client, mock_storage):
    """Create a SceneIllustrator instance with mocked dependencies."""
    with patch("scene_illustrator.boto3") as mock_boto3:
        mock_boto3.client.return_value = mock_bedrock_client
        with patch("config.settings", mock_settings):
            with patch("scene_illustrator.StorageService", return_value=mock_storage):
                from scene_illustrator import SceneIllustrator

                illustrator = SceneIllustrator()
                illustrator._bedrock_client = mock_bedrock_client
                illustrator._storage = mock_storage
                illustrator.settings = mock_settings
                return illustrator


def _make_bedrock_response(image_data: bytes = b"fake_png_scene_data", finish_reason: str = "SUCCESS"):
    """Helper to create a mock Bedrock image generation response."""
    b64_image = base64.b64encode(image_data).decode()
    response_body = {
        "result": "success",
        "artifacts": [
            {
                "base64": b64_image,
                "finishReason": finish_reason,
            }
        ],
    }
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps(response_body).encode()
    return {"body": mock_body}


def _make_filtered_response():
    """Helper to create a content-filtered Bedrock response."""
    response_body = {
        "result": "success",
        "artifacts": [
            {
                "base64": "",
                "finishReason": "CONTENT_FILTERED",
            }
        ],
    }
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps(response_body).encode()
    return {"body": mock_body}


def _make_scenes(count: int = 8):
    """Helper to create a list of scene dicts."""
    return [
        {
            "scene_number": i + 1,
            "narrative": f"Scene {i + 1}: The character goes on an adventure.",
        }
        for i in range(count)
    ]


class TestBuildScenePrompt:
    """Tests for scene prompt construction."""

    def test_prompt_includes_narrative(self, scene_illustrator):
        """Prompt should include the scene narrative."""
        from models import Genre

        prompt = scene_illustrator._build_scene_prompt(
            narrative="The bunny found a golden key in the meadow.",
            character_description="A cheerful pink bunny with sparkly stars",
            character_type="bunny",
            genre=Genre.fantasy_kingdom,
        )
        assert "The bunny found a golden key in the meadow" in prompt

    def test_prompt_includes_character_description(self, scene_illustrator):
        """Prompt should include character description for consistency."""
        from models import Genre

        prompt = scene_illustrator._build_scene_prompt(
            narrative="A scene in space.",
            character_description="A brave red dragon with golden wings",
            character_type="dragon",
            genre=Genre.outer_space,
        )
        assert "A brave red dragon with golden wings" in prompt

    def test_prompt_includes_character_type(self, scene_illustrator):
        """Prompt should include the character type."""
        from models import Genre

        prompt = scene_illustrator._build_scene_prompt(
            narrative="A scene.",
            character_description="desc",
            character_type="robot",
            genre=Genre.jungle_safari,
        )
        assert "robot" in prompt

    def test_prompt_includes_genre_style(self, scene_illustrator):
        """Prompt should include genre-specific visual style."""
        from models import Genre

        prompt = scene_illustrator._build_scene_prompt(
            narrative="A scene.",
            character_description="desc",
            character_type="cat",
            genre=Genre.underwater_world,
        )
        assert "ocean" in prompt or "coral reef" in prompt or "aquatic" in prompt

    def test_prompt_specifies_16_9_format(self, scene_illustrator):
        """Prompt should mention 16:9 widescreen format."""
        from models import Genre

        prompt = scene_illustrator._build_scene_prompt(
            narrative="A scene.",
            character_description="desc",
            character_type="cat",
            genre=Genre.fantasy_kingdom,
        )
        assert "16:9" in prompt

    def test_prompt_emphasizes_child_friendly(self, scene_illustrator):
        """Prompt should emphasize child-friendly content."""
        from models import Genre

        prompt = scene_illustrator._build_scene_prompt(
            narrative="A scene.",
            character_description="desc",
            character_type="cat",
            genre=Genre.fantasy_kingdom,
        )
        assert "child-friendly" in prompt


class TestBuildRequestBody:
    """Tests for request body construction."""

    def test_request_body_has_16_9_dimensions(self, scene_illustrator):
        """Request body should specify 16:9 aspect ratio (1024x576)."""
        body = json.loads(scene_illustrator._build_request_body("test prompt"))
        assert body["width"] == 1024
        assert body["height"] == 576

    def test_request_body_includes_negative_prompt(self, scene_illustrator):
        """Request body should include safety negative prompt."""
        body = json.loads(scene_illustrator._build_request_body("test prompt"))
        text_prompts = body["text_prompts"]
        negative = [p for p in text_prompts if p["weight"] == -1.0]
        assert len(negative) == 1
        assert "violence" in negative[0]["text"]
        assert "weapons" in negative[0]["text"]

    def test_request_body_includes_positive_prompt(self, scene_illustrator):
        """Request body should include the positive prompt."""
        body = json.loads(scene_illustrator._build_request_body("my scene prompt"))
        text_prompts = body["text_prompts"]
        positive = [p for p in text_prompts if p["weight"] == 1.0]
        assert len(positive) == 1
        assert positive[0]["text"] == "my scene prompt"

    def test_request_body_single_sample(self, scene_illustrator):
        """Request body should request exactly 1 sample."""
        body = json.loads(scene_illustrator._build_request_body("prompt"))
        assert body["samples"] == 1


class TestGetGenreStyle:
    """Tests for genre style lookup."""

    def test_fantasy_kingdom_style(self, scene_illustrator):
        """Fantasy Kingdom should have watercolor/magical style."""
        from models import Genre

        style = scene_illustrator._get_genre_style(Genre.fantasy_kingdom)
        assert "watercolor" in style
        assert "magical" in style

    def test_outer_space_style(self, scene_illustrator):
        """Outer Space should have cosmic/futuristic style."""
        from models import Genre

        style = scene_illustrator._get_genre_style(Genre.outer_space)
        assert "cosmic" in style
        assert "futuristic" in style

    def test_underwater_world_style(self, scene_illustrator):
        """Underwater World should have ocean/coral reef style."""
        from models import Genre

        style = scene_illustrator._get_genre_style(Genre.underwater_world)
        assert "ocean" in style
        assert "coral reef" in style

    def test_jungle_safari_style(self, scene_illustrator):
        """Jungle Safari should have tropical/lush style."""
        from models import Genre

        style = scene_illustrator._get_genre_style(Genre.jungle_safari)
        assert "tropical" in style
        assert "lush greens" in style

    def test_unknown_genre_defaults_to_fantasy(self, scene_illustrator):
        """Unknown genre value should default to fantasy kingdom style."""
        style = scene_illustrator._get_genre_style("nonexistent_genre")
        fantasy_style = scene_illustrator.GENRE_STYLES["fantasy_kingdom"]
        assert style == fantasy_style


class TestSafetyNegativePrompt:
    """Tests for safety negative prompt content."""

    def test_blocks_violence(self, scene_illustrator):
        assert "violence" in scene_illustrator.SAFETY_NEGATIVE_PROMPT

    def test_blocks_weapons(self, scene_illustrator):
        assert "weapons" in scene_illustrator.SAFETY_NEGATIVE_PROMPT

    def test_blocks_blood(self, scene_illustrator):
        assert "blood" in scene_illustrator.SAFETY_NEGATIVE_PROMPT

    def test_blocks_gore(self, scene_illustrator):
        assert "gore" in scene_illustrator.SAFETY_NEGATIVE_PROMPT

    def test_blocks_horror(self, scene_illustrator):
        assert "horror" in scene_illustrator.SAFETY_NEGATIVE_PROMPT

    def test_blocks_death(self, scene_illustrator):
        assert "death" in scene_illustrator.SAFETY_NEGATIVE_PROMPT

    def test_blocks_adult_content(self, scene_illustrator):
        assert "adult content" in scene_illustrator.SAFETY_NEGATIVE_PROMPT

    def test_blocks_frightening(self, scene_illustrator):
        assert "frightening" in scene_illustrator.SAFETY_NEGATIVE_PROMPT

    def test_blocks_scary(self, scene_illustrator):
        assert "scary" in scene_illustrator.SAFETY_NEGATIVE_PROMPT

    def test_blocks_nudity(self, scene_illustrator):
        assert "nudity" in scene_illustrator.SAFETY_NEGATIVE_PROMPT

    def test_blocks_drugs(self, scene_illustrator):
        assert "drugs" in scene_illustrator.SAFETY_NEGATIVE_PROMPT

    def test_blocks_alcohol(self, scene_illustrator):
        assert "alcohol" in scene_illustrator.SAFETY_NEGATIVE_PROMPT


class TestInvokeBedrock:
    """Tests for Bedrock invocation."""

    @pytest.mark.asyncio
    async def test_invoke_success(self, scene_illustrator, mock_bedrock_client):
        """Should return image bytes on successful generation."""
        test_image = b"SCENE_PNG_DATA"
        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response(test_image)

        result = await scene_illustrator._invoke_bedrock("test prompt")

        assert result == test_image
        mock_bedrock_client.invoke_model.assert_called_once()

    @pytest.mark.asyncio
    async def test_invoke_raises_on_client_error(self, scene_illustrator, mock_bedrock_client):
        """Should raise SceneIllustrationError on boto3 ClientError."""
        from scene_illustrator import SceneIllustrationError

        error_response = {"Error": {"Code": "500", "Message": "Internal Error"}}
        mock_bedrock_client.invoke_model.side_effect = ClientError(error_response, "InvokeModel")

        with pytest.raises(SceneIllustrationError):
            await scene_illustrator._invoke_bedrock("prompt")

    @pytest.mark.asyncio
    async def test_invoke_raises_on_content_filtered(self, scene_illustrator, mock_bedrock_client):
        """Should raise SceneIllustrationError when content is filtered."""
        from scene_illustrator import SceneIllustrationError

        mock_bedrock_client.invoke_model.return_value = _make_filtered_response()

        with pytest.raises(SceneIllustrationError):
            await scene_illustrator._invoke_bedrock("prompt")

    @pytest.mark.asyncio
    async def test_invoke_raises_on_empty_artifacts(self, scene_illustrator, mock_bedrock_client):
        """Should raise SceneIllustrationError when no artifacts returned."""
        from scene_illustrator import SceneIllustrationError

        response_body = {"result": "success", "artifacts": []}
        mock_body = MagicMock()
        mock_body.read.return_value = json.dumps(response_body).encode()
        mock_bedrock_client.invoke_model.return_value = {"body": mock_body}

        with pytest.raises(SceneIllustrationError):
            await scene_illustrator._invoke_bedrock("prompt")


class TestGenerateSingleScene:
    """Tests for single scene generation with retry logic."""

    @pytest.mark.asyncio
    async def test_success_on_first_attempt(self, scene_illustrator, mock_bedrock_client, mock_storage):
        """Should generate and upload a scene image on first attempt."""
        from models import Genre

        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response(b"img")

        result = await scene_illustrator._generate_single_scene(
            scene={"scene_number": 1, "narrative": "The bunny walked into the forest."},
            character_description="A pink bunny with stars",
            character_type="bunny",
            genre=Genre.fantasy_kingdom,
            session_id="session-123",
        )

        assert result["scene_number"] == 1
        assert result["image_url"] == "https://cdn.example.com/scenes/test.png"
        mock_storage.upload_bytes.assert_called_once()

    @pytest.mark.asyncio
    async def test_retries_on_failure(self, scene_illustrator, mock_bedrock_client, mock_storage):
        """Should retry up to 3 times on failure."""
        from models import Genre
        from scene_illustrator import SceneIllustrationError

        error_response = {"Error": {"Code": "500", "Message": "Error"}}
        # Fail twice, succeed on third
        mock_bedrock_client.invoke_model.side_effect = [
            ClientError(error_response, "InvokeModel"),
            ClientError(error_response, "InvokeModel"),
            _make_bedrock_response(b"img"),
        ]

        result = await scene_illustrator._generate_single_scene(
            scene={"scene_number": 2, "narrative": "A scene."},
            character_description="desc",
            character_type="cat",
            genre=Genre.outer_space,
            session_id="session-1",
        )

        assert result["scene_number"] == 2
        assert result["image_url"] == "https://cdn.example.com/scenes/test.png"
        assert mock_bedrock_client.invoke_model.call_count == 3

    @pytest.mark.asyncio
    async def test_placeholder_on_all_retries_exhausted(self, scene_illustrator, mock_bedrock_client, mock_storage):
        """Should return placeholder URL when all 3 retries are exhausted."""
        from models import Genre
        from scene_illustrator import PLACEHOLDER_IMAGE_URL

        error_response = {"Error": {"Code": "500", "Message": "Error"}}
        mock_bedrock_client.invoke_model.side_effect = ClientError(error_response, "InvokeModel")

        result = await scene_illustrator._generate_single_scene(
            scene={"scene_number": 3, "narrative": "A scene."},
            character_description="desc",
            character_type="cat",
            genre=Genre.fantasy_kingdom,
            session_id="session-1",
        )

        assert result["scene_number"] == 3
        assert result["image_url"] == PLACEHOLDER_IMAGE_URL
        assert mock_bedrock_client.invoke_model.call_count == 3
        mock_storage.upload_bytes.assert_not_called()

    @pytest.mark.asyncio
    async def test_stores_as_png_with_session_id(self, scene_illustrator, mock_bedrock_client, mock_storage):
        """Should upload image as PNG with correct session_id."""
        from models import Genre

        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response(b"img")

        await scene_illustrator._generate_single_scene(
            scene={"scene_number": 1, "narrative": "A scene."},
            character_description="desc",
            character_type="cat",
            genre=Genre.fantasy_kingdom,
            session_id="my-session",
        )

        call_kwargs = mock_storage.upload_bytes.call_args[1]
        assert call_kwargs["content_type"] == "image/png"
        assert call_kwargs["filename"].endswith(".png")
        assert call_kwargs["session_id"] == "my-session"


class TestIllustrateScenes:
    """Tests for the main illustrate_scenes method (batch processing)."""

    @pytest.mark.asyncio
    async def test_returns_8_results_for_8_scenes(self, scene_illustrator, mock_bedrock_client, mock_storage):
        """Should return exactly 8 results for 8 input scenes."""
        from models import Genre

        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response(b"img")

        scenes = _make_scenes(8)
        results = await scene_illustrator.illustrate_scenes(
            scenes=scenes,
            character_description="A cheerful pink bunny",
            character_type="bunny",
            genre=Genre.fantasy_kingdom,
            session_id="session-123",
        )

        assert len(results) == 8

    @pytest.mark.asyncio
    async def test_results_sorted_by_scene_number(self, scene_illustrator, mock_bedrock_client, mock_storage):
        """Results should be sorted by scene_number."""
        from models import Genre

        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response(b"img")

        scenes = _make_scenes(8)
        results = await scene_illustrator.illustrate_scenes(
            scenes=scenes,
            character_description="desc",
            character_type="bunny",
            genre=Genre.fantasy_kingdom,
            session_id="session-1",
        )

        scene_numbers = [r["scene_number"] for r in results]
        assert scene_numbers == [1, 2, 3, 4, 5, 6, 7, 8]

    @pytest.mark.asyncio
    async def test_empty_scenes_returns_empty(self, scene_illustrator):
        """Should return empty list for empty input."""
        from models import Genre

        results = await scene_illustrator.illustrate_scenes(
            scenes=[],
            character_description="desc",
            character_type="bunny",
            genre=Genre.fantasy_kingdom,
            session_id="session-1",
        )

        assert results == []

    @pytest.mark.asyncio
    async def test_partial_failure_uses_placeholders(self, scene_illustrator, mock_bedrock_client, mock_storage):
        """Some scenes can fail (placeholder) while others succeed."""
        from models import Genre
        from scene_illustrator import PLACEHOLDER_IMAGE_URL

        error_response = {"Error": {"Code": "500", "Message": "Error"}}

        # Make scenes 1 and 2 succeed but 3 and 4 fail (all 3 retries)
        call_count = [0]

        def side_effect(*args, **kwargs):
            call_count[0] += 1
            # First 2 calls succeed (scene 1 and 2), rest fail
            if call_count[0] <= 2:
                return _make_bedrock_response(b"img")
            raise ClientError(error_response, "InvokeModel")

        mock_bedrock_client.invoke_model.side_effect = side_effect

        scenes = _make_scenes(4)  # Only first batch
        # Filter to just batch 1 scenes
        results = await scene_illustrator._generate_batch(
            scenes=scenes,
            character_description="desc",
            character_type="bunny",
            genre=Genre.fantasy_kingdom,
            session_id="session-1",
        )

        assert len(results) == 4
        # First 2 should have real URLs
        assert results[0]["image_url"] == "https://cdn.example.com/scenes/test.png"
        assert results[1]["image_url"] == "https://cdn.example.com/scenes/test.png"
        # Last 2 should have placeholders
        assert results[2]["image_url"] == PLACEHOLDER_IMAGE_URL
        assert results[3]["image_url"] == PLACEHOLDER_IMAGE_URL

    @pytest.mark.asyncio
    async def test_batch_processing_splits_correctly(self, scene_illustrator, mock_bedrock_client, mock_storage):
        """Should process scenes 1-4 in batch 1, scenes 5-8 in batch 2."""
        from models import Genre

        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response(b"img")

        scenes = _make_scenes(8)

        # We verify batch processing by checking that all 8 scenes are generated
        results = await scene_illustrator.illustrate_scenes(
            scenes=scenes,
            character_description="desc",
            character_type="bunny",
            genre=Genre.fantasy_kingdom,
            session_id="session-1",
        )

        assert len(results) == 8
        # 8 calls to bedrock (one per scene)
        assert mock_bedrock_client.invoke_model.call_count == 8

    @pytest.mark.asyncio
    async def test_each_result_has_scene_number_and_url(self, scene_illustrator, mock_bedrock_client, mock_storage):
        """Each result should have scene_number and image_url keys."""
        from models import Genre

        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response(b"img")

        scenes = _make_scenes(8)
        results = await scene_illustrator.illustrate_scenes(
            scenes=scenes,
            character_description="desc",
            character_type="bunny",
            genre=Genre.fantasy_kingdom,
            session_id="session-1",
        )

        for result in results:
            assert "scene_number" in result
            assert "image_url" in result
            assert isinstance(result["scene_number"], int)
            assert isinstance(result["image_url"], str)
