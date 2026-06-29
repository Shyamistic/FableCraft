"""
Content Moderator Service.
Validates custom lesson text and user inputs for age-appropriateness.
Routes through LLM Router for Bedrock/OpenRouter fallback support.
"""

import json
import logging
from typing import Optional

from llm_router import LLMRouter, LLMRouterError

logger = logging.getLogger(__name__)

# Length constraints for custom lesson text
MIN_LESSON_LENGTH = 3
MAX_LESSON_LENGTH = 200

# System prompt for content moderation
MODERATION_SYSTEM_PROMPT = (
    "You are a content moderation assistant for a children's educational storytelling app "
    "designed for children ages 4-8. Your job is to determine if a custom lesson topic "
    "is age-appropriate and safe for young children.\n\n"
    "Respond ONLY with valid JSON in this exact format:\n"
    '{"is_appropriate": true/false, "sanitized_lesson": "cleaned text", "rejection_reason": "reason or null"}\n\n'
    "Rules:\n"
    "- Approve topics about positive values, life skills, emotions, social behavior, "
    "nature, animals, creativity, family, friendship, school, and learning.\n"
    "- Reject topics involving violence, weapons, death, drugs, alcohol, sexual content, "
    "hate speech, discrimination, horror, scary themes, politics, religion debates, "
    "or anything inappropriate for children ages 4-8.\n"
    "- The sanitized_lesson should be the cleaned/trimmed version of the input text "
    "(fix minor typos, remove extra whitespace, ensure proper capitalization).\n"
    "- If rejecting, provide a brief reason (this is for internal logging, not shown to children).\n"
    "- If approving, set rejection_reason to null."
)


class ModerationError(Exception):
    """Raised when content moderation fails due to LLM issues."""

    pass


class ContentModerator:
    """Validates content for age-appropriateness (children 4-8)."""

    def __init__(self):
        self.llm_router = LLMRouter()

    async def validate_lesson(
        self, text: str, session_id: str
    ) -> dict:
        """
        Validate a custom lesson topic for age-appropriateness.

        Args:
            text: Custom lesson text (3-200 characters)
            session_id: Current session identifier

        Returns:
            dict with:
                - is_appropriate (bool): Whether the lesson is suitable for children
                - sanitized_lesson (str): Cleaned version of the lesson text
                - rejection_reason (Optional[str]): Reason for rejection, or None if approved

        Raises:
            ModerationError: If validation cannot be completed due to system failures
            ValueError: If text length is outside the 3-200 character range
        """
        # Validate length constraints
        if not self._validate_length(text):
            if len(text) < MIN_LESSON_LENGTH:
                raise ValueError(
                    f"Lesson text must be at least {MIN_LESSON_LENGTH} characters long"
                )
            else:
                raise ValueError(
                    f"Lesson text must be at most {MAX_LESSON_LENGTH} characters long"
                )

        # Build the moderation prompt
        prompt = (
            f"Evaluate the following custom lesson topic for a children's educational "
            f"storytelling app (ages 4-8). Determine if it is age-appropriate.\n\n"
            f'Custom lesson topic: "{text}"\n\n'
            f"Respond with JSON only."
        )

        try:
            # Route through LLM Router for Bedrock/OpenRouter fallback
            response = await self.llm_router.content_moderation(
                prompt=prompt,
                system_prompt=MODERATION_SYSTEM_PROMPT,
            )

            content = response.get("content", "")
            result = self._parse_moderation_response(content, text)

            logger.info(
                f"Content moderation: session={session_id} "
                f"appropriate={result['is_appropriate']} "
                f"provider={response.get('provider', 'unknown')}"
            )

            return result

        except LLMRouterError as e:
            # Both providers failed - err on the side of caution (reject)
            logger.error(
                f"Content moderation LLM failure: session={session_id} error={e}"
            )
            return {
                "is_appropriate": False,
                "sanitized_lesson": text.strip(),
                "rejection_reason": "Unable to verify content safety. Please try again or select a predefined lesson.",
            }

        except Exception as e:
            # Unexpected system failure
            logger.error(
                f"Content moderation system error: session={session_id} error={e}"
            )
            raise ModerationError(
                f"Content moderation system failure: {str(e)}"
            ) from e

    def _validate_length(self, text: str) -> bool:
        """
        Validate that lesson text is between 3 and 200 characters.

        Args:
            text: Custom lesson text to validate

        Returns:
            True if length is valid, False otherwise
        """
        return MIN_LESSON_LENGTH <= len(text) <= MAX_LESSON_LENGTH

    def _parse_moderation_response(self, content: str, original_text: str) -> dict:
        """
        Parse the LLM moderation response into a structured result.

        Args:
            content: Raw LLM response text (expected JSON)
            original_text: Original lesson text for fallback

        Returns:
            dict with is_appropriate, sanitized_lesson, and rejection_reason
        """
        try:
            # Try to extract JSON from the response
            # Handle cases where LLM wraps JSON in markdown code blocks
            cleaned = content.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            data = json.loads(cleaned)

            is_appropriate = bool(data.get("is_appropriate", False))
            sanitized_lesson = str(
                data.get("sanitized_lesson", original_text.strip())
            )
            rejection_reason = data.get("rejection_reason")

            # Ensure sanitized_lesson respects length constraints
            if len(sanitized_lesson) < MIN_LESSON_LENGTH:
                sanitized_lesson = original_text.strip()
            if len(sanitized_lesson) > MAX_LESSON_LENGTH:
                sanitized_lesson = sanitized_lesson[:MAX_LESSON_LENGTH]

            # Normalize rejection_reason
            if rejection_reason is not None:
                rejection_reason = str(rejection_reason)
                if rejection_reason.lower() in ("null", "none", ""):
                    rejection_reason = None

            return {
                "is_appropriate": is_appropriate,
                "sanitized_lesson": sanitized_lesson,
                "rejection_reason": rejection_reason,
            }

        except (json.JSONDecodeError, KeyError, TypeError) as e:
            # If we can't parse the response, err on the side of caution
            logger.warning(
                f"Failed to parse moderation response: {e}. Content: {content[:200]}"
            )
            return {
                "is_appropriate": False,
                "sanitized_lesson": original_text.strip(),
                "rejection_reason": "Unable to verify content safety. Please try again or select a predefined lesson.",
            }
