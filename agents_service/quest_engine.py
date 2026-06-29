"""
Quest Engine Service.
Generates 8-scene interactive quests via Amazon Bedrock Claude.
Enforces content safety for children ages 4-8.
"""

import json
import logging
import uuid
from typing import List

from models import Genre, Option, Scene

logger = logging.getLogger(__name__)

# Genre-specific settings for quest generation
GENRE_SETTINGS = {
    Genre.fantasy_kingdom: {
        "setting": "a magical kingdom with castles, enchanted forests, and friendly dragons",
        "vocabulary": "kingdom, castle, knight, princess, wizard, enchanted, magical, quest, treasure, dragon",
        "characters": "friendly fairies, helpful wizards, kind dragons, brave knights, gentle unicorns",
    },
    Genre.outer_space: {
        "setting": "outer space with planets, stars, rocket ships, and space stations",
        "vocabulary": "planet, star, rocket, astronaut, galaxy, orbit, spaceship, alien, comet, moon",
        "characters": "friendly aliens, helpful robots, kind astronauts, gentle space creatures, curious starfish",
    },
    Genre.underwater_world: {
        "setting": "an underwater world with coral reefs, sunken ships, and colorful sea creatures",
        "vocabulary": "ocean, coral, reef, submarine, treasure, pearl, wave, bubble, shell, tide",
        "characters": "friendly dolphins, helpful octopuses, kind sea turtles, gentle whales, curious seahorses",
    },
    Genre.jungle_safari: {
        "setting": "a lush jungle with tall trees, winding rivers, and hidden clearings",
        "vocabulary": "jungle, river, vine, tree, trail, waterfall, canopy, camp, bridge, cave",
        "characters": "friendly monkeys, helpful elephants, kind parrots, gentle giraffes, curious butterflies",
    },
}

# Content safety rules for quest generation
CONTENT_SAFETY_RULES = """CONTENT SAFETY RULES (MANDATORY - NEVER VIOLATE):
- NO violence, fighting, hitting, kicking, or physical harm of any kind
- NO weapons (swords, guns, knives, bows, or any weapon-like objects)
- NO death, dying, killing, or characters being seriously hurt
- NO dangerous situations (falling from heights, drowning, fire, getting lost in scary places)
- NO scary content (monsters, ghosts, darkness, nightmares, loud scary sounds)
- NO bullying descriptions that are graphic or distressing
- NO adult themes (romance, complex social issues beyond a 4-8 year old's understanding)
- Mild sadness is ONLY allowed when immediately followed by a kind/helpful resolution
- All scenarios must be safe, warm, and appropriate for children ages 4-8"""


def _build_system_prompt(
    character_name: str,
    character_description: str,
    lesson: str,
    genre: Genre,
) -> str:
    """Build the system prompt for quest generation."""
    genre_config = GENRE_SETTINGS.get(genre, GENRE_SETTINGS[Genre.fantasy_kingdom])

    return f"""You are a children's story writer creating interactive quests for children ages 4-8.
You must generate an 8-scene interactive quest that teaches the life lesson: "{lesson}".

CHARACTER DETAILS:
- Name: {character_name}
- Description: {character_description}
- You MUST mention "{character_name}" by name in EVERY scene narrative.
- You MUST reference at least one visual trait from the character description in EVERY scene narrative.

GENRE SETTING:
- Setting: {genre_config["setting"]}
- Use vocabulary like: {genre_config["vocabulary"]}
- Include supporting characters such as: {genre_config["characters"]}

STORY STRUCTURE:
- Scenes 1-2: INTRODUCTION - Introduce the character in the genre setting, establish the situation
- Scenes 3-6: RISING ACTION - Present increasingly complex scenarios related to the lesson
- Scenes 7-8: RESOLUTION - Character demonstrates mastery of the lesson, story concludes positively

SCENE FORMAT REQUIREMENTS (STRICT WORD LIMITS):
- narrative: 1-2 sentences describing the scenario (MAXIMUM 40 words)
- question: A question about what the character should do (MAXIMUM 15 words)
- Each scene must have EXACTLY 2 options (option_a and option_b)
- option text: What the character could do (MAXIMUM 20 words each)
- feedback: Response to the child's choice (MAXIMUM 25 words each)

OPTION RULES:
- The CORRECT option (is_correct: true) must depict PROSOCIAL behavior: sharing, helping, including, comforting, being kind, cooperating, being patient, listening
- The INCORRECT option (is_correct: false) must depict ANTISOCIAL behavior: refusing, excluding, ignoring, mocking, being selfish, being impatient, being unkind
- Options must be clearly distinguishable for a child aged 4-8 without adult help
- Randomize which option (a or b) is correct across scenes - do NOT always make option_a correct

{CONTENT_SAFETY_RULES}

OUTPUT FORMAT:
You MUST respond with ONLY valid JSON in exactly this format (no markdown, no explanation):
{{
  "scenes": [
    {{
      "scene_number": 1,
      "narrative": "...",
      "question": "...",
      "option_a": {{
        "text": "...",
        "is_correct": true,
        "feedback": "..."
      }},
      "option_b": {{
        "text": "...",
        "is_correct": false,
        "feedback": "..."
      }}
    }}
  ]
}}

Generate EXACTLY 8 scenes. Each scene must have exactly one correct and one incorrect option."""


