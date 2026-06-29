"""
Vision Analyzer Service.
Analyzes drawings via Amazon Bedrock Claude vision through the LLM Router.
Extracts character attributes and performs content safety checks.
Routes through LLM Router for Bedrock/OpenRouter fallback support.
"""

import json
import logging
from typing import Optional

from llm_router import LLMRouter

logger = logging.getLogger(__name__)

# Content moderation blocked categories
BLOCKED_CATEGORIES = [
    "violence",
    "weapons",
    "nudity",
    "sexual content",
    "hate symbols",
    "hate imagery",
    "profanity",
    "gore",
    "horror",
]

# Non-shaming rejection message (does not describe what was detected)
CONTENT_BLOCKED_MESSAGE = (
    "Let's try drawing something different! "
    "Your character needs to be friendly and fun."
)

# System prompt for vision analysis
VISION_SYSTEM_PROMPT = """You are a friendly children's art analyzer for a storytelling app for kids ages 4-8.
Your job is to analyze a child's drawing and extract character attributes.

You MUST respond with valid JSON only. No other text before or after the JSON.

IMPORTANT CONTENT SAFETY RULES:
- If the drawing contains ANY of the following, set "age_appropriate" to false:
  violence, weapons, nudity, sexual content, hate symbols, hate imagery, profanity, gore, horror, scary/threatening imagery
- Do NOT describe what inappropriate content you found.
- If the content is inappropriate, still fill in the other fields with neutral/generic descriptions.

Response format (JSON only):
{
  "character_type": "<what the character is, e.g. bunny, dragon, robot, cat, person>",
  "character_description": "<a cheerful, child-friendly description of the character, max 500 characters>",
  "colors_used": ["<color1>", "<color2>", ...],
  "artistic_style": "<e.g. whimsical, bold, soft, colorful, simple>",
  "mood": "<e.g. happy, curious, brave, shy, excited>",
  "age_appropriate": <true or false>
}

Rules for each field:
- character_type: A single word or short phrase identifying what the character is.
- character_description: A warm, positive description suitable for children. Maximum 500 characters.
- colors_used: An array of color names found in the drawing. Maximum 10 colors.
- artistic_style: One or two words describing the drawing style.
- mood: One word describing the character's apparent mood or feeling.
- age_appropriate: true if the drawing is safe for children ages 4-8, false otherwise."""

# User prompt for vision analysis
VISION_USER_PROMPT = """Please analyze this child's drawing and extract the character attributes.
Remember to respond with valid JSON only, following the exact format specified."""


class ContentBlockedError(Exception):
    """Raised when drawing content is blocked by safety filters."""

    def __init__(self, message: str = CONTENT_BLOCKED_MESSAGE):
        super().__init__(message)
        self.message = message


class VisionAnalysisError(Exception):
    """Raised when vision analysis fails due to LLM issues."""

    pass


