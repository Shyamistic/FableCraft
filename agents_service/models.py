"""
Pydantic models for all API request/response schemas.
Matches the design contracts defined in the design document.
"""

from typing import List, Optional
from pydantic import BaseModel, Field
from enum import Enum


# --- Enums ---


class Genre(str, Enum):
    fantasy_kingdom = "fantasy_kingdom"
    outer_space = "outer_space"
    underwater_world = "underwater_world"
    jungle_safari = "jungle_safari"


class ErrorCode(str, Enum):
    CONTENT_BLOCKED = "CONTENT_BLOCKED"
    GENERATION_FAILED = "GENERATION_FAILED"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"
    EMPTY_DRAWING = "EMPTY_DRAWING"
    CUSTOM_LESSON_REJECTED = "CUSTOM_LESSON_REJECTED"
    PIN_LOCKOUT = "PIN_LOCKOUT"
    PIN_INCORRECT = "PIN_INCORRECT"
    ROOM_EXPIRED = "ROOM_EXPIRED"
    TIMEOUT = "TIMEOUT"


# --- Character Generation ---


class CharacterGenerateRequest(BaseModel):
    """POST /api/characters/generate request body."""

    drawing_data: str = Field(
        ..., description="Base64-encoded drawing image data"
    )
    character_name: str = Field(
        ..., min_length=1, max_length=100, description="Name of the character"
    )
    session_id: str = Field(..., description="UUID v4 session identifier")


class CharacterData(BaseModel):
    """Character data returned after generation."""

    id: str = Field(..., description="UUID v4 character identifier")
    name: str = Field(..., description="Character name")
    character_type: str = Field(
        ..., description="Type of character (e.g., bunny, dragon, robot)"
    )
    character_description: str = Field(
        ..., max_length=500, description="Full text description"
    )
    colors_used: List[str] = Field(
        ..., max_length=10, description="Array of color names (max 10)"
    )
    artistic_style: str = Field(
        ..., description="Art style (e.g., whimsical, bold, soft)"
    )
    mood: str = Field(
        ..., description="Character mood (e.g., happy, curious, brave)"
    )
    generated_image_url: str = Field(
        ..., description="CDN URL to generated character image"
    )
    original_drawing_url: str = Field(
        ..., description="CDN URL to original drawing"
    )
    created_at: str = Field(..., description="ISO 8601 timestamp")


class CharacterGenerateResponse(BaseModel):
    """POST /api/characters/generate success response."""

    status: str = "success"
    character: CharacterData


# --- Quest Generation ---


class Option(BaseModel):
    """A single answer option for a quest scene."""

    id: str = Field(..., description="Option identifier ('a' or 'b')")
    text: str = Field(..., description="Option text (max 20 words)")
    is_correct: bool = Field(
        ..., description="True for prosocial/correct option"
    )
    feedback: str = Field(
        ..., description="Feedback text (1 sentence, max 25 words)"
    )


class Scene(BaseModel):
    """A single scene in a quest."""

    scene_number: int = Field(..., ge=1, le=8, description="Scene number (1-8)")
    narrative: str = Field(
        ..., description="Narrative scenario (1-2 sentences, max 40 words)"
    )
    question: str = Field(
        ..., description="Question about what the character should do (max 15 words)"
    )
    options: List[Option] = Field(
        ..., min_length=2, max_length=2, description="Exactly 2 answer options"
    )
    image_url: str = Field(
        ..., description="CDN URL to scene illustration (16:9)"
    )


class QuestGenerateRequest(BaseModel):
    """POST /api/quests/generate request body."""

    character_id: str = Field(..., description="UUID v4 character identifier")
    character_name: str = Field(..., description="Character name")
    character_description: str = Field(
        ..., max_length=500, description="Full character description"
    )
    lesson: str = Field(..., description="Lesson identifier or custom text")
    genre: Genre = Field(
        default=Genre.fantasy_kingdom, description="Story genre"
    )
    session_id: str = Field(..., description="UUID v4 session identifier")


