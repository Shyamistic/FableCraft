"""
Property-based tests for character_generator.py - AI image generation safety
and output constraints.

Tests that safety filters are always present in generation requests and that
character image outputs meet format, resolution, and storage requirements.

**Validates: Requirements 3.1, 3.3, 3.7**
"""

import asyncio
import base64
import json
import os
import sys
import uuid
from unittest.mock import MagicMock, patch, AsyncMock

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


# --- Strategies ---

# Strategy for character descriptions (non-empty strings)
st_character_description = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=5,
    max_size=200,
).filter(lambda s: s.strip())

# Strategy for character types
st_character_type = st.sampled_from([
    "bunny", "dragon", "robot", "unicorn", "cat", "dog", "bear", "bird",
    "fish", "alien", "fairy", "monster"
])

# Strategy for color lists (1-10 colors)
st_colors = st.lists(
    st.sampled_from([
        "red", "blue", "green", "yellow", "pink", "purple",
        "orange", "white", "black", "gold", "silver", "teal"
    ]),
    min_size=1,
    max_size=10,
)

# Strategy for artistic styles
st_artistic_style = st.sampled_from([
    "whimsical", "bold", "soft", "cartoon", "watercolor", "pastel"
])

# Strategy for moods
st_mood = st.sampled_from([
    "happy", "curious", "brave", "shy", "excited", "calm", "playful"
])

# Strategy for session IDs (UUID format)
st_session_id = st.from_regex(
    r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
    fullmatch=True,
)


# --- Required safety terms that MUST be in every negative prompt ---

REQUIRED_SAFETY_TERMS = [
    "violence",
    "weapons",
    "gore",
    "horror",
    "scary monsters",
    "sexual",  # covers "sexually explicit content"
    "drugs",
    "alcohol",
]


# --- Helpers ---


def make_character_generator():
    """Create a CharacterGenerator with mocked AWS dependencies."""
    mock_settings = MagicMock()
    mock_settings.aws_region = "us-east-1"
    mock_settings.bedrock_image_model = "stability.stable-diffusion-xl-v1"

    mock_bedrock_client = MagicMock()

    with patch("character_generator.boto3") as mock_boto3:
        mock_boto3.client.return_value = mock_bedrock_client
        with patch("config.settings", mock_settings):
            from character_generator import CharacterGenerator

            generator = CharacterGenerator()
            generator._bedrock_client = mock_bedrock_client
            generator.settings = mock_settings
            return generator, mock_bedrock_client


def create_fake_image_response(width=512, height=512):
    """Create a fake Bedrock response with a base64-encoded image."""
    # Create a minimal PNG-like byte sequence (just for testing, not a real PNG)
    # In reality Bedrock returns base64 of the generated image
    fake_image_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 1000
    fake_b64 = base64.b64encode(fake_image_bytes).decode("utf-8")

    response_body = {
        "result": "success",
        "artifacts": [
            {
                "base64": fake_b64,
                "finishReason": "SUCCESS",
            }
        ],
    }
    return response_body, fake_image_bytes


# --- Property 6: AI Image Generation Safety Filters ---


