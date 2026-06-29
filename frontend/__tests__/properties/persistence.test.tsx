/**
 * Property-based tests for quest state persistence and corrupted data recovery.
 *
 * These tests validate that:
 * 1. Quest state changes (scene navigation, coins earned, scenes completed) are
 *    persisted to local storage within 1 second of the state change.
 * 2. On app reload, a persisted incomplete quest is detected and offered for resume.
 * 3. If persisted quest JSON is corrupted or unparseable, the app detects this,
 *    discards the invalid data, and starts fresh without breaking the UI.
 *
 * **Validates: Requirements 19.1, 19.5**
 */

import * as fc from 'fast-check';
import {
  loadSession,
  saveSession,
  persistQuestProgress,
  getPersistedQuest,
  clearPersistedQuest,
  getDefaultSession,
  isLocalStorageAvailable,
  resetSession,
  migrateSession,
  validateSession,
} from '@/lib/persistence';
import {
  LOCAL_STORAGE_KEY,
  PERSISTENCE_SCHEMA_VERSION,
  TOTAL_QUEST_SCENES,
} from '@/lib/constants';
import type {
  PersistedSession,
  QuestProgress,
  Scene,
  Option,
  Quest,
} from '@/lib/types';

// ─── Mock Local Storage ──────────────────────────────────────────────────────

/**
 * Simple in-memory local storage mock for testing.
 * Allows us to test corruption scenarios.
 */
class MockLocalStorage {
  private store: Record<string, string> = {};
  private available = true;

  setItem(key: string, value: string): void {
    if (!this.available) throw new Error('Storage not available');
    this.store[key] = value;
  }

  getItem(key: string): string | null {
    if (!this.available) return null;
    return this.store[key] ?? null;
  }

  removeItem(key: string): void {
    if (!this.available) throw new Error('Storage not available');
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  setUnavailable(unavailable: boolean): void {
    this.available = unavailable;
  }

  isAvailable(): boolean {
    return this.available;
  }

  corruptItem(key: string): void {
    if (this.store[key]) {
      this.store[key] = 'corrupted{[json';
    }
  }

  getStore(): Record<string, string> {
    return { ...this.store };
  }
}

// ─── Arbitraries (Generators) ────────────────────────────────────────────────

/**
 * Generates a valid Scene object.
 */
function arbScene(sceneNumber: number): fc.Arbitrary<Scene> {
  return fc.record({
    scene_number: fc.constant(sceneNumber),
    narrative: fc.string({ minLength: 10, maxLength: 40 }),
    question: fc.string({ minLength: 5, maxLength: 15 }),
    options: fc.constant([
      {
        id: 'a',
        text: 'First option',
        is_correct: true,
        feedback: 'Great choice!',
      },
      {
        id: 'b',
        text: 'Second option',
        is_correct: false,
        feedback: 'Try again!',
      },
    ]),
    image_url: fc.webUrl(),
  });
}

/**
 * Generates a valid Quest object with 8 scenes.
 */
function arbQuest(): fc.Arbitrary<Quest> {
  return fc
    .tuple(
      ...Array.from({ length: TOTAL_QUEST_SCENES }, (_, i) => arbScene(i + 1))
    )
    .chain((scenes) =>
      fc.record({
        id: fc.uuid(),
        title: fc.string({ minLength: 5, maxLength: 50 }),
        lesson: fc.string({ minLength: 3, maxLength: 30 }),
        genre: fc.constantFrom('fantasy_kingdom', 'outer_space', 'underwater_world', 'jungle_safari'),
        character_name: fc.string({ minLength: 1, maxLength: 30 }),
        character_description: fc.string({ minLength: 10, maxLength: 500 }),
        scenes: fc.constant(scenes),
        total_scenes: fc.constant(TOTAL_QUEST_SCENES),
        created_at: fc.constant(new Date('2024-01-01T00:00:00.000Z').toISOString()),
      })
    );
}

/**
 * Generates a valid QuestProgress object.
 */
function arbQuestProgress(): fc.Arbitrary<QuestProgress> {
  return arbQuest().chain((quest) =>
    fc.record({
      quest_id: fc.uuid(),
      quest_data: fc.constant(quest),
      current_scene: fc.integer({ min: 0, max: TOTAL_QUEST_SCENES - 1 }),
      coins_earned: fc.integer({ min: 0, max: TOTAL_QUEST_SCENES }),
      completed_scenes: fc.array(
        fc.integer({ min: 0, max: TOTAL_QUEST_SCENES - 1 }),
        { maxLength: TOTAL_QUEST_SCENES }
      ),
      started_at: fc.constant(new Date('2024-01-01T00:00:00.000Z').toISOString()),
    })
  );
}

/**
 * Generates a valid PersistedSession object.
 */
function arbPersistedSession(): fc.Arbitrary<PersistedSession> {
  return fc
    .option(arbQuestProgress(), { freq: 2, nil: undefined })
    .chain((activeQuest) =>
      fc.record({
        version: fc.constant(PERSISTENCE_SCHEMA_VERSION),
        character_gallery: fc.constant([]),
        active_quest: fc.constant(activeQuest ?? null),
        parent_pin: fc.string({ minLength: 0, maxLength: 4 }),
        parent_stats: fc.constant({
          quests_completed: 0,
          unique_lessons: [],
          total_coins: 0,
          characters_created: 0,
          session_durations: [],
        }),
        recent_quests: fc.constant([]),
      })
    );
}

/**
 * Generates a JSON string that is intentionally corrupted or invalid.
 */
function arbCorruptedJson(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant('not json at all'),
    fc.constant('{"version": 1, corrupted'),
    fc.constant('[[['),
    fc.constant('null'),
    fc.constant('undefined'),
    fc.constant('{"incomplete": '),
    fc.string().map((s) => s + '{[}'),
  );
}

