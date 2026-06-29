/**
 * Unit tests for the session persistence manager.
 *
 * Tests cover:
 * - Loading/saving sessions from local storage
 * - Quest state persistence within 1 second of state change
 * - Character Gallery persistence (max 20 characters)
 * - Resume/discard detection for incomplete quests
 * - Graceful handling of unavailable local storage
 * - Corrupted/unparseable JSON recovery
 * - Schema versioning and migration
 *
 * Validates: Requirements 19.1, 19.2, 19.3, 19.4, 19.5
 */

import {
  getDefaultSession,
  isLocalStorageAvailable,
  migrateSession,
  validateSession,
  loadSession,
  saveSession,
  persistQuestProgress,
  getPersistedQuest,
  clearPersistedQuest,
  getPersistedGallery,
  addCharacterToGallery,
  setPersistedGallery,
  resetSession,
  addCompletedQuest,
} from '@/lib/persistence';
import {
  LOCAL_STORAGE_KEY,
  MAX_PERSISTED_CHARACTERS,
  PERSISTENCE_SCHEMA_VERSION,
} from '@/lib/constants';
import type {
  PersistedSession,
  QuestProgress,
  GalleryEntry,
  CompletedQuest,
  Quest,
} from '@/lib/types';

// ─── Mock localStorage ───────────────────────────────────────────────────────

let mockStorage: Record<string, string> = {};
let localStorageAvailable = true;

