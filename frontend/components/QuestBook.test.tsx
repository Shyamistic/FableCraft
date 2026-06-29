import { render, screen, fireEvent, act, within } from '@testing-library/react'
import QuestBook, { QuestBookProps } from './QuestBook'
import type { Quest } from '@/lib/types'
import { MAX_COINS_PER_QUEST, CORRECT_ANSWER_COUNTDOWN_SECONDS } from '@/lib/constants'

// Mock fetch for TTS
global.fetch = jest.fn()

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
})

afterEach(() => {
  jest.useRealTimers()
})

/**
 * Helper to select an option button by its aria-label, avoiding
 * matching the nested TTS speaker span that also contains "Option A/B".
 */
function getOptionButton(label: RegExp): HTMLElement {
  const group = screen.getByRole('group', { name: /answer options/i })
  return within(group).getAllByLabelText(label).find(
    (el) => el.tagName === 'BUTTON'
  ) as HTMLElement
}

function createMockQuest(numScenes = 8): Quest {
  const scenes = Array.from({ length: numScenes }, (_, i) => ({
    scene_number: i + 1,
    narrative: `Scene ${i + 1} narrative text.`,
    question: `Question for scene ${i + 1}?`,
    options: [
      {
        id: 'a',
        text: `Correct option for scene ${i + 1}`,
        is_correct: true,
        feedback: `Great job on scene ${i + 1}!`,
      },
      {
        id: 'b',
        text: `Incorrect option for scene ${i + 1}`,
        is_correct: false,
        feedback: `Try again on scene ${i + 1}!`,
      },
    ],
    image_url: `https://example.com/scene${i + 1}.png`,
  }))

  return {
    id: 'quest-123',
    title: "Sparkle's Sharing Adventure",
    lesson: 'sharing',
    genre: 'fantasy_kingdom',
    character_name: 'Sparkle',
    character_description: 'A cheerful pink bunny',
    scenes,
    total_scenes: numScenes,
    created_at: '2026-06-15T10:00:00Z',
  }
}

const defaultProps: QuestBookProps = {
  quest: createMockQuest(),
  onQuestComplete: jest.fn(),
}

describe('QuestBook', () => {
  describe('Rendering', () => {
    it('displays the quest title', () => {
      render(<QuestBook {...defaultProps} />)
      expect(
        screen.getByText("Sparkle's Sharing Adventure")
      ).toBeInTheDocument()
    })

    it('displays scene 1 initially', () => {
      render(<QuestBook {...defaultProps} />)
      expect(screen.getByText('Scene 1 narrative text.')).toBeInTheDocument()
      expect(screen.getByText('Question for scene 1?')).toBeInTheDocument()
    })

    it('shows scene counter text', () => {
      render(<QuestBook {...defaultProps} />)
      expect(screen.getByText('Scene 1 of 8')).toBeInTheDocument()
    })
  })

  describe('Star Coin Counter (Requirement 8.6)', () => {
    it('shows coin counter starting at 0', () => {
      render(<QuestBook {...defaultProps} />)
      expect(screen.getByText(`0 / ${MAX_COINS_PER_QUEST}`)).toBeInTheDocument()
    })

    it('coin counter increments on correct answer', () => {
      render(<QuestBook {...defaultProps} />)
      fireEvent.click(getOptionButton(/Option A/i))
      expect(screen.getByText(`1 / ${MAX_COINS_PER_QUEST}`)).toBeInTheDocument()
    })

    it('coins never decrease (Requirement 6.9) — incorrect answer does not deduct', () => {
      render(<QuestBook {...defaultProps} />)

      // Get correct answer first
      fireEvent.click(getOptionButton(/Option A/i))
      expect(screen.getByText(`1 / ${MAX_COINS_PER_QUEST}`)).toBeInTheDocument()

      // Advance to scene 2
      act(() => {
        jest.advanceTimersByTime(CORRECT_ANSWER_COUNTDOWN_SECONDS * 1000)
      })

      // Select incorrect in scene 2
      fireEvent.click(getOptionButton(/Option B/i))
      // Coins should still be 1
      expect(screen.getByText(`1 / ${MAX_COINS_PER_QUEST}`)).toBeInTheDocument()
    })
  })

  describe('Scene Navigation', () => {
    it('advances to next scene after correct answer countdown', () => {
      render(<QuestBook {...defaultProps} />)

      // Answer scene 1 correctly
      fireEvent.click(getOptionButton(/Option A/i))

      // Advance timer
      act(() => {
        jest.advanceTimersByTime(CORRECT_ANSWER_COUNTDOWN_SECONDS * 1000)
      })

      // Should now show scene 2
      expect(screen.getByText('Scene 2 narrative text.')).toBeInTheDocument()
      expect(screen.getByText('Scene 2 of 8')).toBeInTheDocument()
    })
  })

  describe('Progress Indicator (Requirement 8.5)', () => {
    it('renders progress dots for all scenes', () => {
      render(<QuestBook {...defaultProps} />)
      const nav = screen.getByRole('navigation', { name: /scene progress/i })
      const dots = nav.querySelectorAll('button')
      expect(dots).toHaveLength(8)
    })

    it('marks current scene as active', () => {
      render(<QuestBook {...defaultProps} />)
      const currentDot = screen.getByLabelText('Scene 1 (current)')
      expect(currentDot).toHaveAttribute('aria-current', 'step')
    })
  })

  describe('Quest Completion (Requirement 8.7, 6.9)', () => {
    it('shows quest complete overlay after last scene', () => {
      const onQuestComplete = jest.fn()
      const quest = createMockQuest(2) // 2 scenes for faster test
      render(
        <QuestBook quest={quest} onQuestComplete={onQuestComplete} />
      )

      // Answer scene 1
      fireEvent.click(getOptionButton(/Option A/i))
      act(() => {
        jest.advanceTimersByTime(CORRECT_ANSWER_COUNTDOWN_SECONDS * 1000)
      })

      // Answer scene 2 (last scene)
      fireEvent.click(getOptionButton(/Option A/i))
      act(() => {
        jest.advanceTimersByTime(CORRECT_ANSWER_COUNTDOWN_SECONDS * 1000)
      })

      // Quest complete overlay should appear
      expect(screen.getByText(/Quest Complete/i)).toBeInTheDocument()
      expect(screen.getByText('2 Stars Earned!')).toBeInTheDocument()
    })

    it('calls onQuestComplete with coins when "New Story Adventure" is clicked', () => {
      const onQuestComplete = jest.fn()
      const quest = createMockQuest(1) // 1 scene
      render(
        <QuestBook quest={quest} onQuestComplete={onQuestComplete} />
      )

      // Answer correctly
      fireEvent.click(getOptionButton(/Option A/i))
      act(() => {
        jest.advanceTimersByTime(CORRECT_ANSWER_COUNTDOWN_SECONDS * 1000)
      })

      // Click complete button
      fireEvent.click(screen.getByText('New Story Adventure!'))
      expect(onQuestComplete).toHaveBeenCalledWith(1)
    })
  })
})
