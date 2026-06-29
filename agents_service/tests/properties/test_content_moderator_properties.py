"""
Property-based tests for content_moderator.py - custom lesson length validation.
Tests that validate_lesson enforces the 3-200 character length constraint using Hypothesis.

**Validates: Requirements 4.3**
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from content_moderator import ContentModerator, MIN_LESSON_LENGTH, MAX_LESSON_LENGTH


# --- Strategies ---

# Strategy for strings that are too short (less than 3 characters)
st_too_short = st.text(
    min_size=0,
    max_size=MIN_LESSON_LENGTH - 1,
    alphabet=st.characters(categories=("L", "N", "P", "S", "Z")),
)

# Strategy for strings that are too long (greater than 200 characters)
st_too_long = st.text(
    min_size=MAX_LESSON_LENGTH + 1,
    max_size=MAX_LESSON_LENGTH + 100,
    alphabet=st.characters(categories=("L", "N", "P", "S", "Z")),
)

# Strategy for strings in the valid range (3-200 characters inclusive)
st_valid_length = st.text(
    min_size=MIN_LESSON_LENGTH,
    max_size=MAX_LESSON_LENGTH,
    alphabet=st.characters(categories=("L", "N", "P", "S", "Z")),
)


# --- Property 9: Custom Lesson Length Validation ---


@pytest.mark.property
class TestProperty9CustomLessonLengthValidation:
    """
    Property 9: Custom Lesson Length Validation

    For any custom lesson input string, the system SHALL accept it for LLM
    validation if and only if its character length is between 3 and 200 inclusive.
    - Strings < 3 characters: ValueError with message about minimum
    - Strings > 200 characters: ValueError with message about maximum
    - Strings 3-200 characters: no ValueError for length (passes length validation)

    **Validates: Requirements 4.3**
    """

    @settings(max_examples=50, deadline=None)
    @given(text=st_too_short)
    @pytest.mark.asyncio
    async def test_rejects_strings_below_minimum_length(self, text):
        """
        For any string less than 3 characters, validate_lesson must raise
        ValueError with a message about the minimum length.

        **Validates: Requirements 4.3**
        """
        moderator = ContentModerator()

        with pytest.raises(ValueError) as exc_info:
            await moderator.validate_lesson(text, session_id="test-session")

        error_message = str(exc_info.value).lower()
        assert "at least" in error_message or "minimum" in error_message or str(MIN_LESSON_LENGTH) in str(exc_info.value)

    @settings(max_examples=50, deadline=None)
    @given(text=st_too_long)
    @pytest.mark.asyncio
    async def test_rejects_strings_above_maximum_length(self, text):
        """
        For any string greater than 200 characters, validate_lesson must raise
        ValueError with a message about the maximum length.

        **Validates: Requirements 4.3**
        """
        moderator = ContentModerator()

        with pytest.raises(ValueError) as exc_info:
            await moderator.validate_lesson(text, session_id="test-session")

        error_message = str(exc_info.value).lower()
        assert "at most" in error_message or "maximum" in error_message or str(MAX_LESSON_LENGTH) in str(exc_info.value)

    @settings(max_examples=50, deadline=None)
    @given(text=st_valid_length)
    @pytest.mark.asyncio
    async def test_valid_length_passes_length_validation(self, text):
        """
        For any string between 3-200 characters, length validation passes
        (no ValueError for length). The method may raise other exceptions
        (e.g., ModerationError from LLM calls) but NOT ValueError for length.

        **Validates: Requirements 4.3**
        """
        moderator = ContentModerator()

        try:
            await moderator.validate_lesson(text, session_id="test-session")
        except ValueError as e:
            # If a ValueError is raised, it must NOT be about length constraints
            error_message = str(e).lower()
            assert "at least" not in error_message and str(MIN_LESSON_LENGTH) + " characters" not in error_message
            assert "at most" not in error_message and str(MAX_LESSON_LENGTH) + " characters" not in error_message
        except Exception:
            # Any other exception (ModerationError, LLMRouterError, etc.)
            # is acceptable - we only care that length validation passes
            pass
