import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LessonSelector from './LessonSelector'
import { LESSONS, CUSTOM_LESSON_MIN_LENGTH, CUSTOM_LESSON_MAX_LENGTH } from '../lib/constants'

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('LessonSelector', () => {
  const mockOnLessonSelected = jest.fn()
  const testSessionId = 'test-session-123'

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockFetch.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('Rendering (Requirement 4.1)', () => {
    it('renders at least 12 predefined lesson cards', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      const cards = screen.getAllByRole('radio')
      expect(cards.length).toBeGreaterThanOrEqual(12)
    })

    it('renders emoji for each lesson card', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      for (const lesson of LESSONS) {
        expect(screen.getByText(lesson.emoji)).toBeInTheDocument()
      }
    })

    it('renders title and description for each lesson card', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      for (const lesson of LESSONS) {
        expect(screen.getByText(lesson.title)).toBeInTheDocument()
        expect(screen.getByText(lesson.description)).toBeInTheDocument()
      }
    })

    it('each lesson card has a minimum tap target of 48x48px', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      const cards = screen.getAllByRole('radio')
      for (const card of cards) {
        expect(card).toHaveStyle({ minWidth: '48px', minHeight: '48px' })
      }
    })

    it('renders a radiogroup with accessible label', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      expect(screen.getByRole('radiogroup', { name: /choose a life lesson/i })).toBeInTheDocument()
    })
  })

  describe('Selection and Proceed (Requirement 4.2)', () => {
    it('highlights the selected lesson card', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      const cards = screen.getAllByRole('radio')

      fireEvent.click(cards[0])
      expect(cards[0]).toHaveAttribute('aria-checked', 'true')
    })

    it('shows a checkmark on selected card', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      const cards = screen.getAllByRole('radio')

      expect(screen.queryByText('✓')).not.toBeInTheDocument()
      fireEvent.click(cards[0])
      expect(screen.getByText('✓')).toBeInTheDocument()
    })

    it('calls onLessonSelected within 2 seconds of predefined selection', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      const cards = screen.getAllByRole('radio')

      fireEvent.click(cards[0])
      expect(mockOnLessonSelected).not.toHaveBeenCalled()

      // Advance time to trigger the auto-proceed (1.5s)
      act(() => {
        jest.advanceTimersByTime(1500)
      })

      expect(mockOnLessonSelected).toHaveBeenCalledWith(LESSONS[0].id)
    })

    it('proceeds within 2000ms (requirement boundary)', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      const cards = screen.getAllByRole('radio')

      fireEvent.click(cards[2])

      // At 1999ms the callback should have been invoked (timer is 1500ms)
      act(() => {
        jest.advanceTimersByTime(2000)
      })

      expect(mockOnLessonSelected).toHaveBeenCalledWith(LESSONS[2].id)
    })

    it('cancels previous timer when selecting a different card', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      const cards = screen.getAllByRole('radio')

      fireEvent.click(cards[0])
      act(() => {
        jest.advanceTimersByTime(500)
      })

      fireEvent.click(cards[1])
      act(() => {
        jest.advanceTimersByTime(1500)
      })

      // Only the second selection should have fired
      expect(mockOnLessonSelected).toHaveBeenCalledTimes(1)
      expect(mockOnLessonSelected).toHaveBeenCalledWith(LESSONS[1].id)
    })

    it('no card is selected by default', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      const cards = screen.getAllByRole('radio')
      cards.forEach((card) => {
        expect(card).toHaveAttribute('aria-checked', 'false')
      })
    })
  })

  describe('Custom Lesson Input (Requirement 4.3)', () => {
    it('shows a toggle to reveal custom lesson input', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      expect(screen.getByText(/type your own lesson idea/i)).toBeInTheDocument()
    })

    it('reveals an input field when toggle is clicked', async () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      fireEvent.click(screen.getByText(/type your own lesson idea/i))
      expect(screen.getByLabelText(/type your own lesson idea/i)).toBeInTheDocument()
    })

    it('rejects custom lesson shorter than minimum length', async () => {
      jest.useRealTimers()
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      fireEvent.click(screen.getByText(/type your own lesson idea/i))

      const input = screen.getByLabelText(/type your own lesson idea/i)
      await userEvent.type(input, 'ab')

      // Submit button should be disabled when below min length
      const submitBtn = screen.getByLabelText(/submit custom lesson/i)
      expect(submitBtn).toBeDisabled()
    })

    it('shows character count', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      fireEvent.click(screen.getByText(/type your own lesson idea/i))
      expect(screen.getByText(`0/${CUSTOM_LESSON_MAX_LENGTH} characters`)).toBeInTheDocument()
    })
  })

  describe('Custom Lesson Validation (Requirement 4.4, 4.5)', () => {
    beforeEach(() => {
      jest.useRealTimers()
    })

    it('calls /api/lessons/validate with correct payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ is_appropriate: true, sanitized_lesson: 'learning to share' }),
      })

      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      fireEvent.click(screen.getByText(/type your own lesson idea/i))

      const input = screen.getByLabelText(/type your own lesson idea/i)
      await userEvent.type(input, 'learning to share')

      const submitBtn = screen.getByLabelText(/submit custom lesson/i)
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/lessons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            custom_lesson: 'learning to share',
            session_id: testSessionId,
          }),
        })
      })
    })

    it('proceeds with sanitized lesson on successful validation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          is_appropriate: true,
          sanitized_lesson: 'learning to share with friends',
        }),
      })

      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      fireEvent.click(screen.getByText(/type your own lesson idea/i))

      const input = screen.getByLabelText(/type your own lesson idea/i)
      await userEvent.type(input, 'learning to share with friends')

      const submitBtn = screen.getByLabelText(/submit custom lesson/i)
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(mockOnLessonSelected).toHaveBeenCalledWith('learning to share with friends')
      })
    })

    it('shows child-friendly message when lesson is not appropriate (Requirement 4.5)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ is_appropriate: false, sanitized_lesson: '' }),
      })

      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      fireEvent.click(screen.getByText(/type your own lesson idea/i))

      const input = screen.getByLabelText(/type your own lesson idea/i)
      await userEvent.type(input, 'something inappropriate')

      const submitBtn = screen.getByLabelText(/submit custom lesson/i)
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByText(/pick a different topic/i)).toBeInTheDocument()
      })

      // Should NOT proceed
      expect(mockOnLessonSelected).not.toHaveBeenCalled()
    })
  })

  describe('Validation Failure Handling (Requirement 4.6)', () => {
    beforeEach(() => {
      jest.useRealTimers()
    })

    it('shows retry message when API returns non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })

      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      fireEvent.click(screen.getByText(/type your own lesson idea/i))

      const input = screen.getByLabelText(/type your own lesson idea/i)
      await userEvent.type(input, 'a valid topic here')

      const submitBtn = screen.getByLabelText(/submit custom lesson/i)
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByText(/couldn't check your lesson idea/i)).toBeInTheDocument()
      })
    })

    it('shows retry message on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      fireEvent.click(screen.getByText(/type your own lesson idea/i))

      const input = screen.getByLabelText(/type your own lesson idea/i)
      await userEvent.type(input, 'a valid topic here')

      const submitBtn = screen.getByLabelText(/submit custom lesson/i)
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByText(/couldn't check your lesson idea/i)).toBeInTheDocument()
      })
    })

    it('predefined lessons remain accessible after validation failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ is_appropriate: false }),
      })

      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      fireEvent.click(screen.getByText(/type your own lesson idea/i))

      const input = screen.getByLabelText(/type your own lesson idea/i)
      await userEvent.type(input, 'bad topic')

      const submitBtn = screen.getByLabelText(/submit custom lesson/i)
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      // Predefined cards should still be visible and clickable
      const cards = screen.getAllByRole('radio')
      expect(cards.length).toBeGreaterThanOrEqual(12)
    })
  })

  describe('Accessibility', () => {
    it('each card has an aria-label with title and description', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      for (const lesson of LESSONS) {
        expect(
          screen.getByLabelText(`${lesson.title}: ${lesson.description}`),
        ).toBeInTheDocument()
      }
    })

    it('emojis are hidden from screen readers', () => {
      render(
        <LessonSelector onLessonSelected={mockOnLessonSelected} sessionId={testSessionId} />,
      )
      for (const lesson of LESSONS) {
        const emoji = screen.getByText(lesson.emoji)
        expect(emoji).toHaveAttribute('aria-hidden', 'true')
      }
    })
  })
})
