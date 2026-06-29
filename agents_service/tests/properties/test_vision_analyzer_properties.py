"""
Property-based tests for vision_analyzer.py - Vision Analysis response structure
and content moderation rejection.

**Validates: Requirements 2.1, 2.4, 2.5**
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st
from unittest.mock import AsyncMock, patch

from vision_analyzer import (
    VisionAnalyzer,
    ContentBlockedError,
    VisionAnalysisError,
    CONTENT_BLOCKED_MESSAGE,
)


# --- Strategies ---

# Strategy for valid character types (non-empty strings)
st_character_type = st.text(
    alphabet=st.characters(whitelist_categories=("L", "Nd", "Zs")),
    min_size=1,
    max_size=30,
).filter(lambda s: s.strip() != "")

# Strategy for character descriptions (up to 600 chars to test truncation)
st_character_description = st.text(
    alphabet=st.characters(whitelist_categories=("L", "Nd", "Zs", "Po")),
    min_size=0,
    max_size=600,
)

# Strategy for color names
st_color_name = st.text(
    alphabet=st.characters(whitelist_categories=("L",)),
    min_size=1,
    max_size=20,
).filter(lambda s: s.strip() != "")

# Strategy for colors_used lists (0 to 15 items to test truncation)
st_colors_used = st.lists(st_color_name, min_size=0, max_size=15)

# Strategy for artistic style (non-empty strings)
st_artistic_style = st.text(
    alphabet=st.characters(whitelist_categories=("L", "Zs")),
    min_size=1,
    max_size=30,
).filter(lambda s: s.strip() != "")

# Strategy for mood (non-empty strings)
st_mood = st.text(
    alphabet=st.characters(whitelist_categories=("L", "Zs")),
    min_size=1,
    max_size=20,
).filter(lambda s: s.strip() != "")

# Strategy for age_appropriate boolean
st_age_appropriate = st.booleans()


def build_valid_llm_response_json(
    character_type: str,
    character_description: str,
    colors_used: list,
    artistic_style: str,
    mood: str,
    age_appropriate: bool,
) -> str:
    """Build a valid JSON string mimicking an LLM vision analysis response."""
    data = {
        "character_type": character_type,
        "character_description": character_description,
        "colors_used": colors_used,
        "artistic_style": artistic_style,
        "mood": mood,
        "age_appropriate": age_appropriate,
    }
    return json.dumps(data)


# --- Property 2: Vision Analysis Response Structure ---


@pytest.mark.property
class TestProperty2VisionAnalysisResponseStructure:
    """
    Property 2: Vision Analysis Response Structure

    For any valid LLM response JSON, the parsed result must have all required
    fields: character_type (non-empty string), character_description (string max
    500 chars), colors_used (list max 10 items), artistic_style (non-empty string),
    mood (non-empty string), age_appropriate (boolean).

    **Validates: Requirements 2.1, 2.5**
    """

    @settings(max_examples=50, deadline=None)
    @given(
        character_type=st_character_type,
        character_description=st_character_description,
        colors_used=st_colors_used,
        artistic_style=st_artistic_style,
        mood=st_mood,
    )
    def test_parsed_response_has_all_required_fields(
        self,
        character_type,
        character_description,
        colors_used,
        artistic_style,
        mood,
    ):
        """
        For any valid LLM response with age_appropriate=true, the parsed result
        must contain all required fields with correct types and constraints.

        **Validates: Requirements 2.1, 2.5**
        """
        # Build a valid LLM response JSON (age_appropriate=true so no exception)
        llm_content = build_valid_llm_response_json(
            character_type=character_type,
            character_description=character_description,
            colors_used=colors_used,
            artistic_style=artistic_style,
            mood=mood,
            age_appropriate=True,
        )

        analyzer = VisionAnalyzer(llm_router=AsyncMock())
        result = analyzer._parse_response(llm_content)

        # All required fields must be present
        assert "character_type" in result
        assert "character_description" in result
        assert "colors_used" in result
        assert "artistic_style" in result
        assert "mood" in result
        assert "age_appropriate" in result

        # character_type must be a non-empty string
        assert isinstance(result["character_type"], str)
        assert len(result["character_type"]) > 0

        # character_description must be a string with max 500 chars
        assert isinstance(result["character_description"], str)
        assert len(result["character_description"]) <= 500

        # colors_used must be a list with max 10 items
        assert isinstance(result["colors_used"], list)
        assert len(result["colors_used"]) <= 10

        # artistic_style must be a non-empty string
        assert isinstance(result["artistic_style"], str)
        assert len(result["artistic_style"]) > 0

        # mood must be a non-empty string
        assert isinstance(result["mood"], str)
        assert len(result["mood"]) > 0

        # age_appropriate must be a boolean
        assert isinstance(result["age_appropriate"], bool)

    @settings(max_examples=50, deadline=None)
    @given(
        character_type=st_character_type,
        character_description=st.text(
            alphabet=st.characters(whitelist_categories=("L", "Nd", "Zs", "Po")),
            min_size=501,
            max_size=600,
        ),
        colors_used=st_colors_used,
        artistic_style=st_artistic_style,
        mood=st_mood,
    )
    def test_character_description_truncated_to_500_chars(
        self,
        character_type,
        character_description,
        colors_used,
        artistic_style,
        mood,
    ):
        """
        For any LLM response with character_description > 500 chars, the
        parsed result must truncate it to exactly 500 characters.

        **Validates: Requirements 2.5**
        """
        llm_content = build_valid_llm_response_json(
            character_type=character_type,
            character_description=character_description,
            colors_used=colors_used,
            artistic_style=artistic_style,
            mood=mood,
            age_appropriate=True,
        )

        analyzer = VisionAnalyzer(llm_router=AsyncMock())
        result = analyzer._parse_response(llm_content)

        assert len(result["character_description"]) == 500

    @settings(max_examples=50, deadline=None)
    @given(
        character_type=st_character_type,
        character_description=st_character_description,
        colors_used=st.lists(st_color_name, min_size=11, max_size=15),
        artistic_style=st_artistic_style,
        mood=st_mood,
    )
    def test_colors_used_capped_at_10_items(
        self,
        character_type,
        character_description,
        colors_used,
        artistic_style,
        mood,
    ):
        """
        For any LLM response with more than 10 colors, the parsed result
        must cap colors_used at exactly 10 items.

        **Validates: Requirements 2.5**
        """
        llm_content = build_valid_llm_response_json(
            character_type=character_type,
            character_description=character_description,
            colors_used=colors_used,
            artistic_style=artistic_style,
            mood=mood,
            age_appropriate=True,
        )

        analyzer = VisionAnalyzer(llm_router=AsyncMock())
        result = analyzer._parse_response(llm_content)

        assert len(result["colors_used"]) == 10

    @settings(max_examples=30, deadline=None)
    @given(
        character_type=st_character_type,
        character_description=st_character_description,
        colors_used=st_colors_used,
        artistic_style=st_artistic_style,
        mood=st_mood,
        age_appropriate=st_age_appropriate,
    )
    def test_age_appropriate_field_is_always_boolean(
        self,
        character_type,
        character_description,
        colors_used,
        artistic_style,
        mood,
        age_appropriate,
    ):
        """
        For any valid LLM response, the age_appropriate field in parsed result
        must always be a boolean value.

        **Validates: Requirements 2.5**
        """
        llm_content = build_valid_llm_response_json(
            character_type=character_type,
            character_description=character_description,
            colors_used=colors_used,
            artistic_style=artistic_style,
            mood=mood,
            age_appropriate=age_appropriate,
        )

        analyzer = VisionAnalyzer(llm_router=AsyncMock())
        result = analyzer._parse_response(llm_content)

        assert isinstance(result["age_appropriate"], bool)


# --- Property 4: Content Moderation Rejection ---


@pytest.mark.property
class TestProperty4ContentModerationRejection:
    """
    Property 4: Content Moderation Rejection

    For any response where age_appropriate=false, the system must raise
    ContentBlockedError with the standard non-shaming message.

    **Validates: Requirements 2.4, 2.5**
    """

    @settings(max_examples=50, deadline=None)
    @given(
        character_type=st_character_type,
        character_description=st_character_description,
        colors_used=st_colors_used,
        artistic_style=st_artistic_style,
        mood=st_mood,
    )
    @pytest.mark.asyncio
    async def test_age_appropriate_false_raises_content_blocked_error(
        self,
        character_type,
        character_description,
        colors_used,
        artistic_style,
        mood,
    ):
        """
        For any LLM response where age_appropriate=false, the analyze_drawing
        method must raise ContentBlockedError.

        **Validates: Requirements 2.4**
        """
        llm_content = build_valid_llm_response_json(
            character_type=character_type,
            character_description=character_description,
            colors_used=colors_used,
            artistic_style=artistic_style,
            mood=mood,
            age_appropriate=False,
        )

        # Mock the LLM router to return our controlled response
        mock_router = AsyncMock()
        mock_router.vision_analysis.return_value = {
            "content": llm_content,
            "provider": "bedrock",
            "latency_ms": 100,
        }

        analyzer = VisionAnalyzer(llm_router=mock_router)

        with pytest.raises(ContentBlockedError):
            await analyzer.analyze_drawing(
                image_data="dGVzdA==",  # base64 "test"
                session_id="test-session-123",
            )

    @settings(max_examples=50, deadline=None)
    @given(
        character_type=st_character_type,
        character_description=st_character_description,
        colors_used=st_colors_used,
        artistic_style=st_artistic_style,
        mood=st_mood,
    )
    @pytest.mark.asyncio
    async def test_content_blocked_error_uses_non_shaming_message(
        self,
        character_type,
        character_description,
        colors_used,
        artistic_style,
        mood,
    ):
        """
        For any rejected content, the ContentBlockedError message must be the
        standard non-shaming message that does not describe what was detected.

        **Validates: Requirements 2.4**
        """
        llm_content = build_valid_llm_response_json(
            character_type=character_type,
            character_description=character_description,
            colors_used=colors_used,
            artistic_style=artistic_style,
            mood=mood,
            age_appropriate=False,
        )

        mock_router = AsyncMock()
        mock_router.vision_analysis.return_value = {
            "content": llm_content,
            "provider": "bedrock",
            "latency_ms": 100,
        }

        analyzer = VisionAnalyzer(llm_router=mock_router)

        with pytest.raises(ContentBlockedError) as exc_info:
            await analyzer.analyze_drawing(
                image_data="dGVzdA==",
                session_id="test-session-123",
            )

        # The message must be the standard non-shaming message
        assert str(exc_info.value) == CONTENT_BLOCKED_MESSAGE
        assert exc_info.value.message == CONTENT_BLOCKED_MESSAGE

        # The message must NOT describe what was detected (no blocked category names)
        blocked_terms = [
            "violence", "weapons", "nudity", "sexual",
            "hate", "profanity", "gore", "horror",
        ]
        message_lower = exc_info.value.message.lower()
        for term in blocked_terms:
            assert term not in message_lower

    @settings(max_examples=50, deadline=None)
    @given(
        character_type=st_character_type,
        character_description=st_character_description,
        colors_used=st_colors_used,
        artistic_style=st_artistic_style,
        mood=st_mood,
    )
    @pytest.mark.asyncio
    async def test_age_appropriate_true_does_not_raise(
        self,
        character_type,
        character_description,
        colors_used,
        artistic_style,
        mood,
    ):
        """
        For any LLM response where age_appropriate=true, the analyze_drawing
        method must NOT raise ContentBlockedError and must return a valid result.

        **Validates: Requirements 2.4**
        """
        llm_content = build_valid_llm_response_json(
            character_type=character_type,
            character_description=character_description,
            colors_used=colors_used,
            artistic_style=artistic_style,
            mood=mood,
            age_appropriate=True,
        )

        mock_router = AsyncMock()
        mock_router.vision_analysis.return_value = {
            "content": llm_content,
            "provider": "bedrock",
            "latency_ms": 100,
        }

        analyzer = VisionAnalyzer(llm_router=mock_router)

        # Should NOT raise - returns a result dict
        result = await analyzer.analyze_drawing(
            image_data="dGVzdA==",
            session_id="test-session-123",
        )

        assert isinstance(result, dict)
        assert result["age_appropriate"] is True
