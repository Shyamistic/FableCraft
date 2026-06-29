/**
 * Property 16: Completed Scene Immutability
 *
 * For any previously completed scene that a Child_User navigates back to,
 * the answer options SHALL be displayed in a disabled state and the previously
 * earned completion status SHALL be preserved unchanged.
 *
 * **Validates: Requirements 8.8**
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import * as fc from 'fast-check'
import ScenePlayer from '@/components/ScenePlayer'
import type { Scene, Option } from '@/lib/types'

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a valid Option with a unique id and non-empty text/feedback. */
const arbOption = (id: string, isCorrect: boolean): fc.Arbitrary<Option> =>
  fc.record({
    id: fc.constant(id),
    text: fc.string({ minLength: 1, maxLength: 50 }).map((s) => s.trim() || 'option'),
    is_correct: fc.constant(isCorrect),
    feedback: fc.string({ minLength: 1, maxLength: 100 }).map((s) => s.trim() || 'feedback'),
  })

/** Generate a valid Scene with exactly 2 options (one correct, one incorrect). */
const arbScene: fc.Arbitrary<Scene> = fc
  .tuple(
    fc.integer({ min: 1, max: 8 }),
    fc.string({ minLength: 1, maxLength: 200 }).map((s) => s.trim() || 'narrative'),
    fc.string({ minLength: 1, maxLength: 100 }).map((s) => s.trim() || 'question'),
    arbOption('a', true),
    arbOption('b', false),
    fc.boolean(),
  )
  .map(([scene_number, narrative, question, correctOpt, incorrectOpt, shuffleOrder]) => ({
    scene_number,
    narrative,
    question,
    options: shuffleOrder ? [incorrectOpt, correctOpt] : [correctOpt, incorrectOpt],
    image_url: '',
  }))

// ─── Property Test ───────────────────────────────────────────────────────────

describe('Property 16: Completed Scene Immutability', () => {
  it('options are disabled when isCompleted is true for any scene', () => {
    fc.assert(
      fc.property(arbScene, (scene) => {
        const onCorrectAnswer = jest.fn()
        const onAutoAdvance = jest.fn()

        const { unmount } = render(
          <ScenePlayer
            scene={scene}
            isCompleted={true}
            onCorrectAnswer={onCorrectAnswer}
            onAutoAdvance={onAutoAdvance}
            isLastScene={false}
          />
        )

        // All option buttons must be disabled
        const buttons = screen.getAllByRole('button', { name: /^Option /i })
        for (const button of buttons) {
          expect(button).toBeDisabled()
        }

        unmount()
      }),
      { numRuns: 50 }
    )
  })

  it('clicking disabled options on a completed scene never triggers onCorrectAnswer', () => {
    fc.assert(
      fc.property(arbScene, (scene) => {
        const onCorrectAnswer = jest.fn()
        const onAutoAdvance = jest.fn()

        const { unmount } = render(
          <ScenePlayer
            scene={scene}
            isCompleted={true}
            onCorrectAnswer={onCorrectAnswer}
            onAutoAdvance={onAutoAdvance}
            isLastScene={false}
          />
        )

        // Attempt to click every option button
        const buttons = screen.getAllByRole('button', { name: /^Option /i })
        for (const button of buttons) {
          fireEvent.click(button)
        }

        // onCorrectAnswer must never be called (no coin changes)
        expect(onCorrectAnswer).not.toHaveBeenCalled()

        unmount()
      }),
      { numRuns: 50 }
    )
  })

  it('completed scene never shows the feedback overlay after option clicks', () => {
    fc.assert(
      fc.property(arbScene, (scene) => {
        const onCorrectAnswer = jest.fn()
        const onAutoAdvance = jest.fn()

        const { unmount } = render(
          <ScenePlayer
            scene={scene}
            isCompleted={true}
            onCorrectAnswer={onCorrectAnswer}
            onAutoAdvance={onAutoAdvance}
            isLastScene={false}
          />
        )

        // Attempt to click every option button
        const buttons = screen.getAllByRole('button', { name: /^Option /i })
        for (const button of buttons) {
          fireEvent.click(button)
        }

        // Feedback overlay (role="alert") should NOT appear
        const feedbackOverlay = screen.queryByRole('alert')
        expect(feedbackOverlay).not.toBeInTheDocument()

        unmount()
      }),
      { numRuns: 50 }
    )
  })

  it('isLastScene variation does not affect immutability of completed scenes', () => {
    fc.assert(
      fc.property(arbScene, fc.boolean(), (scene, isLastScene) => {
        const onCorrectAnswer = jest.fn()
        const onAutoAdvance = jest.fn()

        const { unmount } = render(
          <ScenePlayer
            scene={scene}
            isCompleted={true}
            onCorrectAnswer={onCorrectAnswer}
            onAutoAdvance={onAutoAdvance}
            isLastScene={isLastScene}
          />
        )

        // Options must be disabled regardless of isLastScene
        const buttons = screen.getAllByRole('button', { name: /^Option /i })
        for (const button of buttons) {
          expect(button).toBeDisabled()
        }

        // Clicking must not trigger callbacks
        for (const button of buttons) {
          fireEvent.click(button)
        }
        expect(onCorrectAnswer).not.toHaveBeenCalled()
        expect(onAutoAdvance).not.toHaveBeenCalled()

        // No feedback overlay
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()

        unmount()
      }),
      { numRuns: 50 }
    )
  })
})
