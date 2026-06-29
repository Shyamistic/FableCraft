/**
 * Session Persistence Manager
 *
 * Manages all local storage operations for the application, including:
 * - Quest state persistence (current scene, coins, completed scenes)
 * - Character Gallery persistence (name, image URIs, max 20 characters)
 * - Resume/discard detection for incomplete quests on app load
 * - Graceful handling of unavailable local storage
 * - Corrupted/unparseable JSON recovery
 * - Schema versioning for future migration support
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5
 */

import {
  LOCAL_STORAGE_KEY,
  MAX_PERSISTED_CHARACTERS,
  PERSISTENCE_SCHEMA_VERSION,
} from './constants';
import type {
  PersistedSession,
  QuestProgress,
  GalleryEntry,
  ParentStats,
  CompletedQuest,
} from './types';

// ─── Default State ───────────────────────────────────────────────────────────

/** Returns a fresh default session with no persisted data. */
export function getDefaultSession(): PersistedSession {
  return {
    version: PERSISTENCE_SCHEMA_VERSION,
    character_gallery: [],
    active_quest: null,
    parent_pin: '1234',
    parent_stats: {
      quests_completed: 0,
      unique_lessons: [],
      total_coins: 0,
      characters_created: 0,
      session_durations: [],
    },
    recent_quests: [],
  };
}

// ─── Storage Availability Check ──────────────────────────────────────────────

/** Checks whether localStorage is available and functional. */
export function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, 'test');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

// ─── Schema Migration ────────────────────────────────────────────────────────

/**
 * Migrates persisted data from an older schema version to the current version.
 * Returns the migrated session or null if migration is not possible.
 */
export function migrateSession(
  data: Record<string, unknown>
): PersistedSession | null {
  const version = typeof data.version === 'number' ? data.version : 0;

  // If already at current version, validate and return
  if (version === PERSISTENCE_SCHEMA_VERSION) {
    return validateSession(data);
  }

  // Future migrations go here as version increases:
  // if (version === 1) { migrate v1 -> v2; version = 2; }
  // if (version === 2) { migrate v2 -> v3; version = 3; }

  // If version is from the future or unrecognized, discard
  if (version > PERSISTENCE_SCHEMA_VERSION || version < 0) {
    return null;
  }

  // Version 0 or missing version: attempt best-effort migration to v1
  const migrated: PersistedSession = {
    version: PERSISTENCE_SCHEMA_VERSION,
    character_gallery: Array.isArray(data.character_gallery)
      ? (data.character_gallery as GalleryEntry[]).slice(
          0,
          MAX_PERSISTED_CHARACTERS
        )
      : [],
    active_quest: isValidQuestProgress(data.active_quest)
      ? (data.active_quest as QuestProgress)
      : null,
    parent_pin: typeof data.parent_pin === 'string' ? data.parent_pin : '',
    parent_stats: isValidParentStats(data.parent_stats)
      ? (data.parent_stats as ParentStats)
      : getDefaultSession().parent_stats,
    recent_quests: Array.isArray(data.recent_quests)
      ? (data.recent_quests as CompletedQuest[])
      : [],
  };

  return migrated;
}

// ─── Validation Helpers ──────────────────────────────────────────────────────

/** Validates that a parsed object has the shape of a PersistedSession. */
export function validateSession(
  data: Record<string, unknown>
): PersistedSession | null {
  try {
    if (typeof data !== 'object' || data === null) return null;
    if (data.version !== PERSISTENCE_SCHEMA_VERSION) return null;

    if (!Array.isArray(data.character_gallery)) return null;
    if (
      data.active_quest !== null &&
      !isValidQuestProgress(data.active_quest)
    ) {
      return null;
    }
    if (typeof data.parent_pin !== 'string') return null;
    if (!isValidParentStats(data.parent_stats)) return null;
    if (!Array.isArray(data.recent_quests)) return null;

    return data as unknown as PersistedSession;
  } catch {
    return null;
  }
}

/** Checks if a value looks like a valid QuestProgress object. */
function isValidQuestProgress(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.quest_id === 'string' &&
    typeof obj.current_scene === 'number' &&
    typeof obj.coins_earned === 'number' &&
    Array.isArray(obj.completed_scenes) &&
    typeof obj.started_at === 'string' &&
    obj.quest_data !== undefined &&
    obj.quest_data !== null
  );
}

/** Checks if a value looks like valid ParentStats. */
function isValidParentStats(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.quests_completed === 'number' &&
    Array.isArray(obj.unique_lessons) &&
    typeof obj.total_coins === 'number' &&
    typeof obj.characters_created === 'number' &&
    Array.isArray(obj.session_durations)
  );
}

// ─── Core Persistence Operations ─────────────────────────────────────────────

/**
 * Loads the persisted session from local storage.
 * Returns the default session if:
 * - Local storage is unavailable (Req 19.4)
 * - Data is corrupted/unparseable (Req 19.5)
 * - No data has been saved yet
 */
