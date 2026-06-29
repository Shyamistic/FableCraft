import type { Genre } from "./types";

// ─── Lessons ─────────────────────────────────────────────────────────────────

/** A predefined life lesson option displayed as a card. */
export interface LessonOption {
  id: string;
  title: string;
  description: string;
  emoji: string;
}

/** Predefined life lessons available for quest generation (Requirement 4.1). */
export const LESSONS: LessonOption[] = [
  {
    id: "sharing",
    title: "Sharing My Toys",
    description: "Learn why sharing makes everyone happy",
    emoji: "🤝",
  },
  {
    id: "kindness",
    title: "Being Kind with Words",
    description: "Discover the power of kind and gentle words",
    emoji: "💝",
  },
  {
    id: "honesty",
    title: "Telling the Truth",
    description: "Learn why being honest is important",
    emoji: "✨",
  },
  {
    id: "inclusion",
    title: "Including Others",
    description: "Make sure everyone feels welcome and included",
    emoji: "🌈",
  },
  {
    id: "patience",
    title: "Being Patient",
    description: "Learn to wait calmly and be patient",
    emoji: "⏰",
  },
  {
    id: "helping",
    title: "Helping Others",
    description: "Discover the joy of helping people",
    emoji: "🤲",
  },
  {
    id: "gratitude",
    title: "Saying Thank You",
    description: "Learn to appreciate and thank others",
    emoji: "🙏",
  },
  {
    id: "listening",
    title: "Listening Carefully",
    description: "Learn to listen when others are speaking",
    emoji: "👂",
  },
  {
    id: "apologizing",
    title: "Saying Sorry",
    description: "Learn when and how to apologize",
    emoji: "💙",
  },
  {
    id: "courage",
    title: "Being Brave",
    description: "Find courage to try new things",
    emoji: "🦁",
  },
  {
    id: "responsibility",
    title: "Taking Care of Things",
    description: "Learn to be responsible with belongings",
    emoji: "🎒",
  },
  {
    id: "emotions",
    title: "Understanding Feelings",
    description: "Learn to recognize and express emotions",
    emoji: "😊",
  },
];

// ─── Genres ──────────────────────────────────────────────────────────────────

/** A genre option displayed as an illustrated card. */
export interface GenreOption {
  id: Genre;
  name: string;
  description: string;
}

/** Available story genres (Requirement 5.1). */
export const GENRES: GenreOption[] = [
  {
    id: "fantasy_kingdom",
    name: "Fantasy Kingdom",
    description: "Castles, dragons, and magical lands",
  },
  {
    id: "outer_space",
    name: "Outer Space",
    description: "Planets, stars, and cosmic adventures",
  },
  {
    id: "underwater_world",
    name: "Underwater World",
    description: "Ocean depths and sea creatures",
  },
  {
    id: "jungle_safari",
    name: "Jungle Safari",
    description: "Wild animals and tropical forests",
  },
];

/** The default genre used when none is selected (Requirement 5.4). */
export const DEFAULT_GENRE: Genre = "fantasy_kingdom";

// ─── Quest Configuration ─────────────────────────────────────────────────────

/** Total number of scenes in a quest (Requirement 6.2). */
export const TOTAL_QUEST_SCENES = 8;

/** Maximum star coins earnable per quest (Requirement 6.9). */
export const MAX_COINS_PER_QUEST = 8;

/** Auto-advance countdown duration in seconds after correct answer (Requirement 8.2). */
export const CORRECT_ANSWER_COUNTDOWN_SECONDS = 8;

// ─── Gallery Configuration ───────────────────────────────────────────────────

/** Maximum characters stored in the gallery (Requirement 10.4). */
export const MAX_GALLERY_CHARACTERS = 50;

/** Maximum characters persisted in local storage (Requirement 19.3). */
export const MAX_PERSISTED_CHARACTERS = 20;

// ─── Parent Dashboard Configuration ─────────────────────────────────────────

/** Maximum recent quests shown in the Parent Dashboard (Requirement 11.2). */
export const MAX_RECENT_QUESTS = 50;

/** PIN length for parent dashboard access (Requirement 11.3). */
export const PARENT_PIN_LENGTH = 4;

/** Maximum consecutive incorrect PIN attempts before lockout (Requirement 11.4). */
export const MAX_PIN_ATTEMPTS = 5;

/** Lockout duration in seconds after exceeding max PIN attempts (Requirement 11.4). */
export const PIN_LOCKOUT_DURATION_SECONDS = 60;

// ─── Collaborative Mode Configuration ───────────────────────────────────────

/** Room code length for collaborative sessions (Requirement 12.1). */
export const ROOM_CODE_LENGTH = 4;

/** Room code expiry time in minutes if second player hasn't joined (Requirement 12.1). */
export const ROOM_CODE_EXPIRY_MINUTES = 5;

/** Disconnect timeout in seconds before enabling solo mode (Requirement 12.5). */
export const DISCONNECT_TIMEOUT_SECONDS = 30;

/** Inactivity timeout in seconds before sending reminder to active player (Requirement 12.3). */
export const PLAYER_INACTIVITY_TIMEOUT_SECONDS = 60;

// ─── Drawing / Upload Configuration ─────────────────────────────────────────

/** Maximum upload file size in bytes (5 MB) (Requirement 1.2). */
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

/** Supported image upload formats (Requirement 1.2). */
export const SUPPORTED_IMAGE_FORMATS = ["image/png", "image/jpeg", "image/webp"];

/** Minimum canvas resolution in pixels (Requirement 1.7). */
export const CANVAS_MIN_WIDTH = 900;
export const CANVAS_MIN_HEIGHT = 600;

/** Minimum brush size in pixels (Requirement 1.1). */
export const BRUSH_SIZE_MIN = 1;

/** Maximum brush size in pixels (Requirement 1.1). */
export const BRUSH_SIZE_MAX = 20;

/** Minimum non-white pixels required for a valid drawing (Requirement 2.6). */
export const MIN_DRAWING_PIXELS = 50;

// ─── Custom Lesson Validation ────────────────────────────────────────────────

/** Minimum length for custom lesson text (Requirement 4.3). */
export const CUSTOM_LESSON_MIN_LENGTH = 3;

/** Maximum length for custom lesson text (Requirement 4.3). */
export const CUSTOM_LESSON_MAX_LENGTH = 200;

// ─── Session Persistence ─────────────────────────────────────────────────────

/** Current schema version for local storage data (Requirement 19.1). */
export const PERSISTENCE_SCHEMA_VERSION = 1;

/** Local storage key for session data. */
export const LOCAL_STORAGE_KEY = "app_session";

// ─── UI / Interaction ────────────────────────────────────────────────────────

/** Minimum interactive element tap target size in pixels (Requirement 20.4). */
export const MIN_TAP_TARGET_PX = 44;

/** Minimum transition animation duration in ms (Requirement 20.2). */
export const TRANSITION_DURATION_MIN_MS = 200;

/** Maximum transition animation duration in ms (Requirement 20.2). */
export const TRANSITION_DURATION_MAX_MS = 600;