class QuestData(BaseModel):
    """Quest data returned after generation."""

    id: str = Field(..., description="UUID v4 quest identifier")
    title: str = Field(..., description="Generated quest title")
    lesson: str = Field(..., description="Lesson topic")
    genre: Genre = Field(..., description="Selected genre")
    character_name: str = Field(..., description="Character name used in quest")
    scenes: List[Scene] = Field(
        ..., min_length=8, max_length=8, description="Array of 8 scenes"
    )
    total_scenes: int = Field(default=8, description="Always 8")


class QuestGenerateResponse(BaseModel):
    """POST /api/quests/generate success response."""

    status: str = "success"
    quest: QuestData


# --- TTS ---


class TTSSynthesizeRequest(BaseModel):
    """POST /api/tts/synthesize request body."""

    text: str = Field(..., min_length=1, description="Text to synthesize")
    session_id: str = Field(..., description="UUID v4 session identifier")


class TTSSynthesizeResponse(BaseModel):
    """POST /api/tts/synthesize success response."""

    status: str = "success"
    audio_url: str = Field(..., description="CDN URL to MP3 audio file")
    duration_seconds: float = Field(..., description="Audio duration in seconds")


# --- Lesson Validation ---


class LessonValidateRequest(BaseModel):
    """POST /api/lessons/validate request body."""

    custom_lesson: str = Field(
        ..., min_length=3, max_length=200, description="Custom lesson text"
    )
    session_id: str = Field(..., description="UUID v4 session identifier")


class LessonValidateResponse(BaseModel):
    """POST /api/lessons/validate success response."""

    status: str = "success"
    is_appropriate: bool = Field(
        ..., description="Whether the lesson is age-appropriate"
    )
    sanitized_lesson: str = Field(
        ..., description="Sanitized lesson text"
    )


# --- Parent Dashboard ---


class ParentDashboardStats(BaseModel):
    """Parent dashboard statistics."""

    quests_completed: int = Field(default=0)
    lessons_covered: int = Field(default=0)
    total_coins: int = Field(default=0)
    characters_created: int = Field(default=0)
    total_time_minutes: int = Field(default=0)


class RecentQuest(BaseModel):
    """A recently completed quest entry for the dashboard."""

    quest_id: str
    lesson: str
    genre: Genre
    character_name: str
    character_thumbnail: str
    completed_at: str
    coins_earned: int = Field(ge=0, le=8)


class ParentDashboardResponse(BaseModel):
    """GET /api/parent/dashboard success response."""

    status: str = "success"
    stats: ParentDashboardStats
    recent_quests: List[RecentQuest] = Field(
        default_factory=list, max_length=50
    )


# --- Collaborative Mode ---


class CollabJoinEvent(BaseModel):
    """Client → Server: join a collaborative room."""

    type: str = "join"
    player_name: str
    room_code: str


class CollabAnswerEvent(BaseModel):
    """Client → Server: select an answer."""

    type: str = "select_answer"
    scene_number: int = Field(ge=1, le=8)
    option_id: str = Field(pattern="^[ab]$")


class CollabPlayerJoinedEvent(BaseModel):
    """Server → Client: a player joined the room."""

    type: str = "player_joined"
    player_name: str
    player_number: int = Field(ge=1, le=2)


class CollabSceneUpdateEvent(BaseModel):
    """Server → Client: scene update."""

    type: str = "scene_update"
    scene_number: int = Field(ge=1, le=8)
    active_player: int = Field(ge=1, le=2)


class CollabAnswerSelectedEvent(BaseModel):
    """Server → Client: answer was selected."""

    type: str = "answer_selected"
    scene_number: int = Field(ge=1, le=8)
    is_correct: bool
    coins: int = Field(ge=0, le=8)


class CollabWaitingEvent(BaseModel):
    """Server → Client: waiting for partner."""

    type: str = "waiting"
    message: str = "Waiting for your friend..."


class CollabDisconnectEvent(BaseModel):
    """Server → Client: player disconnected."""

    type: str = "player_disconnected"
    player_number: int = Field(ge=1, le=2)


class CollabQuestCompleteEvent(BaseModel):
    """Server → Client: quest is complete."""

    type: str = "quest_complete"
    total_coins: int = Field(ge=0, le=8)


# --- Error Response ---


class ErrorResponse(BaseModel):
    """Standard error response for all endpoints."""

    status: str = "error"
    code: ErrorCode
    message: str = Field(
        ...,
        description="Child-friendly error message (no technical jargon)",
    )