def _build_user_prompt(
    character_name: str,
    character_description: str,
    lesson: str,
    genre: Genre,
) -> str:
    """Build the user prompt for quest generation."""
    return (
        f"Generate an 8-scene interactive quest for {character_name} "
        f"({character_description}) about the lesson \"{lesson}\" "
        f"set in the {genre.value.replace('_', ' ')} genre. "
        f"Remember: mention {character_name} by name and a visual trait in every scene narrative. "
        f"Respond with ONLY valid JSON."
    )


def _parse_llm_response(raw_content: str) -> List[dict]:
    """
    Parse the raw LLM response into a list of scene dictionaries.

    Handles cases where the LLM wraps JSON in markdown code blocks.

    Args:
        raw_content: Raw text response from the LLM

    Returns:
        List of scene dictionaries

    Raises:
        QuestGenerationError: If the response cannot be parsed as valid JSON
    """
    content = raw_content.strip()

    # Strip markdown code blocks if present
    if content.startswith("```"):
        # Remove opening fence (```json or ```)
        first_newline = content.index("\n")
        content = content[first_newline + 1:]
        # Remove closing fence
        if content.endswith("```"):
            content = content[:-3].strip()

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise QuestGenerationError(
            f"Failed to parse quest generation response as JSON: {e}"
        )

    if isinstance(data, dict) and "scenes" in data:
        return data["scenes"]
    elif isinstance(data, list):
        return data
    else:
        raise QuestGenerationError(
            "Quest generation response missing 'scenes' key and is not a list"
        )


