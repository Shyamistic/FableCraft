"""
Property-based tests for quest_engine.py - Quest generation structure, content, and safety.
Tests quest structure invariants, character name presence, and content safety using Hypothesis.

**Validates: Requirements 6.1, 6.2, 6.3, 6.7**
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from quest_engine import (
    _build_system_prompt,
    _parse_llm_response,
    _validate_and_build_scenes,
    GENRE_SETTINGS,
    CONTENT_SAFETY_RULES,
)
from models import Genre, Scene, Option


# --- Strategies ---

# Strategy for genre selection
st_genre = st.sampled_from(list(Genre))

# Strategy for character names (non-empty printable strings)
st_character_name = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "Zs")),
    min_size=1,
    max_size=50,
).filter(lambda s: s.strip() != "")

# Strategy for character descriptions
st_character_description = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "Zs", "P")),
    min_size=10,
    max_size=500,
).filter(lambda s: s.strip() != "")

# Strategy for lesson names
st_lesson = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "Zs")),
    min_size=3,
    max_size=100,
).filter(lambda s: s.strip() != "")

# Strategy for option correctness placement (which option is correct: 'a' or 'b')
st_correct_option = st.sampled_from(["a", "b"])

# Strategy for short text (for narratives, questions, etc.)
st_short_text = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "Zs")),
    min_size=5,
    max_size=100,
).filter(lambda s: s.strip() != "")


# --- Helpers ---


def build_valid_scene_json(
    scene_number: int,
    correct_option: str,
    character_name: str = "Sparkle",
) -> dict:
    """Build a valid scene dictionary in the LLM response format."""
    option_a_correct = correct_option == "a"
    return {
        "scene_number": scene_number,
        "narrative": f"{character_name} found a wonderful garden with colorful flowers blooming everywhere.",
        "question": f"What should {character_name} do next?",
        "option_a": {
            "text": "Share the flowers with friends",
            "is_correct": option_a_correct,
            "feedback": "Wonderful! Everyone loves sharing!",
        },
        "option_b": {
            "text": "Keep all the flowers hidden away",
            "is_correct": not option_a_correct,
            "feedback": "Hmm, friends look sad. Let's try again!",
        },
    }


def build_valid_8_scene_response(
    correct_options: list,
    character_name: str = "Sparkle",
) -> str:
    """Build a valid 8-scene JSON response string as an LLM would return."""
    scenes = []
    for i in range(8):
        scenes.append(
            build_valid_scene_json(i + 1, correct_options[i], character_name)
        )
    return json.dumps({"scenes": scenes})


# --- Strategy for generating valid 8-scene raw data ---


@st.composite
def st_valid_8_scenes(draw, character_name="Sparkle"):
    """Strategy that generates a list of 8 valid raw scene dictionaries."""
    scenes = []
    for i in range(8):
        correct = draw(st_correct_option)
        scenes.append(build_valid_scene_json(i + 1, correct, character_name))
    return scenes


@st.composite
def st_valid_8_scene_json_response(draw):
    """Strategy that generates a valid 8-scene JSON response string."""
    character_name = draw(st_character_name)
    correct_options = draw(st.lists(st_correct_option, min_size=8, max_size=8))
    return build_valid_8_scene_response(correct_options, character_name)


@st.composite
def st_scene_count(draw):
    """Strategy for invalid scene counts (not 8)."""
    count = draw(st.integers(min_value=0, max_value=20))
    assume(count != 8)
    return count


# --- Property 10: Quest Structure Invariant ---


@pytest.mark.property
class TestProperty10QuestStructureInvariant:
    """
    Property 10: Quest Structure Invariant

    For any valid LLM response parsed into scenes, there must be exactly 8 scenes,
    each with exactly 2 options, and exactly 1 correct option per scene.

    **Validates: Requirements 6.1, 6.2**
    """

    @settings(max_examples=50, deadline=None)
    @given(correct_options=st.lists(st_correct_option, min_size=8, max_size=8))
    def test_valid_response_produces_exactly_8_scenes(self, correct_options):
        """
        For any valid 8-scene JSON response, _validate_and_build_scenes must
        produce exactly 8 Scene objects.

        **Validates: Requirements 6.1**
        """
        raw_json = build_valid_8_scene_response(correct_options)
        raw_scenes = _parse_llm_response(raw_json)
        scenes = _validate_and_build_scenes(raw_scenes)

        assert len(scenes) == 8

    @settings(max_examples=50, deadline=None)
    @given(correct_options=st.lists(st_correct_option, min_size=8, max_size=8))
    def test_each_scene_has_exactly_2_options(self, correct_options):
        """
        For any valid quest, every scene must have exactly 2 options.

        **Validates: Requirements 6.2**
        """
        raw_json = build_valid_8_scene_response(correct_options)
        raw_scenes = _parse_llm_response(raw_json)
        scenes = _validate_and_build_scenes(raw_scenes)

        for scene in scenes:
            assert len(scene.options) == 2

    @settings(max_examples=50, deadline=None)
    @given(correct_options=st.lists(st_correct_option, min_size=8, max_size=8))
    def test_each_scene_has_exactly_1_correct_option(self, correct_options):
        """
        For any valid quest, every scene must have exactly 1 correct option
        (is_correct=True) and 1 incorrect option (is_correct=False).

        **Validates: Requirements 6.2**
        """
        raw_json = build_valid_8_scene_response(correct_options)
        raw_scenes = _parse_llm_response(raw_json)
        scenes = _validate_and_build_scenes(raw_scenes)

        for scene in scenes:
            correct_count = sum(1 for opt in scene.options if opt.is_correct)
            assert correct_count == 1, (
                f"Scene {scene.scene_number} has {correct_count} correct options, expected 1"
            )

    @settings(max_examples=30, deadline=None)
    @given(bad_count=st_scene_count())
    def test_rejects_non_8_scene_responses(self, bad_count):
        """
        For any response with a number of scenes other than 8,
        _validate_and_build_scenes must raise QuestGenerationError.

        **Validates: Requirements 6.1**
        """
        from quest_engine import QuestGenerationError

        # Build a response with the wrong number of scenes
        scenes = []
        for i in range(bad_count):
            scenes.append(build_valid_scene_json(i + 1, "a"))

        with pytest.raises(QuestGenerationError):
            _validate_and_build_scenes(scenes)

    @settings(max_examples=30, deadline=None)
    @given(
        correct_options=st.lists(st_correct_option, min_size=8, max_size=8),
    )
    def test_scene_numbers_are_sequential_1_to_8(self, correct_options):
        """
        For any valid quest, scene numbers must be 1 through 8.

        **Validates: Requirements 6.1**
        """
        raw_json = build_valid_8_scene_response(correct_options)
        raw_scenes = _parse_llm_response(raw_json)
        scenes = _validate_and_build_scenes(raw_scenes)

        scene_numbers = [s.scene_number for s in scenes]
        assert scene_numbers == list(range(1, 9))

    @settings(max_examples=30, deadline=None)
    @given(correct_options=st.lists(st_correct_option, min_size=8, max_size=8))
    def test_rejects_scene_with_both_options_correct(self, correct_options):
        """
        For any scene where both options are marked as correct,
        _validate_and_build_scenes must raise QuestGenerationError.

        **Validates: Requirements 6.2**
        """
        from quest_engine import QuestGenerationError

        # Build valid scenes then corrupt one
        scenes_data = []
        for i in range(8):
            scenes_data.append(
                build_valid_scene_json(i + 1, correct_options[i])
            )

        # Make scene 3 have both options correct
        scenes_data[2]["option_a"]["is_correct"] = True
        scenes_data[2]["option_b"]["is_correct"] = True

        with pytest.raises(QuestGenerationError):
            _validate_and_build_scenes(scenes_data)

    @settings(max_examples=30, deadline=None)
    @given(correct_options=st.lists(st_correct_option, min_size=8, max_size=8))
    def test_rejects_scene_with_no_correct_option(self, correct_options):
        """
        For any scene where no option is marked as correct,
        _validate_and_build_scenes must raise QuestGenerationError.

        **Validates: Requirements 6.2**
        """
        from quest_engine import QuestGenerationError

        # Build valid scenes then corrupt one
        scenes_data = []
        for i in range(8):
            scenes_data.append(
                build_valid_scene_json(i + 1, correct_options[i])
            )

        # Make scene 5 have no correct option
        scenes_data[4]["option_a"]["is_correct"] = False
        scenes_data[4]["option_b"]["is_correct"] = False

        with pytest.raises(QuestGenerationError):
            _validate_and_build_scenes(scenes_data)


# --- Property 11: Character Name Presence in Scenes ---


@pytest.mark.property
class TestProperty11CharacterNamePresenceInScenes:
    """
    Property 11: Character Name Presence in Scenes

    For any generated quest, the character_name must appear in EVERY scene's
    narrative text. We test this by verifying the system prompt instructs the LLM
    to include the character name in every scene.

    **Validates: Requirements 6.3**
    """

    @settings(max_examples=50, deadline=None)
    @given(
        character_name=st_character_name,
        character_description=st_character_description,
        lesson=st_lesson,
        genre=st_genre,
    )
    def test_system_prompt_requires_character_name_in_every_scene(
        self, character_name, character_description, lesson, genre
    ):
        """
        For any character name, the system prompt must instruct the LLM to
        mention the character name in EVERY scene narrative.

        **Validates: Requirements 6.3**
        """
        prompt = _build_system_prompt(
            character_name, character_description, lesson, genre
        )

        # The prompt must mention the character name
        assert character_name in prompt, (
            f"Character name '{character_name}' not found in system prompt"
        )

        # The prompt must explicitly instruct to mention the name in every scene
        prompt_lower = prompt.lower()
        assert "every scene" in prompt_lower or "every scene narrative" in prompt_lower, (
            "System prompt does not instruct to include character name in every scene"
        )

    @settings(max_examples=50, deadline=None)
    @given(
        character_name=st_character_name,
        character_description=st_character_description,
        lesson=st_lesson,
        genre=st_genre,
    )
    def test_character_name_appears_in_prompt_instruction_with_quotes(
        self, character_name, character_description, lesson, genre
    ):
        """
        For any character name, the system prompt must quote the character name
        in an explicit instruction about scene narrative content.

        **Validates: Requirements 6.3**
        """
        prompt = _build_system_prompt(
            character_name, character_description, lesson, genre
        )

        # The prompt must contain the character name in quotes as an instruction
        assert f'"{character_name}"' in prompt, (
            f"Character name '{character_name}' not found quoted in system prompt"
        )

    @settings(max_examples=50, deadline=None)
    @given(
        correct_options=st.lists(st_correct_option, min_size=8, max_size=8),
        character_name=st_character_name,
    )
    def test_parsed_scenes_contain_character_name_in_narrative(
        self, correct_options, character_name
    ):
        """
        For any valid quest response where scenes include the character name,
        the parsed scene narratives must contain the character name.

        **Validates: Requirements 6.3**
        """
        # Build scenes that contain the character name (as LLM should produce)
        raw_json = build_valid_8_scene_response(correct_options, character_name)
        raw_scenes = _parse_llm_response(raw_json)
        scenes = _validate_and_build_scenes(raw_scenes)

        for scene in scenes:
            assert character_name in scene.narrative, (
                f"Character name '{character_name}' not in scene {scene.scene_number} "
                f"narrative: '{scene.narrative}'"
            )


# --- Property 12: Quest Content Safety ---


@pytest.mark.property
class TestProperty12QuestContentSafety:
    """
    Property 12: Quest Content Safety

    For any system prompt built for quest generation, content safety rules
    (no violence, weapons, death, dangerous situations) must be included.

    **Validates: Requirements 6.7**
    """

    @settings(max_examples=50, deadline=None)
    @given(
        character_name=st_character_name,
        character_description=st_character_description,
        lesson=st_lesson,
        genre=st_genre,
    )
    def test_system_prompt_includes_content_safety_rules(
        self, character_name, character_description, lesson, genre
    ):
        """
        For any system prompt built for quest generation, the CONTENT_SAFETY_RULES
        must be included in full.

        **Validates: Requirements 6.7**
        """
        prompt = _build_system_prompt(
            character_name, character_description, lesson, genre
        )

        assert CONTENT_SAFETY_RULES in prompt, (
            "Content safety rules not found in system prompt"
        )

    @settings(max_examples=50, deadline=None)
    @given(
        character_name=st_character_name,
        character_description=st_character_description,
        lesson=st_lesson,
        genre=st_genre,
    )
    def test_system_prompt_prohibits_violence(
        self, character_name, character_description, lesson, genre
    ):
        """
        For any system prompt, the safety rules must explicitly prohibit violence.

        **Validates: Requirements 6.7**
        """
        prompt = _build_system_prompt(
            character_name, character_description, lesson, genre
        )

        prompt_lower = prompt.lower()
        assert "no violence" in prompt_lower or "violence" in prompt_lower

    @settings(max_examples=50, deadline=None)
    @given(
        character_name=st_character_name,
        character_description=st_character_description,
        lesson=st_lesson,
        genre=st_genre,
    )
    def test_system_prompt_prohibits_weapons(
        self, character_name, character_description, lesson, genre
    ):
        """
        For any system prompt, the safety rules must explicitly prohibit weapons.

        **Validates: Requirements 6.7**
        """
        prompt = _build_system_prompt(
            character_name, character_description, lesson, genre
        )

        prompt_lower = prompt.lower()
        assert "weapon" in prompt_lower

    @settings(max_examples=50, deadline=None)
    @given(
        character_name=st_character_name,
        character_description=st_character_description,
        lesson=st_lesson,
        genre=st_genre,
    )
    def test_system_prompt_prohibits_death(
        self, character_name, character_description, lesson, genre
    ):
        """
        For any system prompt, the safety rules must explicitly prohibit death.

        **Validates: Requirements 6.7**
        """
        prompt = _build_system_prompt(
            character_name, character_description, lesson, genre
        )

        prompt_lower = prompt.lower()
        assert "death" in prompt_lower or "dying" in prompt_lower or "killing" in prompt_lower

    @settings(max_examples=50, deadline=None)
    @given(
        character_name=st_character_name,
        character_description=st_character_description,
        lesson=st_lesson,
        genre=st_genre,
    )
    def test_system_prompt_prohibits_dangerous_situations(
        self, character_name, character_description, lesson, genre
    ):
        """
        For any system prompt, the safety rules must explicitly prohibit
        dangerous situations.

        **Validates: Requirements 6.7**
        """
        prompt = _build_system_prompt(
            character_name, character_description, lesson, genre
        )

        prompt_lower = prompt.lower()
        assert "dangerous" in prompt_lower or "danger" in prompt_lower

    @settings(max_examples=50, deadline=None)
    @given(
        character_name=st_character_name,
        character_description=st_character_description,
        lesson=st_lesson,
        genre=st_genre,
    )
    def test_system_prompt_specifies_age_range(
        self, character_name, character_description, lesson, genre
    ):
        """
        For any system prompt, the content safety rules must specify
        the target age range (4-8 years).

        **Validates: Requirements 6.7**
        """
        prompt = _build_system_prompt(
            character_name, character_description, lesson, genre
        )

        assert "4-8" in prompt, (
            "System prompt does not specify age range 4-8"
        )