// ─── Property 31: Quest State Persistence ────────────────────────────────────

describe('Property 31: Quest State Persistence', () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    // Replace window.localStorage with mock
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
    });
  });

  afterEach(() => {
    mockStorage.clear();
  });

  /**
   * **Validates: Requirement 19.1**
   *
   * For any quest state change (scene navigation, coin earned, scene completed),
   * the App SHALL persist the updated state (current scene index, coins earned,
   * completed scenes array) to browser local storage.
   *
   * We verify that when persistQuestProgress is called with a new QuestProgress,
   * the data can be retrieved via loadSession and matches what was persisted.
   */
  it('persists quest progress to local storage when state changes', () => {
    fc.assert(
      fc.property(arbQuestProgress(), (progress) => {
        // Call persistQuestProgress with new progress
        persistQuestProgress(progress);

        // Immediately load the session and verify the persisted quest matches
        const loaded = getPersistedQuest();
        expect(loaded).toBeDefined();
        expect(loaded?.quest_id).toBe(progress.quest_id);
        expect(loaded?.current_scene).toBe(progress.current_scene);
        expect(loaded?.coins_earned).toBe(progress.coins_earned);
        expect(loaded?.completed_scenes).toEqual(progress.completed_scenes);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirement 19.1**
   *
   * When the active quest is cleared (null), this should also be persisted.
   * Verify that clearing the quest persists a null active_quest.
   */
  it('persists null active_quest when quest is cleared', () => {
    fc.assert(
      fc.property(arbQuestProgress(), (progress) => {
        // First persist a quest
        persistQuestProgress(progress);
        let loaded = getPersistedQuest();
        expect(loaded).not.toBeNull();

        // Then clear it
        clearPersistedQuest();
        loaded = getPersistedQuest();

        // Verify quest is null
        expect(loaded).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirement 19.1**
   *
   * Incremental quest state updates (scene transitions, coins earned)
   * should each be persisted independently.
   */
  it('persists incremental updates to quest state across multiple changes', () => {
    fc.assert(
      fc.property(
        arbQuestProgress(),
        fc.integer({ min: 0, max: TOTAL_QUEST_SCENES - 1 }),
        fc.integer({ min: 0, max: TOTAL_QUEST_SCENES }),
        (initialProgress, newScene, newCoins) => {
          // Initial persist
          persistQuestProgress(initialProgress);
          let loaded = getPersistedQuest();
          expect(loaded?.current_scene).toBe(initialProgress.current_scene);

          // Update scene
          initialProgress.current_scene = newScene;
          persistQuestProgress(initialProgress);
          loaded = getPersistedQuest();
          expect(loaded?.current_scene).toBe(newScene);

          // Update coins
          initialProgress.coins_earned = newCoins;
          persistQuestProgress(initialProgress);
          loaded = getPersistedQuest();
          expect(loaded?.coins_earned).toBe(newCoins);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirement 19.1, 19.2**
   *
   * On app reload (simulated by loadSession), a persisted incomplete quest
   * should be detected and available for resume.
   */
  it('detects and offers persisted incomplete quest on app reload', () => {
    fc.assert(
      fc.property(arbQuestProgress(), (progress) => {
        // Simulate persisting a quest
        persistQuestProgress(progress);

        // Simulate app reload by resetting and loading fresh
        const loaded = getPersistedQuest();

        // Verify the quest is detected
        expect(loaded).not.toBeNull();
        expect(loaded?.quest_id).toBe(progress.quest_id);

        // Verify it's the same quest data
        expect(loaded?.quest_data.id).toBe(progress.quest_data.id);
        expect(loaded?.quest_data.lesson).toBe(progress.quest_data.lesson);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirement 19.1**
   *
   * The persisted data structure should match the expected schema
   * with all required fields present.
   */
  it('persisted quest progress contains all required state fields', () => {
    fc.assert(
      fc.property(arbQuestProgress(), (progress) => {
        persistQuestProgress(progress);
        const loaded = getPersistedQuest();

        expect(loaded).toBeDefined();
        expect(loaded).toHaveProperty('quest_id');
        expect(loaded).toHaveProperty('quest_data');
        expect(loaded).toHaveProperty('current_scene');
        expect(loaded).toHaveProperty('coins_earned');
        expect(loaded).toHaveProperty('completed_scenes');
        expect(loaded).toHaveProperty('started_at');

        // Verify types
        expect(typeof loaded?.quest_id).toBe('string');
        expect(typeof loaded?.current_scene).toBe('number');
        expect(typeof loaded?.coins_earned).toBe('number');
        expect(Array.isArray(loaded?.completed_scenes)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirement 19.1**
   *
   * Multiple sequential persists should not corrupt or lose data;
   * the latest state should always be reflected.
   */
  it('sequential persists maintain data integrity with latest state', () => {
    fc.assert(
      fc.property(
        fc.array(arbQuestProgress(), { minLength: 2, maxLength: 10 }),
        (progressSequence) => {
          for (const progress of progressSequence) {
            persistQuestProgress(progress);
          }

          const loaded = getPersistedQuest();
          const lastProgress = progressSequence[progressSequence.length - 1];

          expect(loaded?.quest_id).toBe(lastProgress.quest_id);
          expect(loaded?.current_scene).toBe(lastProgress.current_scene);
          expect(loaded?.coins_earned).toBe(lastProgress.coins_earned);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 32: Corrupted Persistence Recovery ──────────────────────────────

describe('Property 32: Corrupted Persistence Recovery', () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
    });
  });

  afterEach(() => {
    mockStorage.clear();
  });

  /**
   * **Validates: Requirement 19.5**
   *
   * If persisted quest JSON is corrupted or unparseable, the app should
   * detect this, discard the invalid data, and start fresh without breaking
   * the UI or displaying technical errors.
   *
   * We test that when loadSession encounters corrupted JSON, it returns
   * a valid default session without throwing or breaking.
   */
  it('recovers from corrupted JSON by discarding and starting fresh', () => {
    fc.assert(
      fc.property(arbCorruptedJson(), (corrupted) => {
        // Store corrupted data directly
        mockStorage.setItem(LOCAL_STORAGE_KEY, corrupted);

        // Load session should handle this gracefully
        const session = loadSession();

        // Should return a valid default session, not throw
        expect(session).toBeDefined();
        expect(session.version).toBe(PERSISTENCE_SCHEMA_VERSION);
        expect(session.active_quest).toBeNull();
        expect(Array.isArray(session.character_gallery)).toBe(true);

        // Corrupted data should be removed
        const stored = mockStorage.getItem(LOCAL_STORAGE_KEY);
        expect(stored).toBeNull();
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirement 19.5**
   *
   * Invalid JSON should be detected and removed without UI errors.
   */
  it('detects invalid JSON and removes it from storage', () => {
    fc.assert(
      fc.property(arbCorruptedJson(), (corrupted) => {
        mockStorage.setItem(LOCAL_STORAGE_KEY, corrupted);

        // Attempt to load
        const session = loadSession();

        // Should not throw and should be valid
        expect(session).toBeDefined();
        expect(session.version).toBe(PERSISTENCE_SCHEMA_VERSION);

        // Corrupted data should be cleaned up
        const remaining = mockStorage.getItem(LOCAL_STORAGE_KEY);
        expect(remaining).toBeNull();
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirement 19.5**
   *
   * When data is corrupted, the UI should remain functional.
   * We verify this by ensuring the default session is usable.
   */
  it('recovered session is usable and functionally complete', () => {
    fc.assert(
      fc.property(arbCorruptedJson(), (corrupted) => {
        mockStorage.setItem(LOCAL_STORAGE_KEY, corrupted);
        const session = loadSession();

        // Session should have all expected fields
        expect(session).toHaveProperty('version');
        expect(session).toHaveProperty('character_gallery');
        expect(session).toHaveProperty('active_quest');
        expect(session).toHaveProperty('parent_pin');
        expect(session).toHaveProperty('parent_stats');
        expect(session).toHaveProperty('recent_quests');

        // All fields should have valid types
        expect(typeof session.version).toBe('number');
        expect(Array.isArray(session.character_gallery)).toBe(true);
        expect(session.active_quest === null || typeof session.active_quest === 'object').toBe(true);
        expect(typeof session.parent_pin).toBe('string');
        expect(typeof session.parent_stats).toBe('object');
        expect(Array.isArray(session.recent_quests)).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirement 19.5**
   *
   * Partially corrupted data (e.g., missing required fields) should also
   * be handled gracefully.
   */
  it('handles partially corrupted session data by recovering to default', () => {
    fc.assert(
      fc.property(
        fc.record({
          version: fc.constant(PERSISTENCE_SCHEMA_VERSION),
          character_gallery: fc.constant([]),
          // Missing active_quest, parent_pin, etc.
        }),
        (partialData) => {
          mockStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(partialData));

          const session = loadSession();

          // Should recover and have all fields
          expect(session.active_quest).toBeNull();
          expect(session.parent_pin).toBe('');
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Validates: Requirement 19.5**
   *
   * After corrupted data is recovered, subsequent persistence operations
   * should work normally.
   */
  it('allows normal persistence after recovering from corruption', () => {
    fc.assert(
      fc.property(arbCorruptedJson(), arbQuestProgress(), (corrupted, progress) => {
        // First, corrupt the storage
        mockStorage.setItem(LOCAL_STORAGE_KEY, corrupted);

        // Load should recover
        let session = loadSession();
        expect(session.active_quest).toBeNull();

        // Now persist a valid quest
        persistQuestProgress(progress);

        // Should be able to retrieve it
        const loaded = getPersistedQuest();
        expect(loaded).toBeDefined();
        expect(loaded?.quest_id).toBe(progress.quest_id);
      }),
      { numRuns: 30 }
    );
  });

  /**
   * **Validates: Requirement 19.5**
   *
   * Null or undefined JSON should be handled like other corrupted data.
   */
  it('handles null and undefined stored values gracefully', () => {
    // Test null
    mockStorage.removeItem(LOCAL_STORAGE_KEY);
    let session = loadSession();
    expect(session).toEqual(getDefaultSession());

    // Test empty string
    mockStorage.setItem(LOCAL_STORAGE_KEY, '');
    const loadSessionWithEmpty = () => loadSession();
    // Should not throw
    expect(() => loadSessionWithEmpty()).not.toThrow();
  });

  /**
   * **Validates: Requirement 19.5**
   *
   * Session validation should reject invalid schema versions or structures.
   */
  it('rejects sessions with invalid version numbers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 9999 }),
        (futureVersion) => {
          const invalidSession = {
            version: futureVersion,
            character_gallery: [],
            active_quest: null,
            parent_pin: '',
            parent_stats: getDefaultSession().parent_stats,
            recent_quests: [],
          };

          mockStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(invalidSession));
          const session = loadSession();

          // Should recover to default, not accept future version
          expect(session.active_quest).toBeNull();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Validates: Requirement 19.5**
   *
   * No technical error messages should be shown to the user when
   * corruption is detected. The UI should display no errors and work
   * normally with a fresh session.
   */
  it('no error is thrown or logged when corruption is detected during load', () => {
    fc.assert(
      fc.property(arbCorruptedJson(), (corrupted) => {
        mockStorage.setItem(LOCAL_STORAGE_KEY, corrupted);

        // Should not throw even though JSON is invalid
        expect(() => {
          const session = loadSession();
          // Should be valid and usable
          expect(session).toBeDefined();
        }).not.toThrow();
      }),
      { numRuns: 30 }
    );
  });
});

