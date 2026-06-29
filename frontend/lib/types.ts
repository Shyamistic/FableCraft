/**
 * Shared TypeScript interfaces and data models for the application.
 * These types define the core domain objects used across the frontend.
 */

// ─── Genre ───────────────────────────────────────────────────────────────────

/** Available story genres that determine the visual theme and setting of quests. */
export type Genre =
  | "fantasy_kingdom"
  | "outer_space"
  | "underwater_world"
  | "jungle_safari";

// ─── Character & Quest Models ────────────────────────────────────────────────

/** A generated animated character created from a child's drawing. */
export interface Character {
  id: string;
  name: string;
  character_type: string;
  character_description: string;
  colors_used: string[];
  artistic_style: string;
  mood: string;
  generated_image_url: string;
  original_drawing_url: string;
  created_at: string;
}

/** An answer option for a quest scene. */
export interface Option {
  id: string;
  text: string;
  is_correct: boolean;
  feedback: string;
}

/** A single scene within an interactive quest. */
export interface Scene {
  scene_number: number;
  narrative: string;
  question: string;
  options: Option[];
  image_url: string;
}

/** A complete 8-scene interactive story quest. */
export interface Quest {
  id: string;
  title: string;
  lesson: string;
  genre: Genre;
  character_name: string;
  character_description: string;
  scenes: Scene[];
  total_scenes: number;
  created_at: string;
}

// ─── Session Persistence Models ──────────────────────────────────────────────

/** A character entry stored in the gallery (lightweight subset of Character). */
export interface GalleryEntry {
  id: string;
  name: string;
  generated_image_url: string;
  original_drawing_url: string;
  created_at: string;
}

/** Tracks progress through an active quest. */
export interface QuestProgress {
  quest_id: string;
  quest_data: Quest;
  current_scene: number;
  coins_earned: number;
  completed_scenes: number[];
  started_at: string;
}

/** Duration record for a single session. */
export interface SessionDuration {
  date: string;
  duration_minutes: number;
}

/** Aggregated statistics visible in the Parent Dashboard. */
export interface ParentStats {
  quests_completed: number;
  unique_lessons: string[];
  total_coins: number;
  characters_created: number;
  session_durations: SessionDuration[];
}

/** A completed quest record shown in the Parent Dashboard history. */
export interface CompletedQuest {
  quest_id: string;
  lesson: string;
  genre: Genre;
  character_name: string;
  character_thumbnail: string;
  completed_at: string;
  coins_earned: number;
}

/** The full persisted session stored in browser local storage. */
export interface PersistedSession {
  version: number;
  character_gallery: GalleryEntry[];
  active_quest: QuestProgress | null;
  parent_pin: string;
  parent_stats: ParentStats;
  recent_quests: CompletedQuest[];
}

// ─── Collaborative Mode Models ───────────────────────────────────────────────

/** Information about a player in a collaborative session. */
export interface PlayerInfo {
  name: string;
  connected: boolean;
  last_heartbeat: string;
}

/** Status of a collaborative session. */
export type CollaborativeSessionStatus =
  | "waiting"
  | "active"
  | "solo"
  | "completed";

/** A collaborative story session between two players. */
export interface CollaborativeSession {
  room_code: string;
  created_at: string;
  expires_at: string;
  player1: PlayerInfo;
  player2: PlayerInfo | null;
  quest: Quest;
  current_scene: number;
  active_player: 1 | 2;
  shared_coins: number;
  status: CollaborativeSessionStatus;
}

// ─── Analytics Models ────────────────────────────────────────────────────────

/** Events tracked by the analytics system. */
export type TrackedEventName =
  | "drawing_started"
  | "drawing_completed"
  | "character_generated"
  | "lesson_selected"
  | "genre_selected"
  | "quest_started"
  | "scene_completed"
  | "quest_completed"
  | "gallery_opened"
  | "collaborative_session_started";

/** An analytics event dispatched to Novus.ai. */
export interface AnalyticsEvent {
  event_name: TrackedEventName;
  timestamp: string;
  session_id: string;
  properties: Record<string, string | number | boolean>;
}