@pytest.mark.property
class TestProperty6AIImageGenerationSafetyFilters:
    """
    Property 6: AI Image Generation Safety Filters

    For any character generation request, the negative prompt must ALWAYS include:
    violence, weapons, gore, horror, scary monsters, sexual content, drugs, alcohol.
    The negative prompt must be present in every request body sent to Bedrock.

    **Validates: Requirements 3.3, 3.7**
    """

    @settings(max_examples=50, deadline=None)
    @given(
        character_description=st_character_description,
        character_type=st_character_type,
        colors=st_colors,
        artistic_style=st_artistic_style,
        mood=st_mood,
    )
    def test_negative_prompt_always_contains_required_safety_terms(
        self, character_description, character_type, colors, artistic_style, mood
    ):
        """
        For any combination of character attributes, the request body built by
        _build_request_body must contain a negative prompt (weight -1.0) that
        includes all required safety terms.

        **Validates: Requirements 3.3**
        """
        generator, _ = make_character_generator()

        prompt = generator._build_prompt(
            character_description, character_type, colors, artistic_style, mood
        )
        request_body_json = generator._build_request_body(prompt)
        request_body = json.loads(request_body_json)

        # Find the negative prompt (weight -1.0)
        text_prompts = request_body.get("text_prompts", [])
        negative_prompts = [
            p for p in text_prompts if p.get("weight", 0) < 0
        ]

        # There must be at least one negative prompt
        assert len(negative_prompts) > 0, (
            "Request body must contain at least one negative prompt (weight < 0)"
        )

        # Combine all negative prompt text
        negative_text = " ".join(p["text"] for p in negative_prompts).lower()

        # Every required safety term must be present
        for term in REQUIRED_SAFETY_TERMS:
            assert term in negative_text, (
                f"Required safety term '{term}' not found in negative prompt: "
                f"{negative_text}"
            )

    @settings(max_examples=50, deadline=None)
    @given(
        character_description=st_character_description,
        character_type=st_character_type,
        colors=st_colors,
        artistic_style=st_artistic_style,
        mood=st_mood,
    )
    def test_negative_prompt_weight_is_negative(
        self, character_description, character_type, colors, artistic_style, mood
    ):
        """
        For any request, the safety negative prompt must have a negative weight
        to ensure it acts as a filter, not an enhancement.

        **Validates: Requirements 3.3**
        """
        generator, _ = make_character_generator()

        prompt = generator._build_prompt(
            character_description, character_type, colors, artistic_style, mood
        )
        request_body_json = generator._build_request_body(prompt)
        request_body = json.loads(request_body_json)

        text_prompts = request_body.get("text_prompts", [])

        # Find prompt containing safety terms
        safety_prompts = [
            p for p in text_prompts
            if "violence" in p.get("text", "").lower()
        ]

        assert len(safety_prompts) > 0, (
            "No safety prompt found containing 'violence'"
        )

        for safety_prompt in safety_prompts:
            assert safety_prompt["weight"] < 0, (
                f"Safety negative prompt must have negative weight, "
                f"got {safety_prompt['weight']}"
            )

    @settings(max_examples=50, deadline=None)
    @given(
        character_description=st_character_description,
        character_type=st_character_type,
        colors=st_colors,
        artistic_style=st_artistic_style,
        mood=st_mood,
        session_id=st_session_id,
    )
    def test_bedrock_invoke_always_includes_safety_filter_in_body(
        self, character_description, character_type, colors, artistic_style,
        mood, session_id
    ):
        """
        For any full generate_character call, the body sent to Bedrock's
        invoke_model must contain the safety negative prompt.

        **Validates: Requirements 3.3, 3.7**
        """
        generator, mock_bedrock_client = make_character_generator()

        # Mock Bedrock response
        response_body, fake_image_bytes = create_fake_image_response()
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_body).encode()
        mock_bedrock_client.invoke_model.return_value = {"body": mock_response}

        # Mock StorageService
        with patch("character_generator.StorageService") as mock_storage_cls:
            mock_storage = MagicMock()
            mock_storage.upload_bytes = AsyncMock(
                return_value="https://cdn.example.com/characters/test.png"
            )
            mock_storage_cls.return_value = mock_storage

            result = asyncio.run(
                generator.generate_character(
                    character_description, character_type, colors,
                    artistic_style, mood, session_id
                )
            )

        # Verify invoke_model was called
        assert mock_bedrock_client.invoke_model.called

        # Extract the body sent to Bedrock
        call_kwargs = mock_bedrock_client.invoke_model.call_args[1]
        body_json = call_kwargs["body"]
        body = json.loads(body_json)

        # Verify negative prompt is present
        text_prompts = body.get("text_prompts", [])
        negative_prompts = [p for p in text_prompts if p.get("weight", 0) < 0]

        assert len(negative_prompts) > 0, (
            "Bedrock request body must contain negative safety prompt"
        )

        negative_text = " ".join(p["text"] for p in negative_prompts).lower()
        for term in REQUIRED_SAFETY_TERMS:
            assert term in negative_text, (
                f"Safety term '{term}' missing from Bedrock request negative prompt"
            )

    @settings(max_examples=30, deadline=None)
    @given(
        character_description=st_character_description,
        character_type=st_character_type,
        colors=st_colors,
        artistic_style=st_artistic_style,
        mood=st_mood,
    )
    def test_positive_prompt_does_not_contain_safety_terms_as_positive(
        self, character_description, character_type, colors, artistic_style, mood
    ):
        """
        For any request, violence/weapons/gore terms must NOT appear in
        positive prompts (weight > 0) — they should only be in the negative.

        **Validates: Requirements 3.3**
        """
        generator, _ = make_character_generator()

        prompt = generator._build_prompt(
            character_description, character_type, colors, artistic_style, mood
        )
        request_body_json = generator._build_request_body(prompt)
        request_body = json.loads(request_body_json)

        text_prompts = request_body.get("text_prompts", [])
        positive_prompts = [
            p for p in text_prompts if p.get("weight", 0) > 0
        ]

        positive_text = " ".join(p["text"] for p in positive_prompts).lower()

        # Core dangerous terms should not be in positive prompts
        dangerous_terms = ["violence", "weapons", "gore", "horror", "drugs"]
        for term in dangerous_terms:
            assert term not in positive_text, (
                f"Dangerous term '{term}' found in positive prompt: {positive_text}"
            )