const mockLocalStorage = {
  getItem: jest.fn((key: string) => {
    if (!localStorageAvailable) throw new Error('Storage unavailable');
    return mockStorage[key] ?? null;
  }),
  setItem: jest.fn((key: string, value: string) => {
    if (!localStorageAvailable) throw new Error('Storage unavailable');
    mockStorage[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    if (!localStorageAvailable) throw new Error('Storage unavailable');
    delete mockStorage[key];
  }),
  clear: jest.fn(() => {
    mockStorage = {};
  }),
  get length() {
    return Object.keys(mockStorage).length;
  },
  key: jest.fn((index: number) => Object.keys(mockStorage)[index] ?? null),
};

beforeEach(() => {
  mockStorage = {};
  localStorageAvailable = true;
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
  jest.clearAllMocks();
});

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockQuest(): Quest {
  return {
    id: 'quest-1',
    title: 'Test Quest',
    lesson: 'sharing',
    genre: 'fantasy_kingdom',
    character_name: 'Sparkle',
    character_description: 'A cheerful pink bunny',
    scenes: [],
    total_scenes: 8,
    created_at: '2026-06-15T10:00:00Z',
  };
}

function createMockQuestProgress(): QuestProgress {
  return {
    quest_id: 'quest-1',
    quest_data: createMockQuest(),
    current_scene: 3,
    coins_earned: 2,
    completed_scenes: [0, 1, 2],
    started_at: '2026-06-15T10:00:00Z',
  };
}

function createMockGalleryEntry(id: string): GalleryEntry {
  return {
    id,
    name: `Character ${id}`,
    generated_image_url: `https://cdn.example.com/characters/${id}.png`,
    original_drawing_url: `https://cdn.example.com/drawings/${id}.png`,
    created_at: new Date().toISOString(),
  };
}

function createValidSession(): PersistedSession {
  return {
    version: PERSISTENCE_SCHEMA_VERSION,
    character_gallery: [createMockGalleryEntry('char-1')],
    active_quest: createMockQuestProgress(),
    parent_pin: '1234',
    parent_stats: {
      quests_completed: 5,
      unique_lessons: ['sharing', 'kindness'],
      total_coins: 35,
      characters_created: 3,
      session_durations: [{ date: '2026-06-14', duration_minutes: 30 }],
    },
    recent_quests: [],
  };
}

// ─── Tests: Default Session ──────────────────────────────────────────────────

describe('getDefaultSession', () => {
  it('returns a session with the current schema version', () => {
    const session = getDefaultSession();
    expect(session.version).toBe(PERSISTENCE_SCHEMA_VERSION);
  });

  it('returns a session with empty gallery', () => {
    const session = getDefaultSession();
    expect(session.character_gallery).toEqual([]);
  });

  it('returns a session with no active quest', () => {
    const session = getDefaultSession();
    expect(session.active_quest).toBeNull();
  });

  it('returns a session with empty parent stats', () => {
    const session = getDefaultSession();
    expect(session.parent_stats.quests_completed).toBe(0);
    expect(session.parent_stats.total_coins).toBe(0);
  });
});

// ─── Tests: Local Storage Availability ───────────────────────────────────────

describe('isLocalStorageAvailable', () => {
  it('returns true when localStorage is functional', () => {
    expect(isLocalStorageAvailable()).toBe(true);
  });

  it('returns false when localStorage throws on setItem', () => {
    localStorageAvailable = false;
    expect(isLocalStorageAvailable()).toBe(false);
  });
});

// ─── Tests: Load Session ─────────────────────────────────────────────────────

describe('loadSession', () => {
  it('returns default session when no data is stored', () => {
    const session = loadSession();
    expect(session).toEqual(getDefaultSession());
  });

  it('returns stored session when valid data exists', () => {
    const validSession = createValidSession();
    mockStorage[LOCAL_STORAGE_KEY] = JSON.stringify(validSession);
    const session = loadSession();
    expect(session.active_quest?.quest_id).toBe('quest-1');
    expect(session.character_gallery.length).toBe(1);
  });

  it('returns default session when localStorage is unavailable (Req 19.4)', () => {
    localStorageAvailable = false;
    const session = loadSession();
    expect(session).toEqual(getDefaultSession());
  });

  it('discards corrupted JSON and returns default session (Req 19.5)', () => {
    mockStorage[LOCAL_STORAGE_KEY] = 'not valid json {{{';
    const session = loadSession();
    expect(session).toEqual(getDefaultSession());
    // Should have removed the corrupted data
    expect(mockStorage[LOCAL_STORAGE_KEY]).toBeUndefined();
  });

  it('discards non-object JSON and returns default session (Req 19.5)', () => {
    mockStorage[LOCAL_STORAGE_KEY] = '"just a string"';
    const session = loadSession();
    expect(session).toEqual(getDefaultSession());
  });

  it('discards null JSON and returns default session (Req 19.5)', () => {
    mockStorage[LOCAL_STORAGE_KEY] = 'null';
    const session = loadSession();
    expect(session).toEqual(getDefaultSession());
  });
});

// ─── Tests: Save Session ─────────────────────────────────────────────────────

describe('saveSession', () => {
  it('persists session data to localStorage', () => {
    const session = createValidSession();
    saveSession(session);
    const stored = JSON.parse(mockStorage[LOCAL_STORAGE_KEY]);
    expect(stored.version).toBe(PERSISTENCE_SCHEMA_VERSION);
    expect(stored.active_quest.quest_id).toBe('quest-1');
  });

  it('silently fails when localStorage is unavailable (Req 19.4)', () => {
    localStorageAvailable = false;
    const session = createValidSession();
    expect(() => saveSession(session)).not.toThrow();
  });
});

// ─── Tests: Quest State Persistence (Req 19.1) ──────────────────────────────

describe('Quest state persistence', () => {
  it('persists quest progress on state change', () => {
    const progress = createMockQuestProgress();
    persistQuestProgress(progress);
    const stored = JSON.parse(mockStorage[LOCAL_STORAGE_KEY]);
    expect(stored.active_quest.quest_id).toBe('quest-1');
    expect(stored.active_quest.current_scene).toBe(3);
    expect(stored.active_quest.coins_earned).toBe(2);
    expect(stored.active_quest.completed_scenes).toEqual([0, 1, 2]);
  });

  it('detects persisted incomplete quest on load (Req 19.2)', () => {
    const progress = createMockQuestProgress();
    persistQuestProgress(progress);
    const quest = getPersistedQuest();
    expect(quest).not.toBeNull();
    expect(quest?.quest_id).toBe('quest-1');
    expect(quest?.current_scene).toBe(3);
  });

  it('returns null when no quest is persisted', () => {
    const quest = getPersistedQuest();
    expect(quest).toBeNull();
  });

  it('clears persisted quest on discard', () => {
    persistQuestProgress(createMockQuestProgress());
    clearPersistedQuest();
    const quest = getPersistedQuest();
    expect(quest).toBeNull();
  });

  it('persists null to clear active quest', () => {
    persistQuestProgress(createMockQuestProgress());
    persistQuestProgress(null);
    expect(getPersistedQuest()).toBeNull();
  });
});

// ─── Tests: Character Gallery Persistence (Req 19.3) ─────────────────────────

describe('Character Gallery persistence', () => {
  it('persists a character entry', () => {
    const entry = createMockGalleryEntry('char-1');
    addCharacterToGallery(entry);
    const gallery = getPersistedGallery();
    expect(gallery.length).toBe(1);
    expect(gallery[0].id).toBe('char-1');
  });

  it('stores characters newest-first', () => {
    addCharacterToGallery(createMockGalleryEntry('char-1'));
    addCharacterToGallery(createMockGalleryEntry('char-2'));
    const gallery = getPersistedGallery();
    expect(gallery[0].id).toBe('char-2');
    expect(gallery[1].id).toBe('char-1');
  });

  it('enforces max 20 characters limit', () => {
    for (let i = 0; i < 25; i++) {
      addCharacterToGallery(createMockGalleryEntry(`char-${i}`));
    }
    const gallery = getPersistedGallery();
    expect(gallery.length).toBe(MAX_PERSISTED_CHARACTERS);
    // The newest character should be first
    expect(gallery[0].id).toBe('char-24');
  });

  it('removes oldest when limit exceeded', () => {
    for (let i = 0; i < MAX_PERSISTED_CHARACTERS + 1; i++) {
      addCharacterToGallery(createMockGalleryEntry(`char-${i}`));
    }
    const gallery = getPersistedGallery();
    // char-0 should have been removed (oldest)
    expect(gallery.find((c) => c.id === 'char-0')).toBeUndefined();
    // char-20 (latest) should be first
    expect(gallery[0].id).toBe(`char-${MAX_PERSISTED_CHARACTERS}`);
  });

  it('deduplicates by id when adding same character', () => {
    addCharacterToGallery(createMockGalleryEntry('char-1'));
    addCharacterToGallery(createMockGalleryEntry('char-1'));
    const gallery = getPersistedGallery();
    expect(gallery.length).toBe(1);
  });

  it('replaces entire gallery with setPersistedGallery', () => {
    addCharacterToGallery(createMockGalleryEntry('char-1'));
    const newGallery = [
      createMockGalleryEntry('char-a'),
      createMockGalleryEntry('char-b'),
    ];
    setPersistedGallery(newGallery);
    const gallery = getPersistedGallery();
    expect(gallery.length).toBe(2);
    expect(gallery[0].id).toBe('char-a');
  });

  it('setPersistedGallery enforces max limit', () => {
    const entries: GalleryEntry[] = [];
    for (let i = 0; i < 30; i++) {
      entries.push(createMockGalleryEntry(`char-${i}`));
    }
    setPersistedGallery(entries);
    const gallery = getPersistedGallery();
    expect(gallery.length).toBe(MAX_PERSISTED_CHARACTERS);
  });
});

// ─── Tests: Schema Migration ─────────────────────────────────────────────────

describe('Schema migration', () => {
  it('migrates version 0 (no version) data to current version', () => {
    const oldData = {
      character_gallery: [createMockGalleryEntry('char-1')],
      active_quest: createMockQuestProgress(),
      parent_pin: '1234',
      parent_stats: {
        quests_completed: 2,
        unique_lessons: ['sharing'],
        total_coins: 10,
        characters_created: 1,
        session_durations: [],
      },
      recent_quests: [],
    };
    const migrated = migrateSession(oldData as Record<string, unknown>);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(PERSISTENCE_SCHEMA_VERSION);
    expect(migrated!.character_gallery.length).toBe(1);
  });

  it('returns null for data from a future version', () => {
    const futureData = {
      version: 999,
      character_gallery: [],
      active_quest: null,
      parent_pin: '',
      parent_stats: {
        quests_completed: 0,
        unique_lessons: [],
        total_coins: 0,
        characters_created: 0,
        session_durations: [],
      },
      recent_quests: [],
    };
    const migrated = migrateSession(futureData as Record<string, unknown>);
    expect(migrated).toBeNull();
  });

  it('validates current version data correctly', () => {
    const validSession = createValidSession();
    const result = validateSession(
      validSession as unknown as Record<string, unknown>
    );
    expect(result).not.toBeNull();
    expect(result!.version).toBe(PERSISTENCE_SCHEMA_VERSION);
  });

  it('returns null for invalid session structure', () => {
    const invalidData = {
      version: PERSISTENCE_SCHEMA_VERSION,
      character_gallery: 'not an array',
      active_quest: null,
      parent_pin: '',
      parent_stats: {},
      recent_quests: [],
    };
    const result = validateSession(invalidData as Record<string, unknown>);
    expect(result).toBeNull();
  });
});

// ─── Tests: Corrupted Data Recovery (Req 19.5) ──────────────────────────────

describe('Corrupted data recovery', () => {
  it('recovers from invalid JSON string', () => {
    mockStorage[LOCAL_STORAGE_KEY] = '{broken: json!!!';
    const session = loadSession();
    expect(session).toEqual(getDefaultSession());
  });

  it('recovers from an array instead of object', () => {
    mockStorage[LOCAL_STORAGE_KEY] = '[1, 2, 3]';
    const session = loadSession();
    expect(session).toEqual(getDefaultSession());
  });

  it('recovers from missing required fields', () => {
    mockStorage[LOCAL_STORAGE_KEY] = JSON.stringify({
      version: PERSISTENCE_SCHEMA_VERSION,
      // Missing all other fields
    });
    const session = loadSession();
    expect(session).toEqual(getDefaultSession());
  });

  it('removes corrupted data from storage', () => {
    mockStorage[LOCAL_STORAGE_KEY] = 'corrupted!!!';
    loadSession();
    expect(mockStorage[LOCAL_STORAGE_KEY]).toBeUndefined();
  });
});

// ─── Tests: Unavailable Storage (Req 19.4) ──────────────────────────────────

describe('Unavailable local storage', () => {
  it('starts fresh silently when storage is unavailable', () => {
    localStorageAvailable = false;
    const session = loadSession();
    expect(session).toEqual(getDefaultSession());
  });

  it('does not throw errors when saving with unavailable storage', () => {
    localStorageAvailable = false;
    expect(() => persistQuestProgress(createMockQuestProgress())).not.toThrow();
    expect(() => addCharacterToGallery(createMockGalleryEntry('x'))).not.toThrow();
  });

  it('no error messages or broken UI when storage unavailable', () => {
    localStorageAvailable = false;
    // All operations should silently succeed with defaults
    expect(getPersistedQuest()).toBeNull();
    expect(getPersistedGallery()).toEqual([]);
  });
});

// ─── Tests: Completed Quest / Recent Quests ──────────────────────────────────

describe('addCompletedQuest', () => {
  it('adds a completed quest and clears active quest', () => {
    persistQuestProgress(createMockQuestProgress());
    const completedQuest: CompletedQuest = {
      quest_id: 'quest-1',
      lesson: 'sharing',
      genre: 'fantasy_kingdom',
      character_name: 'Sparkle',
      character_thumbnail: 'https://cdn.example.com/thumb.png',
      completed_at: '2026-06-15T11:00:00Z',
      coins_earned: 8,
    };
    addCompletedQuest(completedQuest);
    expect(getPersistedQuest()).toBeNull();
    const stored = JSON.parse(mockStorage[LOCAL_STORAGE_KEY]);
    expect(stored.recent_quests.length).toBe(1);
    expect(stored.recent_quests[0].quest_id).toBe('quest-1');
  });
});

// ─── Tests: Reset Session ────────────────────────────────────────────────────

describe('resetSession', () => {
  it('resets all data to default state', () => {
    persistQuestProgress(createMockQuestProgress());
    addCharacterToGallery(createMockGalleryEntry('char-1'));
    resetSession();
    const session = loadSession();
    expect(session).toEqual(getDefaultSession());
  });
});
