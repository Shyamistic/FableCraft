import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import ScenePlayer, { ScenePlayerProps } from './ScenePlayer'
import type { Scene } from '@/lib/types'
import { CORRECT_ANSWER_COUNTDOWN_SECONDS, MIN_TAP_TARGET_PX } from '@/lib/constants'

// Mock Audio
const mockPlay = jest.fn().mockResolvedValue(undefined)
const mockPause = jest.fn()
let mockAudioInstance: { play: jest.Mock; pause: jest.Mock; onended: (() => void) | null; onerror: (() => void) | null }

global.Audio = jest.fn().mockImplementation(() => {
  mockAudioInstance = {
    play: mockPlay,
    pause: mockPause,
    onended: null,
    onerror: null,
  }
  return mockAudioInstance
}) as unknown as typeof Audio

// Mock fetch for TTS
global.fetch = jest.fn()

// Silence console.error for cleaner test output
beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  ;(global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ audio_url: 'https://cdn.example.com/audio/test.mp3', duration_seconds: 3.5 }),
  })
})

afterEach(() => {
  jest.useRealTimers()
})

const mockScene: Scene = {
  scene_number: 1,
  narrative: 'Sparkle found a basket of golden apples in the meadow.',
  question: 'What should Sparkle do with the apples?',
  options: [
    {
      id: 'a',
      text: 'Share the apples with the forest friends',
      is_correct: true,
      feedback: "Wonderful! Sparkle's friends are so happy!",
    },
    {
      id: 'b',
      text: 'Hide all the apples and keep them',
      is_correct: false,
      feedback: "Hmm, Sparkle's friends look sad. Let's try again!",
    },
  ],
  image_url: 'https://example.com/scene1.png',
}

const defaultProps: ScenePlayerProps = {
  scene: mockScene,
  isCompleted: false,
  onCorrectAnswer: jest.fn(),
  onAutoAdvance: jest.fn(),
  isLastScene: false,
}