# --- Property 7: Character Image Output Constraints ---


@pytest.mark.property
class TestProperty7CharacterImageOutputConstraints:
    """
    Property 7: Character Image Output Constraints

    For any successfully generated character image, the output must be:
    PNG format stored in S3, with a UUID identifier, linked to the session_id,
    and minimum 512×512 pixels specified in the request.

    **Validates: Requirements 3.1, 3.7**
    """

    @settings(max_examples=50, deadline=None)
    @given(
        character_description=st_character_description,
        character_type=st_character_type,
        colors=st_colors,
        artistic_style=st_artistic_style,
        mood=st_mood,
    )
    def test_request_specifies_minimum_512x512_resolution(
        self, character_description, character_type, colors, artistic_style, mood
    ):
        """
        For any character generation request, the request body must specify
        at least 512×512 pixels for the output resolution.

        **Validates: Requirements 3.1**
        """
        generator, _ = make_character_generator()

        prompt = generator._build_prompt(
            character_description, character_type, colors, artistic_style, mood
        )
        request_body_json = generator._build_request_body(prompt)
        request_body = json.loads(request_body_json)

        width = request_body.get("width", 0)
        height = request_body.get("height", 0)

        assert width >= 512, (
            f"Request width must be >= 512, got {width}"
        )
        assert height >= 512, (
            f"Request height must be >= 512, got {height}"
        )

    @settings(max_examples=50, deadline=None)
    @given(
        character_description=st_character_description,
        character_type=st_character_type,
        colors=st_colors,
        artistic_style=st_artistic_style,
        mood=st_mood,
        session_id=st_session_id,
    )
    def test_generated_image_stored_as_png_with_uuid_filename(
        self, character_description, character_type, colors, artistic_style,
        mood, session_id
    ):
        """
        For any successful generation, the image must be stored in S3 with
        content_type="image/png" and a UUID-based filename ending in .png.

        **Validates: Requirements 3.1, 3.7**
        """
        generator, mock_bedrock_client = make_character_generator()

        # Mock Bedrock response
        response_body, fake_image_bytes = create_fake_image_response()
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_body).encode()
        mock_bedrock_client.invoke_model.return_value = {"body": mock_response}

        # Mock StorageService
        with patch("character_generator.StorageService") as mock_storage_cls:
            mock_storage = MagicMock()
            mock_storage.upload_bytes = AsyncMock(
                return_value="https://cdn.example.com/characters/test.png"
            )
            mock_storage_cls.return_value = mock_storage

            result = asyncio.run(
                generator.generate_character(
                    character_description, character_type, colors,
                    artistic_style, mood, session_id
                )
            )

        # Verify upload_bytes was called with correct parameters
        mock_storage.upload_bytes.assert_called_once()
        call_kwargs = mock_storage.upload_bytes.call_args[1]

        # Content type must be PNG
        assert call_kwargs["content_type"] == "image/png", (
            f"Content type must be 'image/png', got '{call_kwargs['content_type']}'"
        )

        # Filename must be UUID.png format
        filename = call_kwargs["filename"]
        assert filename.endswith(".png"), (
            f"Filename must end with '.png', got '{filename}'"
        )

        # Extract UUID part (filename minus .png)
        uuid_part = filename[:-4]
        try:
            uuid.UUID(uuid_part)
        except ValueError:
            pytest.fail(
                f"Filename must contain a valid UUID, got '{uuid_part}'"
            )

    @settings(max_examples=50, deadline=None)
    @given(
        character_description=st_character_description,
        character_type=st_character_type,
        colors=st_colors,
        artistic_style=st_artistic_style,
        mood=st_mood,
        session_id=st_session_id,
    )
    def test_generated_image_linked_to_session_id(
        self, character_description, character_type, colors, artistic_style,
        mood, session_id
    ):
        """
        For any successful generation, the stored image must be linked to
        the provided session_id.

        **Validates: Requirements 3.7**
        """
        generator, mock_bedrock_client = make_character_generator()

        # Mock Bedrock response
        response_body, fake_image_bytes = create_fake_image_response()
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_body).encode()
        mock_bedrock_client.invoke_model.return_value = {"body": mock_response}

        # Mock StorageService
        with patch("character_generator.StorageService") as mock_storage_cls:
            mock_storage = MagicMock()
            mock_storage.upload_bytes = AsyncMock(
                return_value="https://cdn.example.com/characters/test.png"
            )
            mock_storage_cls.return_value = mock_storage

            result = asyncio.run(
                generator.generate_character(
                    character_description, character_type, colors,
                    artistic_style, mood, session_id
                )
            )

        # Verify session_id was passed to storage
        call_kwargs = mock_storage.upload_bytes.call_args[1]
        assert call_kwargs["session_id"] == session_id, (
            f"Storage session_id must match input session_id '{session_id}', "
            f"got '{call_kwargs['session_id']}'"
        )

    @settings(max_examples=50, deadline=None)
    @given(
        character_description=st_character_description,
        character_type=st_character_type,
        colors=st_colors,
        artistic_style=st_artistic_style,
        mood=st_mood,
        session_id=st_session_id,
    )
    def test_result_contains_uuid_image_id(
        self, character_description, character_type, colors, artistic_style,
        mood, session_id
    ):
        """
        For any successful generation, the result must contain an 'image_id'
        that is a valid UUID.

        **Validates: Requirements 3.7**
        """
        generator, mock_bedrock_client = make_character_generator()

        # Mock Bedrock response
        response_body, fake_image_bytes = create_fake_image_response()
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_body).encode()
        mock_bedrock_client.invoke_model.return_value = {"body": mock_response}

        # Mock StorageService
        with patch("character_generator.StorageService") as mock_storage_cls:
            mock_storage = MagicMock()
            mock_storage.upload_bytes = AsyncMock(
                return_value="https://cdn.example.com/characters/test.png"
            )
            mock_storage_cls.return_value = mock_storage

            result = asyncio.run(
                generator.generate_character(
                    character_description, character_type, colors,
                    artistic_style, mood, session_id
                )
            )

        # Result must have image_id
        assert "image_id" in result, "Result must contain 'image_id'"

        # image_id must be a valid UUID
        try:
            uuid.UUID(result["image_id"])
        except ValueError:
            pytest.fail(
                f"image_id must be a valid UUID, got '{result['image_id']}'"
            )

    @settings(max_examples=50, deadline=None)
    @given(
        character_description=st_character_description,
        character_type=st_character_type,
        colors=st_colors,
        artistic_style=st_artistic_style,
        mood=st_mood,
        session_id=st_session_id,
    )
    def test_result_contains_image_url(
        self, character_description, character_type, colors, artistic_style,
        mood, session_id
    ):
        """
        For any successful generation, the result must contain an 'image_url'
        that is a non-empty string (the S3/CDN URL).

        **Validates: Requirements 3.1, 3.7**
        """
        generator, mock_bedrock_client = make_character_generator()

        # Mock Bedrock response
        response_body, fake_image_bytes = create_fake_image_response()
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_body).encode()
        mock_bedrock_client.invoke_model.return_value = {"body": mock_response}

        expected_url = f"https://cdn.example.com/characters/{session_id}/img.png"

        # Mock StorageService
        with patch("character_generator.StorageService") as mock_storage_cls:
            mock_storage = MagicMock()
            mock_storage.upload_bytes = AsyncMock(return_value=expected_url)
            mock_storage_cls.return_value = mock_storage

            result = asyncio.run(
                generator.generate_character(
                    character_description, character_type, colors,
                    artistic_style, mood, session_id
                )
            )

        # Result must have image_url
        assert "image_url" in result, "Result must contain 'image_url'"
        assert isinstance(result["image_url"], str), "image_url must be a string"
        assert len(result["image_url"]) > 0, "image_url must not be empty"
        assert result["image_url"] == expected_url, (
            f"image_url must match storage URL, expected '{expected_url}', "
            f"got '{result['image_url']}'"
        )
