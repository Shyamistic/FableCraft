"""
Unit tests for CharacterGenerator service.
Tests image generation, retry logic, safety filtering, and S3 storage.
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
def character_generator(mock_settings, mock_bedrock_client):
    """Create a CharacterGenerator instance with mocked dependencies."""
    with patch("character_generator.boto3") as mock_boto3:
        mock_boto3.client.return_value = mock_bedrock_client
        with patch("config.settings", mock_settings):
            from character_generator import CharacterGenerator

            generator = CharacterGenerator()
            generator._bedrock_client = mock_bedrock_client
            generator.settings = mock_settings
            return generator


def _make_bedrock_response(image_data: bytes = b"fake_png_data", finish_reason: str = "SUCCESS"):
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


class TestBuildPrompt:
    """Tests for prompt construction."""

    def test_prompt_includes_character_description(self, character_generator):
        """Prompt should include the character description."""
        prompt = character_generator._build_prompt(
            "A cheerful pink bunny with stars", "bunny", ["pink", "gold"], "whimsical", "happy"
        )
        assert "A cheerful pink bunny with stars" in prompt

    def test_prompt_includes_character_type(self, character_generator):
        """Prompt should include character type."""
        prompt = character_generator._build_prompt(
            "desc", "dragon", ["red"], "bold", "brave"
        )
        assert "dragon" in prompt

    def test_prompt_includes_colors(self, character_generator):
        """Prompt should include the color list."""
        prompt = character_generator._build_prompt(
            "desc", "bunny", ["pink", "gold", "white"], "whimsical", "happy"
        )
        assert "pink" in prompt
        assert "gold" in prompt
        assert "white" in prompt

    def test_prompt_includes_mood(self, character_generator):
        """Prompt should include mood."""
        prompt = character_generator._build_prompt(
            "desc", "cat", ["orange"], "soft", "curious"
        )
        assert "curious" in prompt

    def test_prompt_includes_child_friendly_style(self, character_generator):
        """Prompt should emphasize child-friendly cartoon style."""
        prompt = character_generator._build_prompt(
            "desc", "bear", ["brown"], "warm", "gentle"
        )
        assert "child-friendly" in prompt
        assert "cartoon" in prompt

    def test_prompt_handles_empty_colors(self, character_generator):
        """Prompt should fallback to 'colorful' when no colors provided."""
        prompt = character_generator._build_prompt(
            "desc", "bird", [], "bright", "cheerful"
        )
        assert "colorful" in prompt


class TestBuildRequestBody:
    """Tests for request body construction."""

    def test_request_body_includes_positive_prompt(self, character_generator):
        """Request body should include the positive prompt with weight 1.0."""
        body = json.loads(character_generator._build_request_body("test prompt"))
        text_prompts = body["text_prompts"]
        positive = [p for p in text_prompts if p["weight"] == 1.0]
        assert len(positive) == 1
        assert positive[0]["text"] == "test prompt"

    def test_request_body_includes_negative_prompt(self, character_generator):
        """Request body should include safety negative prompt with weight -1.0."""
        body = json.loads(character_generator._build_request_body("test prompt"))
        text_prompts = body["text_prompts"]
        negative = [p for p in text_prompts if p["weight"] == -1.0]
        assert len(negative) == 1
        assert "violence" in negative[0]["text"]
        assert "weapons" in negative[0]["text"]
        assert "gore" in negative[0]["text"]
        assert "horror" in negative[0]["text"]
        assert "scary monsters" in negative[0]["text"]
        assert "sexually explicit content" in negative[0]["text"]
        assert "drugs" in negative[0]["text"]
        assert "alcohol" in negative[0]["text"]

    def test_request_body_specifies_512x512(self, character_generator):
        """Request body should specify minimum 512x512 resolution."""
        body = json.loads(character_generator._build_request_body("prompt"))
        assert body["width"] >= 512
        assert body["height"] >= 512

    def test_request_body_requests_single_sample(self, character_generator):
        """Request body should request exactly 1 sample."""
        body = json.loads(character_generator._build_request_body("prompt"))
        assert body["samples"] == 1


class TestInvokeBedrock:
    """Tests for Bedrock invocation."""

    @pytest.mark.asyncio
    async def test_invoke_bedrock_success(self, character_generator, mock_bedrock_client):
        """Should return image bytes on successful generation."""
        test_image = b"PNG_IMAGE_DATA_HERE"
        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response(test_image)

        result = await character_generator._invoke_bedrock("test prompt")

        assert result == test_image
        mock_bedrock_client.invoke_model.assert_called_once()

    @pytest.mark.asyncio
    async def test_invoke_bedrock_uses_configured_model(self, character_generator, mock_bedrock_client):
        """Should use the model ID from settings."""
        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response()

        await character_generator._invoke_bedrock("prompt")

        call_kwargs = mock_bedrock_client.invoke_model.call_args[1]
        assert call_kwargs["modelId"] == "stability.stable-diffusion-xl-v1"

    @pytest.mark.asyncio
    async def test_invoke_bedrock_raises_on_client_error(self, character_generator, mock_bedrock_client):
        """Should raise GenerationFailedError on boto3 ClientError."""
        from character_generator import GenerationFailedError

        error_response = {"Error": {"Code": "500", "Message": "Internal Error"}}
        mock_bedrock_client.invoke_model.side_effect = ClientError(error_response, "InvokeModel")

        with pytest.raises(GenerationFailedError):
            await character_generator._invoke_bedrock("prompt")

    @pytest.mark.asyncio
    async def test_invoke_bedrock_raises_on_content_filtered(self, character_generator, mock_bedrock_client):
        """Should raise ContentFilteredError when artifact is content-filtered."""
        from character_generator import ContentFilteredError

        mock_bedrock_client.invoke_model.return_value = _make_filtered_response()

        with pytest.raises(ContentFilteredError):
            await character_generator._invoke_bedrock("prompt")

    @pytest.mark.asyncio
    async def test_invoke_bedrock_raises_on_empty_artifacts(self, character_generator, mock_bedrock_client):
        """Should raise GenerationFailedError when no artifacts returned."""
        from character_generator import GenerationFailedError

        response_body = {"result": "success", "artifacts": []}
        mock_body = MagicMock()
        mock_body.read.return_value = json.dumps(response_body).encode()
        mock_bedrock_client.invoke_model.return_value = {"body": mock_body}

        with pytest.raises(GenerationFailedError):
            await character_generator._invoke_bedrock("prompt")

    @pytest.mark.asyncio
    async def test_invoke_bedrock_raises_on_result_filtered(self, character_generator, mock_bedrock_client):
        """Should raise ContentFilteredError when result field is 'filtered'."""
        from character_generator import ContentFilteredError

        response_body = {"result": "filtered", "artifacts": []}
        mock_body = MagicMock()
        mock_body.read.return_value = json.dumps(response_body).encode()
        mock_bedrock_client.invoke_model.return_value = {"body": mock_body}

        with pytest.raises(ContentFilteredError):
            await character_generator._invoke_bedrock("prompt")


class TestGenerateCharacter:
    """Tests for the main generate_character method."""

    @pytest.mark.asyncio
    async def test_generate_character_success(self, character_generator, mock_bedrock_client):
        """Should generate character and store in S3, returning image_url and image_id."""
        test_image = b"PNG_DATA"
        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response(test_image)

        mock_storage = MagicMock()
        mock_storage.upload_bytes = AsyncMock(return_value="https://cdn.example.com/characters/uuid.png")

        with patch("character_generator.StorageService", return_value=mock_storage):
            result = await character_generator.generate_character(
                character_description="A cheerful pink bunny",
                character_type="bunny",
                colors=["pink", "white"],
                artistic_style="whimsical",
                mood="happy",
                session_id="session-123",
            )

        assert "image_url" in result
        assert "image_id" in result
        assert result["image_url"] == "https://cdn.example.com/characters/uuid.png"
        # Validate image_id is a valid UUID
        uuid.UUID(result["image_id"])

    @pytest.mark.asyncio
    async def test_generate_character_stores_as_png(self, character_generator, mock_bedrock_client):
        """Should store the generated image as PNG format."""
        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response(b"img")

        mock_storage = MagicMock()
        mock_storage.upload_bytes = AsyncMock(return_value="https://url")

        with patch("character_generator.StorageService", return_value=mock_storage):
            await character_generator.generate_character(
                "desc", "cat", ["orange"], "bold", "happy", "session-1"
            )

        call_kwargs = mock_storage.upload_bytes.call_args[1]
        assert call_kwargs["content_type"] == "image/png"
        assert call_kwargs["filename"].endswith(".png")

    @pytest.mark.asyncio
    async def test_generate_character_stores_with_session_id(self, character_generator, mock_bedrock_client):
        """Should pass session_id to storage for S3 path organization."""
        mock_bedrock_client.invoke_model.return_value = _make_bedrock_response(b"img")

        mock_storage = MagicMock()
        mock_storage.upload_bytes = AsyncMock(return_value="https://url")

        with patch("character_generator.StorageService", return_value=mock_storage):
            await character_generator.generate_character(
                "desc", "cat", ["orange"], "bold", "happy", "my-session-id"
            )

        call_kwargs = mock_storage.upload_bytes.call_args[1]
        assert call_kwargs["session_id"] == "my-session-id"

    @pytest.mark.asyncio
    async def test_generate_character_retries_once_on_failure(self, character_generator, mock_bedrock_client):
        """Should retry once if first generation attempt fails."""
        test_image = b"PNG_DATA"
        error_response = {"Error": {"Code": "500", "Message": "Error"}}

        # First call fails, second succeeds
        mock_bedrock_client.invoke_model.side_effect = [
            ClientError(error_response, "InvokeModel"),
            _make_bedrock_response(test_image),
        ]

        mock_storage = MagicMock()
        mock_storage.upload_bytes = AsyncMock(return_value="https://url")

        with patch("character_generator.StorageService", return_value=mock_storage):
            result = await character_generator.generate_character(
                "desc", "bunny", ["pink"], "whimsical", "happy", "session-1"
            )

        assert result["image_url"] == "https://url"
        assert mock_bedrock_client.invoke_model.call_count == 2

    @pytest.mark.asyncio
    async def test_generate_character_fails_after_two_attempts(self, character_generator, mock_bedrock_client):
        """Should raise GenerationFailedError if both attempts fail."""
        from character_generator import GenerationFailedError

        error_response = {"Error": {"Code": "500", "Message": "Error"}}
        mock_bedrock_client.invoke_model.side_effect = ClientError(
            error_response, "InvokeModel"
        )

        with patch("character_generator.StorageService"):
            with pytest.raises(GenerationFailedError) as exc_info:
                await character_generator.generate_character(
                    "desc", "bunny", ["pink"], "whimsical", "happy", "session-1"
                )

        assert "2 attempts" in str(exc_info.value)
        assert mock_bedrock_client.invoke_model.call_count == 2

    @pytest.mark.asyncio
    async def test_generate_character_no_retry_on_content_filtered(self, character_generator, mock_bedrock_client):
        """Should NOT retry when content filter blocks - raise immediately."""
        from character_generator import ContentFilteredError

        mock_bedrock_client.invoke_model.return_value = _make_filtered_response()

        with patch("character_generator.StorageService"):
            with pytest.raises(ContentFilteredError):
                await character_generator.generate_character(
                    "desc", "monster", ["black"], "dark", "angry", "session-1"
                )

        # Should only call once - no retry on content filter
        assert mock_bedrock_client.invoke_model.call_count == 1


class TestSafetyNegativePrompt:
    """Tests verifying the safety negative prompt content."""

    def test_negative_prompt_blocks_violence(self, character_generator):
        """Safety prompt must block violence."""
        assert "violence" in character_generator.SAFETY_NEGATIVE_PROMPT

    def test_negative_prompt_blocks_weapons(self, character_generator):
        """Safety prompt must block weapons."""
        assert "weapons" in character_generator.SAFETY_NEGATIVE_PROMPT

    def test_negative_prompt_blocks_gore(self, character_generator):
        """Safety prompt must block gore."""
        assert "gore" in character_generator.SAFETY_NEGATIVE_PROMPT

    def test_negative_prompt_blocks_horror(self, character_generator):
        """Safety prompt must block horror."""
        assert "horror" in character_generator.SAFETY_NEGATIVE_PROMPT

    def test_negative_prompt_blocks_scary_monsters(self, character_generator):
        """Safety prompt must block scary monsters."""
        assert "scary monsters" in character_generator.SAFETY_NEGATIVE_PROMPT

    def test_negative_prompt_blocks_sexual_content(self, character_generator):
        """Safety prompt must block sexually explicit content."""
        assert "sexually explicit content" in character_generator.SAFETY_NEGATIVE_PROMPT

    def test_negative_prompt_blocks_drugs(self, character_generator):
        """Safety prompt must block drugs."""
        assert "drugs" in character_generator.SAFETY_NEGATIVE_PROMPT

    def test_negative_prompt_blocks_alcohol(self, character_generator):
        """Safety prompt must block alcohol."""
        assert "alcohol" in character_generator.SAFETY_NEGATIVE_PROMPT