def _validate_and_build_scenes(raw_scenes: List[dict]) -> List[Scene]:
    """
    Validate the parsed scene data and build Scene/Option model objects.

    Validates:
    - Exactly 8 scenes
    - Each scene has exactly 2 options
    - Each scene has exactly one correct option
    - Scene numbers are 1-8

    Args:
        raw_scenes: List of raw scene dictionaries from LLM

    Returns:
        List of 8 Scene model objects

    Raises:
        QuestGenerationError: If validation fails
    """
    if len(raw_scenes) != 8:
        raise QuestGenerationError(
            f"Expected exactly 8 scenes, got {len(raw_scenes)}"
        )

    scenes: List[Scene] = []

    for i, raw_scene in enumerate(raw_scenes):
        scene_number = raw_scene.get("scene_number", i + 1)

        # Extract narrative and question
        narrative = raw_scene.get("narrative", "")
        question = raw_scene.get("question", "")

        if not narrative or not question:
            raise QuestGenerationError(
                f"Scene {scene_number} missing narrative or question"
            )

        # Extract options - support both formats
        options_data = []
        if "option_a" in raw_scene and "option_b" in raw_scene:
            # Format: option_a / option_b as objects
            opt_a = raw_scene["option_a"]
            opt_b = raw_scene["option_b"]
            options_data = [
                {"id": "a", **opt_a},
                {"id": "b", **opt_b},
            ]
        elif "options" in raw_scene:
            # Format: options as a list
            raw_opts = raw_scene["options"]
            if len(raw_opts) != 2:
                raise QuestGenerationError(
                    f"Scene {scene_number} must have exactly 2 options, got {len(raw_opts)}"
                )
            for idx, opt in enumerate(raw_opts):
                opt_id = opt.get("id", "a" if idx == 0 else "b")
                options_data.append({"id": opt_id, **opt})
        else:
            raise QuestGenerationError(
                f"Scene {scene_number} missing options"
            )

        if len(options_data) != 2:
            raise QuestGenerationError(
                f"Scene {scene_number} must have exactly 2 options"
            )

        # Validate exactly one correct option
        correct_count = sum(
            1 for opt in options_data if opt.get("is_correct", False)
        )
        if correct_count != 1:
            raise QuestGenerationError(
                f"Scene {scene_number} must have exactly 1 correct option, got {correct_count}"
            )

        # Build Option models
        options = []
        for opt_data in options_data:
            options.append(
                Option(
                    id=opt_data.get("id", ""),
                    text=opt_data.get("text", ""),
                    is_correct=opt_data.get("is_correct", False),
                    feedback=opt_data.get("feedback", ""),
                )
            )

        # Build Scene model (image_url will be populated later by scene_illustrator)
        scene = Scene(
            scene_number=scene_number,
            narrative=narrative,
            question=question,
            options=options,
            image_url="",  # Populated by scene_illustrator later
        )
        scenes.append(scene)

    return scenes


class QuestEngine:
    """Generates interactive story quests teaching life lessons."""

    def __init__(self):
        from config import settings
        from llm_router import LLMRouter

        self.settings = settings
        self.llm_router = LLMRouter()

    async def generate_quest(
        self,
        character_name: str,
        character_description: str,
        lesson: str,
        genre: Genre,
        session_id: str,
    ) -> List[Scene]:
        """
        Generate an 8-scene interactive quest.

        Args:
            character_name: Character name to reference in every scene
            character_description: Full character description for visual trait references
            lesson: Life lesson topic (predefined or custom, validated)
            genre: Story genre determining setting and vocabulary
            session_id: Current session identifier

        Returns:
            List of 8 Scene objects

        Raises:
            QuestGenerationError: If generation fails via both providers or response is invalid
        """
        logger.info(
            f"Generating quest: character={character_name}, lesson={lesson}, "
            f"genre={genre.value}, session={session_id}"
        )

        # Build prompts
        system_prompt = _build_system_prompt(
            character_name, character_description, lesson, genre
        )
        user_prompt = _build_user_prompt(
            character_name, character_description, lesson, genre
        )

        # Route through LLM Router for Bedrock/OpenRouter fallback
        try:
            response = await self.llm_router.quest_generation(
                prompt=user_prompt,
                system_prompt=system_prompt,
            )
        except Exception as e:
            logger.error(f"Quest generation LLM call failed: {e}")
            raise QuestGenerationError(
                f"Quest generation failed: {e}"
            ) from e

        raw_content = response.get("content", "")
        provider = response.get("provider", "unknown")
        latency_ms = response.get("latency_ms", 0)

        logger.info(
            f"Quest generation response received: provider={provider}, "
            f"latency_ms={latency_ms}, content_length={len(raw_content)}"
        )

        # Parse the LLM JSON response
        raw_scenes = _parse_llm_response(raw_content)

        # Validate and build Scene/Option models
        scenes = _validate_and_build_scenes(raw_scenes)

        logger.info(
            f"Quest generated successfully: {len(scenes)} scenes, "
            f"character={character_name}, lesson={lesson}"
        )

        return scenes


class QuestGenerationError(Exception):
    """Raised when quest generation fails after all retries."""

    pass
