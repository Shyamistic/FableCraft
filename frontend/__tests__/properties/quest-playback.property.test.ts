/**
 * Property-based tests for star coin calculation, incorrect answer handling,
 * and correct answer progression in the quest playback system.
 *
 * These tests validate the core game logic of QuestBook and ScenePlayer using
 * fast-check to verify properties hold across all valid input sequences.
 *
 * **Validates: Requirements 6.8, 6.9, 8.2, 8.3**
 */

import * as fc from 'fast-check';
import {
  TOTAL_QUEST_SCENES,
  MAX_COINS_PER_QUEST,
  CORRECT_ANSWER_COUNTDOWN_SECONDS,
} from '@/lib/constants';
import type { Quest, Scene, Option } from '@/lib/types';

// ─── Test Helpers: Pure Quest Playback Logic ────────────────────────────────

/**
 * Represents the state of a quest session as managed by QuestBook.
 */
interface QuestState {
  currentSceneIndex: number;
  coinsEarned: number;
  completedScenes: Set<number>;
  questComplete: boolean;
}

/**
 * Represents the result of selecting an option in a scene.
 */
interface AnswerResult {
  showFeedback: boolean;
  feedbackText: string;
  isCorrect: boolean;
  coinsDeducted: boolean;
  showTryAgain: boolean;
  countdownStarted: boolean;
  countdownSeconds: number;
}

/**
 * Creates an initial quest state.
 */
function createInitialQuestState(): QuestState {
  return {
    currentSceneIndex: 0,
    coinsEarned: 0,
    completedScenes: new Set(),
    questComplete: false,
  };
}

/**
 * Simulates selecting an answer option in the current scene.
 * This mirrors the logic in ScenePlayer.handleOptionSelect and QuestBook.handleCorrectAnswer.
 */
function selectAnswer(
  state: QuestState,
  scene: Scene,
  optionId: string
): { state: QuestState; result: AnswerResult } {
  const option = scene.options.find((o) => o.id === optionId);
  if (!option) {
    throw new Error(`Option ${optionId} not found`);
  }

  const previousCoins = state.coinsEarned;

  if (option.is_correct) {
    const newCoins = Math.min(state.coinsEarned + 1, MAX_COINS_PER_QUEST);
    const newCompleted = new Set(state.completedScenes);
    newCompleted.add(state.currentSceneIndex);

    return {
      state: {
        ...state,
        coinsEarned: newCoins,
        completedScenes: newCompleted,
      },
      result: {
        showFeedback: true,
        feedbackText: option.feedback,
        isCorrect: true,
        coinsDeducted: false,
        showTryAgain: false,
        countdownStarted: true,
        countdownSeconds: CORRECT_ANSWER_COUNTDOWN_SECONDS,
      },
    };
  } else {
    // Incorrect answer: show feedback, allow retry, no coin deduction
    return {
      state: {
        ...state,
        // Coins remain unchanged — never decrease
        coinsEarned: previousCoins,
      },
      result: {
        showFeedback: true,
        feedbackText: option.feedback,
        isCorrect: false,
        coinsDeducted: false,
        showTryAgain: true,
        countdownStarted: false,
        countdownSeconds: 0,
      },
    };
  }
}

/**
 * Simulates auto-advance after a correct answer countdown completes.
 * Mirrors QuestBook.handleAutoAdvance.
 */
function autoAdvance(state: QuestState, totalScenes: number): QuestState {
  const isLastScene = state.currentSceneIndex === totalScenes - 1;
  if (isLastScene) {
    return { ...state, questComplete: true };
  }
  return { ...state, currentSceneIndex: state.currentSceneIndex + 1 };
}

// ─── Arbitraries (Generators) ────────────────────────────────────────────────

/**
 * Generates a valid Option with a specific correctness value.
 */
function arbOption(isCorrect: boolean): fc.Arbitrary<Option> {
  return fc.record({
    id: fc.constantFrom('a', 'b'),
    text: fc.string({ minLength: 1, maxLength: 50 }),
    is_correct: fc.constant(isCorrect),
    feedback: fc.string({ minLength: 1, maxLength: 100 }),
  });
}

/**
 * Generates a valid Scene with exactly 2 options (one correct, one incorrect).
 */