export function loadSession(): PersistedSession {
  if (!isLocalStorageAvailable()) {
    return getDefaultSession();
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw === null) {
      return getDefaultSession();
    }

    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      // Corrupted data: discard and start fresh (Req 19.5)
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      return getDefaultSession();
    }

    // Attempt migration if needed
    const session = migrateSession(parsed as Record<string, unknown>);
    if (session === null) {
      // Data could not be validated/migrated: discard (Req 19.5)
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      return getDefaultSession();
    }

    return session;
  } catch {
    // JSON parse failed or any other error: discard (Req 19.5)
    try {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // Storage may be unavailable, ignore
    }
    return getDefaultSession();
  }
}

/**
 * Saves the full session to local storage.
 * Silently fails if local storage is unavailable (Req 19.4).
 */
export function saveSession(session: PersistedSession): void {
  if (!isLocalStorageAvailable()) {
    return;
  }

  try {
    const serialized = JSON.stringify(session);
    window.localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
  } catch {
    // Quota exceeded or storage unavailable: fail silently (Req 19.4)
  }
}

// ─── Quest State Persistence (Req 19.1) ──────────────────────────────────────

/**
 * Persists the current quest progress state.
 * Should be called within 1 second of any quest state change
 * (scene navigation, coin earned, scene completed).
 */
export function persistQuestProgress(progress: QuestProgress | null): void {
  const session = loadSession();
  session.active_quest = progress;
  saveSession(session);
}

/**
 * Checks if there is an incomplete quest persisted in local storage.
 * Used on app load to determine if resume/discard prompt should be shown (Req 19.2).
 */
export function getPersistedQuest(): QuestProgress | null {
  const session = loadSession();
  return session.active_quest;
}

/**
 * Clears the active quest from persistence (used when user discards or completes a quest).
 */
export function clearPersistedQuest(): void {
  const session = loadSession();
  session.active_quest = null;
  saveSession(session);
}

// ─── Character Gallery Persistence (Req 19.3) ────────────────────────────────

/**
 * Retrieves the persisted character gallery.
 * Returns at most MAX_PERSISTED_CHARACTERS entries.
 */
export function getPersistedGallery(): GalleryEntry[] {
  const session = loadSession();
  return session.character_gallery.slice(0, MAX_PERSISTED_CHARACTERS);
}

/**
 * Adds a character to the persisted gallery.
 * Maintains the maximum of MAX_PERSISTED_CHARACTERS, removing the oldest
 * entries when the limit would be exceeded.
 * Characters are stored newest-first.
 */
export function addCharacterToGallery(entry: GalleryEntry): void {
  const session = loadSession();

  // Remove duplicate if the same character id already exists
  session.character_gallery = session.character_gallery.filter(
    (c) => c.id !== entry.id
  );

  // Add new entry at the beginning (newest-first)
  session.character_gallery.unshift(entry);

  // Enforce maximum limit
  if (session.character_gallery.length > MAX_PERSISTED_CHARACTERS) {
    session.character_gallery = session.character_gallery.slice(
      0,
      MAX_PERSISTED_CHARACTERS
    );
  }

  saveSession(session);
}

/**
 * Replaces the entire gallery with the provided entries.
 * Enforces the MAX_PERSISTED_CHARACTERS limit.
 */
export function setPersistedGallery(entries: GalleryEntry[]): void {
  const session = loadSession();
  session.character_gallery = entries.slice(0, MAX_PERSISTED_CHARACTERS);
  saveSession(session);
}

// ─── Parent Stats Persistence ────────────────────────────────────────────────

/** Retrieves the persisted parent stats. */
export function getPersistedParentStats(): ParentStats {
  const session = loadSession();
  return session.parent_stats;
}

/** Updates the parent stats in persistence. */
export function persistParentStats(stats: ParentStats): void {
  const session = loadSession();
  session.parent_stats = stats;
  saveSession(session);
}

// ─── Parent PIN Persistence ──────────────────────────────────────────────────

/** Retrieves the persisted parent PIN. */
export function getPersistedParentPin(): string {
  const session = loadSession();
  return session.parent_pin;
}

/** Saves the parent PIN to persistence. */
export function persistParentPin(pin: string): void {
  const session = loadSession();
  session.parent_pin = pin;
  saveSession(session);
}

// ─── Recent Quests Persistence ───────────────────────────────────────────────

/** Retrieves the persisted recent quests. */
export function getPersistedRecentQuests(): CompletedQuest[] {
  const session = loadSession();
  return session.recent_quests;
}

/** Adds a completed quest to the recent quests list. */
export function addCompletedQuest(quest: CompletedQuest): void {
  const session = loadSession();
  session.recent_quests.unshift(quest);
  // Cap at 50 recent quests
  if (session.recent_quests.length > 50) {
    session.recent_quests = session.recent_quests.slice(0, 50);
  }
  // Clear active quest since it's now completed
  session.active_quest = null;
  saveSession(session);
}

// ─── Full Session Reset ──────────────────────────────────────────────────────

/** Resets all persisted data to the default state. */
export function resetSession(): void {
  saveSession(getDefaultSession());
}

// ─── Session ID Generation ───────────────────────────────────────────────────

/**
 * Generates a unique session ID using UUID v4 format.
 * Used to track the current app session for analytics and state management.
 */
export function generateSessionId(): string {
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