class VisionAnalyzer:
    """Analyzes submitted drawings to extract character attributes."""

    def __init__(self, llm_router: Optional[LLMRouter] = None):
        """
        Initialize VisionAnalyzer.

        Args:
            llm_router: Optional LLMRouter instance. If None, creates a new one.
        """
        if llm_router is not None:
            self.llm_router = llm_router
        else:
            self.llm_router = LLMRouter()

    async def analyze_drawing(self, image_data: str, session_id: str) -> dict:
        """
        Analyze a drawing to extract character attributes.

        Sends the drawing to Bedrock Claude vision via LLM Router (with
        OpenRouter fallback). Parses the response into a structured dict
        and performs content moderation.

        Args:
            image_data: Base64-encoded image data (PNG format)
            session_id: Current session identifier

        Returns:
            dict with keys:
                - character_type (str)
                - character_description (str, max 500 chars)
                - colors_used (list of str, max 10)
                - artistic_style (str)
                - mood (str)
                - age_appropriate (bool)

        Raises:
            ContentBlockedError: If drawing contains inappropriate content
            VisionAnalysisError: If analysis fails due to LLM issues
        """
        logger.info(f"Starting vision analysis for session {session_id}")

        # Route through LLM Router for fallback support
        try:
            response = await self.llm_router.vision_analysis(
                prompt=VISION_USER_PROMPT,
                image_data=image_data,
                system_prompt=VISION_SYSTEM_PROMPT,
            )
        except Exception as e:
            logger.error(f"Vision analysis LLM call failed: {e}")
            raise VisionAnalysisError(
                f"Vision analysis failed: {str(e)}"
            ) from e

        # Parse the LLM response content into structured JSON
        content = response.get("content", "")
        provider = response.get("provider", "unknown")
        latency_ms = response.get("latency_ms", 0)

        logger.info(
            f"Vision analysis response received: provider={provider} "
            f"latency_ms={latency_ms}"
        )

        result = self._parse_response(content)

        # Content moderation check
        if not result.get("age_appropriate", True):
            logger.warning(
                f"Content blocked for session {session_id}: "
                f"age_appropriate=false (provider={provider})"
            )
            raise ContentBlockedError(CONTENT_BLOCKED_MESSAGE)

        return result

    def _parse_response(self, content: str) -> dict:
        """
        Parse the LLM response into a structured dict.

        Extracts JSON from the response content, validates required fields,
        and enforces constraints (max 500 chars description, max 10 colors).

        Args:
            content: Raw LLM response text

        Returns:
            Validated dict with all required fields

        Raises:
            VisionAnalysisError: If parsing or validation fails
        """
        # Try to extract JSON from the response
        json_data = self._extract_json(content)

        if json_data is None:
            raise VisionAnalysisError(
                "Failed to parse vision analysis response as JSON"
            )

        # Validate and normalize required fields
        try:
            result = self._validate_and_normalize(json_data)
        except (KeyError, TypeError, ValueError) as e:
            raise VisionAnalysisError(
                f"Invalid vision analysis response structure: {e}"
            ) from e

        return result

    def _extract_json(self, content: str) -> Optional[dict]:
        """
        Extract JSON from LLM response content.

        Handles cases where the JSON might be wrapped in markdown code blocks
        or have extra text around it.

        Args:
            content: Raw response text from LLM

        Returns:
            Parsed dict or None if parsing fails
        """
        # Try direct JSON parsing first
        try:
            return json.loads(content.strip())
        except json.JSONDecodeError:
            pass

        # Try extracting from markdown code block
        if "```json" in content:
            start = content.find("```json") + 7
            end = content.find("```", start)
            if end > start:
                try:
                    return json.loads(content[start:end].strip())
                except json.JSONDecodeError:
                    pass

        # Try extracting from generic code block
        if "```" in content:
            start = content.find("```") + 3
            # Skip language identifier if present on same line
            newline = content.find("\n", start)
            if newline > start:
                start = newline + 1
            end = content.find("```", start)
            if end > start:
                try:
                    return json.loads(content[start:end].strip())
                except json.JSONDecodeError:
                    pass

        # Try finding JSON object boundaries
        first_brace = content.find("{")
        last_brace = content.rfind("}")
        if first_brace != -1 and last_brace > first_brace:
            try:
                return json.loads(content[first_brace : last_brace + 1])
            except json.JSONDecodeError:
                pass

        return None

    def _validate_and_normalize(self, data: dict) -> dict:
        """
        Validate and normalize the parsed response data.

        Ensures all required fields are present and within constraints.

        Args:
            data: Raw parsed JSON data

        Returns:
            Normalized dict with all required fields

        Raises:
            KeyError: If a required field is missing
            ValueError: If a field value is invalid
        """
        # Required fields
        required_fields = [
            "character_type",
            "character_description",
            "colors_used",
            "artistic_style",
            "mood",
            "age_appropriate",
        ]

        for field in required_fields:
            if field not in data:
                raise KeyError(f"Missing required field: {field}")

        # Normalize character_type
        character_type = str(data["character_type"]).strip()
        if not character_type:
            raise ValueError("character_type cannot be empty")

        # Normalize character_description (max 500 chars)
        character_description = str(data["character_description"]).strip()
        if len(character_description) > 500:
            character_description = character_description[:500]

        # Normalize colors_used (max 10 items)
        colors_used = data["colors_used"]
        if not isinstance(colors_used, list):
            colors_used = [str(colors_used)]
        colors_used = [str(c).strip() for c in colors_used if c]
        if len(colors_used) > 10:
            colors_used = colors_used[:10]

        # Normalize artistic_style
        artistic_style = str(data["artistic_style"]).strip()
        if not artistic_style:
            artistic_style = "simple"

        # Normalize mood
        mood = str(data["mood"]).strip()
        if not mood:
            mood = "happy"

        # Normalize age_appropriate
        age_appropriate = data["age_appropriate"]
        if isinstance(age_appropriate, str):
            age_appropriate = age_appropriate.lower() in ("true", "yes", "1")
        else:
            age_appropriate = bool(age_appropriate)

        return {
            "character_type": character_type,
            "character_description": character_description,
            "colors_used": colors_used,
            "artistic_style": artistic_style,
            "mood": mood,
            "age_appropriate": age_appropriate,
        }