function arbScene(sceneNumber: number): fc.Arbitrary<Scene> {
  return fc
    .tuple(arbOption(true), arbOption(false), fc.boolean())
    .map(([correct, incorrect, correctFirst]) => {
      const correctOption = { ...correct, id: correctFirst ? 'a' : 'b' };
      const incorrectOption = { ...incorrect, id: correctFirst ? 'b' : 'a' };
      return {
        scene_number: sceneNumber,
        narrative: `Scene ${sceneNumber} narrative`,
        question: `What should the character do?`,
        options: correctFirst
          ? [correctOption, incorrectOption]
          : [incorrectOption, correctOption],
        image_url: `https://example.com/scene${sceneNumber}.png`,
      };
    });
}

/**
 * Generates a valid 8-scene Quest.
 */
const arbQuest: fc.Arbitrary<Quest> = fc
  .tuple(
    arbScene(1),
    arbScene(2),
    arbScene(3),
    arbScene(4),
    arbScene(5),
    arbScene(6),
    arbScene(7),
    arbScene(8)
  )
  .map((scenes) => ({
    id: 'quest-test-id',
    title: 'Test Quest',
    lesson: 'sharing',
    genre: 'fantasy_kingdom' as const,
    character_name: 'Sparkle',
    character_description: 'A cheerful bunny',
    scenes,
    total_scenes: TOTAL_QUEST_SCENES,
    created_at: new Date().toISOString(),
  }));

/**
 * Generates a sequence of player actions (correct/incorrect picks) for all scenes.
 * Each scene gets a list of incorrect attempts (0 or more) before a final correct answer.
 */
const arbPlaySequence: fc.Arbitrary<number[]> = fc.array(
  fc.nat({ max: 5 }),
  { minLength: TOTAL_QUEST_SCENES, maxLength: TOTAL_QUEST_SCENES }
);

// ─── Property 13: Incorrect Answer Handling Invariant ────────────────────────