describe('ScenePlayer', () => {
  // Helper to get the answer option buttons (not the TTS icons)
  const getOptionButton = (optionLabel: RegExp) => {
    return screen.getByRole('button', { name: optionLabel })
  }

  describe('Rendering (Requirement 8.1)', () => {
    it('displays the scene illustration', () => {
      render(<ScenePlayer {...defaultProps} />)
      const img = screen.getByAltText('Scene 1 illustration')
      expect(img).toBeInTheDocument()
      expect(img).toHaveAttribute('src', 'https://example.com/scene1.png')
    })

    it('displays the narrative text', () => {
      render(<ScenePlayer {...defaultProps} />)
      expect(
        screen.getByText(
          'Sparkle found a basket of golden apples in the meadow.'
        )
      ).toBeInTheDocument()
    })

    it('displays the question', () => {
      render(<ScenePlayer {...defaultProps} />)
      expect(
        screen.getByText('What should Sparkle do with the apples?')
      ).toBeInTheDocument()
    })

    it('displays exactly 2 answer buttons', () => {
      render(<ScenePlayer {...defaultProps} />)
      const group = screen.getByRole('group', { name: /answer options/i })
      const buttons = group.querySelectorAll('button')
      expect(buttons).toHaveLength(2)
    })

    it('answer buttons have minimum 44x44px tap target size', () => {
      render(<ScenePlayer {...defaultProps} />)
      const buttons = screen
        .getByRole('group', { name: /answer options/i })
        .querySelectorAll('button')
      buttons.forEach((btn) => {
        expect(btn).toHaveStyle({
          minWidth: `${MIN_TAP_TARGET_PX}px`,
          minHeight: `${MIN_TAP_TARGET_PX}px`,
        })
      })
    })

    it('shows placeholder when image_url is empty', () => {
      const noImageScene: Scene = { ...mockScene, image_url: '' }
      render(<ScenePlayer {...defaultProps} scene={noImageScene} />)
      expect(screen.getByText('Generating illustration...')).toBeInTheDocument()
    })
  })

  describe('Correct Answer (Requirement 8.2)', () => {
    it('calls onCorrectAnswer when correct option is selected', () => {
      const onCorrectAnswer = jest.fn()
      render(
        <ScenePlayer {...defaultProps} onCorrectAnswer={onCorrectAnswer} />
      )
      const optionA = getOptionButton(/^Option A:/)
      fireEvent.click(optionA)
      expect(onCorrectAnswer).toHaveBeenCalledTimes(1)
    })

    it('shows feedback with countdown after correct answer', () => {
      render(<ScenePlayer {...defaultProps} />)
      const optionA = getOptionButton(/^Option A:/)
      fireEvent.click(optionA)
      expect(
        screen.getByText("Wonderful! Sparkle's friends are so happy!")
      ).toBeInTheDocument()
      expect(
        screen.getByLabelText(
          `Auto-advancing in ${CORRECT_ANSWER_COUNTDOWN_SECONDS} seconds`
        )
      ).toBeInTheDocument()
    })

    it('countdown decreases every second', () => {
      render(<ScenePlayer {...defaultProps} />)
      fireEvent.click(getOptionButton(/^Option A:/))

      expect(
        screen.getByLabelText(
          `Auto-advancing in ${CORRECT_ANSWER_COUNTDOWN_SECONDS} seconds`
        )
      ).toBeInTheDocument()

      act(() => {
        jest.advanceTimersByTime(1000)
      })

      expect(
        screen.getByLabelText(
          `Auto-advancing in ${CORRECT_ANSWER_COUNTDOWN_SECONDS - 1} seconds`
        )
      ).toBeInTheDocument()
    })

    it('calls onAutoAdvance after countdown completes', () => {
      const onAutoAdvance = jest.fn()
      render(<ScenePlayer {...defaultProps} onAutoAdvance={onAutoAdvance} />)
      fireEvent.click(getOptionButton(/^Option A:/))

      act(() => {
        jest.advanceTimersByTime(CORRECT_ANSWER_COUNTDOWN_SECONDS * 1000)
      })

      expect(onAutoAdvance).toHaveBeenCalledTimes(1)
    })
  })

  describe('Incorrect Answer (Requirements 8.3, 6.8)', () => {
    it('displays feedback text when incorrect answer is selected', () => {
      render(<ScenePlayer {...defaultProps} />)
      fireEvent.click(getOptionButton(/^Option B:/))
      expect(
        screen.getByText("Hmm, Sparkle's friends look sad. Let's try again!")
      ).toBeInTheDocument()
    })

    it('does not call onCorrectAnswer when incorrect answer is selected', () => {
      const onCorrectAnswer = jest.fn()
      render(
        <ScenePlayer {...defaultProps} onCorrectAnswer={onCorrectAnswer} />
      )
      fireEvent.click(getOptionButton(/^Option B:/))
      expect(onCorrectAnswer).not.toHaveBeenCalled()
    })

    it('shows Try Again button on incorrect answer', () => {
      render(<ScenePlayer {...defaultProps} />)
      fireEvent.click(getOptionButton(/^Option B:/))
      expect(screen.getByLabelText('Try again')).toBeInTheDocument()
    })

    it('allows unlimited retry attempts (no coin deduction)', () => {
      const onCorrectAnswer = jest.fn()
      render(
        <ScenePlayer {...defaultProps} onCorrectAnswer={onCorrectAnswer} />
      )

      // First incorrect attempt
      fireEvent.click(getOptionButton(/^Option B:/))
      expect(onCorrectAnswer).not.toHaveBeenCalled()

      // Try again
      fireEvent.click(screen.getByLabelText('Try again'))

      // Second incorrect attempt
      fireEvent.click(getOptionButton(/^Option B:/))
      expect(onCorrectAnswer).not.toHaveBeenCalled()

      // Try again
      fireEvent.click(screen.getByLabelText('Try again'))

      // Third attempt — correct this time
      fireEvent.click(getOptionButton(/^Option A:/))
      expect(onCorrectAnswer).toHaveBeenCalledTimes(1)
    })
  })

  describe('Try Again (Requirement 8.4)', () => {
    it('dismisses feedback and re-enables both option buttons', () => {
      render(<ScenePlayer {...defaultProps} />)

      // Select incorrect answer
      fireEvent.click(getOptionButton(/^Option B:/))
      expect(
        screen.getByText("Hmm, Sparkle's friends look sad. Let's try again!")
      ).toBeInTheDocument()

      // Click Try Again
      fireEvent.click(screen.getByLabelText('Try again'))

      // Feedback should be gone, buttons should be back
      expect(
        screen.queryByText("Hmm, Sparkle's friends look sad. Let's try again!")
      ).not.toBeInTheDocument()
      expect(getOptionButton(/^Option A:/)).not.toBeDisabled()
      expect(getOptionButton(/^Option B:/)).not.toBeDisabled()
    })
  })

  describe('Completed Scene (Requirement 8.8)', () => {
    it('disables answer buttons when scene is already completed', () => {
      render(<ScenePlayer {...defaultProps} isCompleted={true} />)
      const buttons = screen
        .getByRole('group', { name: /answer options/i })
        .querySelectorAll('button')
      buttons.forEach((btn) => {
        expect(btn).toBeDisabled()
      })
    })

    it('shows a completion badge when scene is completed', () => {
      render(<ScenePlayer {...defaultProps} isCompleted={true} />)
      expect(screen.getByText('Scene Completed')).toBeInTheDocument()
    })

    it('highlights the correct answer option when scene is completed', () => {
      render(<ScenePlayer {...defaultProps} isCompleted={true} />)
      const correctButton = getOptionButton(/^Option A:.*\(correct answer\)/)
      expect(correctButton).toBeInTheDocument()
      expect(correctButton).toHaveClass('border-green-400')
      expect(correctButton).toHaveClass('bg-green-50')
    })

    it('dims the incorrect answer option when scene is completed', () => {
      render(<ScenePlayer {...defaultProps} isCompleted={true} />)
      const incorrectButton = getOptionButton(/^Option B: Hide all the apples/)
      expect(incorrectButton).toHaveClass('border-gray-300')
      expect(incorrectButton).toHaveClass('bg-gray-100')
      expect(incorrectButton).toHaveClass('opacity-50')
    })

    it('shows a checkmark on the correct option when scene is completed', () => {
      render(<ScenePlayer {...defaultProps} isCompleted={true} />)
      const correctButton = getOptionButton(/^Option A:.*\(correct answer\)/)
      expect(correctButton.textContent).toContain('✅')
    })

    it('does not trigger onCorrectAnswer when clicking a disabled option', () => {
      const onCorrectAnswer = jest.fn()
      render(
        <ScenePlayer {...defaultProps} isCompleted={true} onCorrectAnswer={onCorrectAnswer} />
      )
      const correctButton = getOptionButton(/^Option A:.*\(correct answer\)/)
      fireEvent.click(correctButton)
      expect(onCorrectAnswer).not.toHaveBeenCalled()
    })

    it('preserves completion status without showing feedback overlay', () => {
      render(<ScenePlayer {...defaultProps} isCompleted={true} />)
      // Should show options (in disabled state), not the feedback overlay
      expect(screen.getByRole('group', { name: /answer options/i })).toBeInTheDocument()
      // Should not have Try Again button
      expect(screen.queryByLabelText('Try again')).not.toBeInTheDocument()
    })
  })

  describe('TTS Playback Controls (Requirements 9.2, 9.4, 9.5, 9.6, 9.8)', () => {
    it('renders speaker icons for narrative, question, and options', () => {
      render(<ScenePlayer {...defaultProps} />)
      expect(screen.getByTestId('tts-narrative')).toBeInTheDocument()
      expect(screen.getByTestId('tts-question')).toBeInTheDocument()
      expect(screen.getByTestId('tts-option-a')).toBeInTheDocument()
      expect(screen.getByTestId('tts-option-b')).toBeInTheDocument()
    })

    it('calls TTS API when narrative speaker icon is tapped (Req 9.2)', async () => {
      render(<ScenePlayer {...defaultProps} />)
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-narrative'))
      })
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/tts/synthesize',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: mockScene.narrative, session_id: 'current' }),
        })
      )
    })

    it('calls TTS API when question speaker icon is tapped', async () => {
      render(<ScenePlayer {...defaultProps} />)
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-question'))
      })
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/tts/synthesize',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: mockScene.question, session_id: 'current' }),
        })
      )
    })

    it('calls TTS API when option speaker icon is tapped', async () => {
      render(<ScenePlayer {...defaultProps} />)
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-option-a'))
      })
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/tts/synthesize',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: mockScene.options[0].text, session_id: 'current' }),
        })
      )
    })

    it('stops audio when same speaker icon is tapped while playing (Req 9.5)', async () => {
      render(<ScenePlayer {...defaultProps} />)

      // Start playing
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-narrative'))
      })

      // Tap again to stop
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-narrative'))
      })

      expect(mockPause).toHaveBeenCalled()
    })

    it('stops current audio and plays new when different speaker icon tapped (Req 9.6)', async () => {
      render(<ScenePlayer {...defaultProps} />)

      // Start playing narrative
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-narrative'))
      })

      // Tap question speaker - should stop current and play new
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-question'))
      })

      expect(mockPause).toHaveBeenCalled()
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('shows TTS error message on fetch failure (Req 9.8)', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      render(<ScenePlayer {...defaultProps} />)
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-narrative'))
      })

      expect(screen.getByTestId('tts-error')).toBeInTheDocument()
      expect(
        screen.getByText("The read-aloud button isn't working right now, but you can keep reading!")
      ).toBeInTheDocument()
    })

    it('shows TTS error message on non-OK response (Req 9.8)', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      render(<ScenePlayer {...defaultProps} />)
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-narrative'))
      })

      expect(screen.getByTestId('tts-error')).toBeInTheDocument()
    })

    it('allows quest continuation after TTS failure (Req 9.8)', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))
      const onCorrectAnswer = jest.fn()

      render(<ScenePlayer {...defaultProps} onCorrectAnswer={onCorrectAnswer} />)

      // TTS fails
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-narrative'))
      })

      // But answer options still work
      fireEvent.click(getOptionButton(/^Option A:/))
      expect(onCorrectAnswer).toHaveBeenCalledTimes(1)
    })

    it('option speaker icons have minimum 44x44px tap target', () => {
      render(<ScenePlayer {...defaultProps} />)
      const optionTts = screen.getByTestId('tts-option-a')
      expect(optionTts).toHaveStyle({
        minWidth: `${MIN_TAP_TARGET_PX}px`,
        minHeight: `${MIN_TAP_TARGET_PX}px`,
      })
    })

    it('clears TTS error on successful subsequent playback', async () => {
      ;(global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ audio_url: 'https://cdn.example.com/audio/test.mp3', duration_seconds: 3.5 }),
        })

      render(<ScenePlayer {...defaultProps} />)

      // First attempt fails
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-narrative'))
      })
      expect(screen.getByTestId('tts-error')).toBeInTheDocument()

      // Second attempt succeeds
      await act(async () => {
        fireEvent.click(screen.getByTestId('tts-question'))
      })
      expect(screen.queryByTestId('tts-error')).not.toBeInTheDocument()
    })
  })
})