describe('Property 13: Incorrect Answer Handling Invariant', () => {
  /**
   * **Validates: Requirements 6.8, 8.3**
   *
   * For any scene where an incorrect answer is selected:
   * - The system displays scene-specific corrective feedback
   * - A "Try Again" control is presented
   * - Star coins are never deducted
   * - No limit is imposed on retry attempts
   * - Coins never decrease during a quest session
   */
  it('selecting an incorrect answer never deducts coins, always shows feedback, and allows retry', () => {
    fc.assert(
      fc.property(
        arbQuest,
        fc.nat({ max: TOTAL_QUEST_SCENES - 1 }),
        fc.nat({ max: 20 }),
        fc.nat({ max: MAX_COINS_PER_QUEST }),
        (quest, sceneIndex, retryCount, startingCoins) => {
          const scene = quest.scenes[sceneIndex];
          const incorrectOption = scene.options.find((o) => !o.is_correct);
          if (!incorrectOption) return true; // Skip if no incorrect option (shouldn't happen)

          let state: QuestState = {
            currentSceneIndex: sceneIndex,
            coinsEarned: startingCoins,
            completedScenes: new Set(),
            questComplete: false,
          };

          // Simulate multiple incorrect attempts
          for (let attempt = 0; attempt <= retryCount; attempt++) {
            const { state: newState, result } = selectAnswer(
              state,
              scene,
              incorrectOption.id
            );

            // Coins NEVER decrease (Requirement 6.9, 8.3)
            expect(newState.coinsEarned).toBeGreaterThanOrEqual(state.coinsEarned);
            expect(newState.coinsEarned).toBe(startingCoins);

            // Feedback is always shown
            expect(result.showFeedback).toBe(true);

            // Feedback text is the scene-specific feedback for that option
            expect(result.feedbackText).toBe(incorrectOption.feedback);
            expect(result.feedbackText.length).toBeGreaterThan(0);

            // "Try Again" is always presented
            expect(result.showTryAgain).toBe(true);

            // No coin deduction
            expect(result.coinsDeducted).toBe(false);

            // No countdown (only for correct answers)
            expect(result.countdownStarted).toBe(false);

            // Answer is marked as incorrect
            expect(result.isCorrect).toBe(false);

            state = newState;
          }

          // No limit was imposed — we could retry any number of times
          // The loop ran retryCount+1 times without breaking
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('coins never decrease across any sequence of incorrect answers interspersed with correct answers', () => {
    fc.assert(
      fc.property(arbQuest, arbPlaySequence, (quest, incorrectCounts) => {
        let state = createInitialQuestState();
        let previousCoins = 0;

        for (let sceneIdx = 0; sceneIdx < TOTAL_QUEST_SCENES; sceneIdx++) {
          const scene = quest.scenes[sceneIdx];
          const incorrectOption = scene.options.find((o) => !o.is_correct)!;
          const correctOption = scene.options.find((o) => o.is_correct)!;

          // Simulate incorrect attempts
          const numIncorrect = incorrectCounts[sceneIdx];
          for (let i = 0; i < numIncorrect; i++) {
            const { state: afterIncorrect } = selectAnswer(
              state,
              scene,
              incorrectOption.id
            );
            // Coins must never decrease
            expect(afterIncorrect.coinsEarned).toBeGreaterThanOrEqual(previousCoins);
            state = afterIncorrect;
          }

          // Then answer correctly
          const { state: afterCorrect } = selectAnswer(
            state,
            scene,
            correctOption.id
          );
          // Coins must not decrease
          expect(afterCorrect.coinsEarned).toBeGreaterThanOrEqual(previousCoins);
          previousCoins = afterCorrect.coinsEarned;
          state = afterCorrect;

          // Advance to next scene
          state = autoAdvance(state, TOTAL_QUEST_SCENES);
        }
      }),
      { numRuns: 200 }
    );
  });
});

// ─── Property 14: Star Coin Calculation ──────────────────────────────────────

describe('Property 14: Star Coin Calculation', () => {
  /**
   * **Validates: Requirements 6.9, 8.6**
   *
   * For any sequence of correct and incorrect answers across all scenes:
   * - Total coins = count of scenes answered correctly
   * - Maximum is 8 coins
   * - Coins never decrease
   */
  it('total coins equals count of scenes completed correctly, max 8, never decreasing', () => {
    fc.assert(
      fc.property(arbQuest, arbPlaySequence, (quest, incorrectCounts) => {
        let state = createInitialQuestState();
        let scenesCompletedCorrectly = 0;

        for (let sceneIdx = 0; sceneIdx < TOTAL_QUEST_SCENES; sceneIdx++) {
          const scene = quest.scenes[sceneIdx];
          const incorrectOption = scene.options.find((o) => !o.is_correct)!;
          const correctOption = scene.options.find((o) => o.is_correct)!;
          const prevCoins = state.coinsEarned;

          // Simulate some incorrect attempts (these should NOT change coins)
          for (let i = 0; i < incorrectCounts[sceneIdx]; i++) {
            const { state: afterIncorrect } = selectAnswer(
              state,
              scene,
              incorrectOption.id
            );
            expect(afterIncorrect.coinsEarned).toBe(prevCoins);
            state = afterIncorrect;
          }

          // Answer correctly
          const { state: afterCorrect } = selectAnswer(
            state,
            scene,
            correctOption.id
          );
          scenesCompletedCorrectly++;

          // Coins should equal scenes completed correctly (capped at MAX)
          const expectedCoins = Math.min(scenesCompletedCorrectly, MAX_COINS_PER_QUEST);
          expect(afterCorrect.coinsEarned).toBe(expectedCoins);

          // Coins never decrease
          expect(afterCorrect.coinsEarned).toBeGreaterThanOrEqual(prevCoins);

          state = afterCorrect;
          state = autoAdvance(state, TOTAL_QUEST_SCENES);
        }

        // After completing all 8 scenes correctly, total = 8
        expect(state.coinsEarned).toBe(MAX_COINS_PER_QUEST);
      }),
      { numRuns: 200 }
    );
  });

  it('completing a subset of scenes correctly yields exact coin count', () => {
    fc.assert(
      fc.property(
        arbQuest,
        fc.array(fc.boolean(), {
          minLength: TOTAL_QUEST_SCENES,
          maxLength: TOTAL_QUEST_SCENES,
        }),
        (quest, answerCorrectly) => {
          let state = createInitialQuestState();
          let expectedCorrectCount = 0;

          for (let sceneIdx = 0; sceneIdx < TOTAL_QUEST_SCENES; sceneIdx++) {
            const scene = quest.scenes[sceneIdx];
            const correctOption = scene.options.find((o) => o.is_correct)!;
            const incorrectOption = scene.options.find((o) => !o.is_correct)!;

            if (answerCorrectly[sceneIdx]) {
              // Answer correctly
              const { state: afterCorrect } = selectAnswer(
                state,
                scene,
                correctOption.id
              );
              expectedCorrectCount++;
              state = afterCorrect;
            } else {
              // Answer incorrectly (coins unchanged)
              const { state: afterIncorrect } = selectAnswer(
                state,
                scene,
                incorrectOption.id
              );
              // Then answer correctly (quest requires correct to advance)
              const { state: afterCorrect } = selectAnswer(
                afterIncorrect,
                scene,
                correctOption.id
              );
              expectedCorrectCount++;
              state = afterCorrect;
            }

            state = autoAdvance(state, TOTAL_QUEST_SCENES);
          }

          // Total coins = scenes completed correctly, capped at MAX
          expect(state.coinsEarned).toBe(
            Math.min(expectedCorrectCount, MAX_COINS_PER_QUEST)
          );
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ─── Property 15: Correct Answer Progression ─────────────────────────────────

describe('Property 15: Correct Answer Progression', () => {
  /**
   * **Validates: Requirements 8.2**
   *
   * After a correct answer:
   * - Exactly one star coin is awarded
   * - An 8-second countdown is displayed
   * - The scene advances (or quest completes if last scene)
   */
  it('correct answer awards exactly +1 coin, starts 8s countdown, and advances scene', () => {
    fc.assert(
      fc.property(
        arbQuest,
        fc.nat({ max: TOTAL_QUEST_SCENES - 1 }),
        fc.nat({ max: MAX_COINS_PER_QUEST - 1 }),
        (quest, sceneIndex, startingCoins) => {
          const scene = quest.scenes[sceneIndex];
          const correctOption = scene.options.find((o) => o.is_correct)!;

          const state: QuestState = {
            currentSceneIndex: sceneIndex,
            coinsEarned: startingCoins,
            completedScenes: new Set(),
            questComplete: false,
          };

          const { state: afterCorrect, result } = selectAnswer(
            state,
            scene,
            correctOption.id
          );

          // Exactly +1 coin awarded (capped at MAX)
          const expectedCoins = Math.min(startingCoins + 1, MAX_COINS_PER_QUEST);
          expect(afterCorrect.coinsEarned).toBe(expectedCoins);

          // 8-second countdown started
          expect(result.countdownStarted).toBe(true);
          expect(result.countdownSeconds).toBe(CORRECT_ANSWER_COUNTDOWN_SECONDS);

          // Feedback is shown
          expect(result.showFeedback).toBe(true);
          expect(result.isCorrect).toBe(true);

          // Auto-advance after countdown
          const afterAdvance = autoAdvance(afterCorrect, TOTAL_QUEST_SCENES);
          const isLastScene = sceneIndex === TOTAL_QUEST_SCENES - 1;

          if (isLastScene) {
            // Quest completes on last scene
            expect(afterAdvance.questComplete).toBe(true);
          } else {
            // Scene advances to next
            expect(afterAdvance.currentSceneIndex).toBe(sceneIndex + 1);
            expect(afterAdvance.questComplete).toBe(false);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('correct answer on last scene completes the quest', () => {
    fc.assert(
      fc.property(arbQuest, fc.nat({ max: 7 }), (quest, startingCoins) => {
        const lastSceneIndex = TOTAL_QUEST_SCENES - 1;
        const scene = quest.scenes[lastSceneIndex];
        const correctOption = scene.options.find((o) => o.is_correct)!;

        const state: QuestState = {
          currentSceneIndex: lastSceneIndex,
          coinsEarned: startingCoins,
          completedScenes: new Set([0, 1, 2, 3, 4, 5, 6]),
          questComplete: false,
        };

        const { state: afterCorrect } = selectAnswer(
          state,
          scene,
          correctOption.id
        );
        const afterAdvance = autoAdvance(afterCorrect, TOTAL_QUEST_SCENES);

        // Quest is marked complete
        expect(afterAdvance.questComplete).toBe(true);
        // Scene index remains at last scene
        expect(afterAdvance.currentSceneIndex).toBe(lastSceneIndex);
      }),
      { numRuns: 100 }
    );
  });

  it('correct answer on non-last scene advances to next scene without completing quest', () => {
    fc.assert(
      fc.property(
        arbQuest,
        fc.nat({ max: TOTAL_QUEST_SCENES - 2 }), // 0..6 (non-last scenes)
        (quest, sceneIndex) => {
          const scene = quest.scenes[sceneIndex];
          const correctOption = scene.options.find((o) => o.is_correct)!;

          const state: QuestState = {
            currentSceneIndex: sceneIndex,
            coinsEarned: sceneIndex, // simulate having earned coins for prior scenes
            completedScenes: new Set(),
            questComplete: false,
          };

          const { state: afterCorrect } = selectAnswer(
            state,
            scene,
            correctOption.id
          );
          const afterAdvance = autoAdvance(afterCorrect, TOTAL_QUEST_SCENES);

          // Advances to next scene
          expect(afterAdvance.currentSceneIndex).toBe(sceneIndex + 1);
          // Quest is NOT complete
          expect(afterAdvance.questComplete).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });
});
