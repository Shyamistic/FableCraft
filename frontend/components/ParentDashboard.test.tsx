import { render, screen, fireEvent, act } from '@testing-library/react'
import ParentDashboard, {
  ParentDashboardTrigger,
  formatDuration,
} from './ParentDashboard'
import type { ParentStats, CompletedQuest } from '../lib/types'

// ─── Test Data ───────────────────────────────────────────────────────────────

const TEST_PIN = '1234'

const mockStats: ParentStats = {
  quests_completed: 12,
  unique_lessons: ['sharing', 'kindness', 'honesty'],
  total_coins: 85,
  characters_created: 5,
  session_durations: [
    { date: '2026-06-14', duration_minutes: 45 },
    { date: '2026-06-15', duration_minutes: 80 },
  ],
}

const mockRecentQuests: CompletedQuest[] = [
  {
    quest_id: 'q1',
    lesson: 'sharing',
    genre: 'fantasy_kingdom',
    character_name: 'Sparkle',
    character_thumbnail: 'https://example.com/sparkle.png',
    completed_at: '2026-06-15T15:00:00Z',
    coins_earned: 8,
  },
  {
    quest_id: 'q2',
    lesson: 'kindness',
    genre: 'outer_space',
    character_name: 'Rocket',
    character_thumbnail: 'https://example.com/rocket.png',
    completed_at: '2026-06-14T10:00:00Z',
    coins_earned: 7,
  },
]

const defaultProps = {
  pin: TEST_PIN,
  stats: mockStats,
  recentQuests: mockRecentQuests,
  onClose: jest.fn(),
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function enterPin(pinValue: string) {
  const input = screen.getByLabelText(/enter your 4-digit pin/i)
  fireEvent.change(input, { target: { value: pinValue } })
  fireEvent.submit(input.closest('form')!)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ParentDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('PIN Entry (Requirement 11.3)', () => {
    it('renders PIN entry screen initially', () => {
      render(<ParentDashboard {...defaultProps} />)
      expect(screen.getByLabelText(/enter your 4-digit pin/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument()
    })

    it('accepts only numeric input up to 4 digits', () => {
      render(<ParentDashboard {...defaultProps} />)
      const input = screen.getByLabelText(/enter your 4-digit pin/i)
      fireEvent.change(input, { target: { value: 'abc12345' } })
      expect(input).toHaveValue('1234')
    })

    it('shows dashboard content on correct PIN', () => {
      render(<ParentDashboard {...defaultProps} />)
      enterPin(TEST_PIN)
      expect(screen.getByText('Quests Completed')).toBeInTheDocument()
    })

    it('shows error on incorrect PIN', () => {
      render(<ParentDashboard {...defaultProps} />)
      enterPin('9999')
      expect(screen.getByRole('alert')).toHaveTextContent(/incorrect pin/i)
    })

    it('clears PIN input after incorrect attempt', () => {
      render(<ParentDashboard {...defaultProps} />)
      enterPin('9999')
      const input = screen.getByLabelText(/enter your 4-digit pin/i)
      expect(input).toHaveValue('')
    })

    it('disables submit when PIN is fewer than 4 digits', () => {
      render(<ParentDashboard {...defaultProps} />)
      const input = screen.getByLabelText(/enter your 4-digit pin/i)
      fireEvent.change(input, { target: { value: '12' } })
      expect(screen.getByRole('button', { name: /unlock/i })).toBeDisabled()
    })
  })

  describe('Lockout (Requirement 11.4)', () => {
    it('locks out after 5 consecutive incorrect attempts', () => {
      render(<ParentDashboard {...defaultProps} />)
      for (let i = 0; i < 5; i++) {
        enterPin('0000')
      }
      expect(screen.getByRole('alert')).toHaveTextContent(/too many tries/i)
      const input = screen.getByLabelText(/enter your 4-digit pin/i)
      expect(input).toBeDisabled()
    })

    it('shows countdown during lockout', () => {
      render(<ParentDashboard {...defaultProps} />)
      for (let i = 0; i < 5; i++) {
        enterPin('0000')
      }
      expect(screen.getByText(/60s remaining/i)).toBeInTheDocument()
    })

    it('re-enables input after lockout expires', () => {
      render(<ParentDashboard {...defaultProps} />)
      for (let i = 0; i < 5; i++) {
        enterPin('0000')
      }

      // Fast forward past lockout
      act(() => {
        jest.advanceTimersByTime(61000)
      })

      const input = screen.getByLabelText(/enter your 4-digit pin/i)
      expect(input).not.toBeDisabled()
    })

    it('rejects correct PIN during lockout', () => {
      render(<ParentDashboard {...defaultProps} />)
      for (let i = 0; i < 5; i++) {
        enterPin('0000')
      }

      // Try correct PIN during lockout
      enterPin(TEST_PIN)
      // Should still show lockout, not dashboard
      expect(screen.queryByText('Quests Completed')).not.toBeInTheDocument()
    })
  })

  describe('Stats Display (Requirements 11.1, 11.5)', () => {
    beforeEach(() => {
      render(<ParentDashboard {...defaultProps} />)
      enterPin(TEST_PIN)
    })

    it('displays quests completed count', () => {
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('Quests Completed')).toBeInTheDocument()
    })

    it('displays unique lessons count', () => {
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('Unique Lessons')).toBeInTheDocument()
    })

    it('displays total coins', () => {
      expect(screen.getByText('85')).toBeInTheDocument()
      expect(screen.getByText('Total Coins')).toBeInTheDocument()
    })

    it('displays characters created count', () => {
      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getByText('Characters Created')).toBeInTheDocument()
    })

    it('displays total time in hours and minutes format', () => {
      // 45 + 80 = 125 minutes → "2h 5m"
      expect(screen.getByText('2h 5m')).toBeInTheDocument()
      expect(screen.getByText('Time Spent')).toBeInTheDocument()
    })
  })

  describe('Recent Quests List (Requirement 11.2)', () => {
    beforeEach(() => {
      render(<ParentDashboard {...defaultProps} />)
      enterPin(TEST_PIN)
    })

    it('displays recent quests heading', () => {
      expect(screen.getByText('Recent Quests')).toBeInTheDocument()
    })

    it('displays quest lesson, genre, and character name', () => {
      expect(screen.getByText('sharing')).toBeInTheDocument()
      expect(screen.getByText(/Fantasy Kingdom · Sparkle/)).toBeInTheDocument()
      expect(screen.getByText('kindness')).toBeInTheDocument()
      expect(screen.getByText(/Outer Space · Rocket/)).toBeInTheDocument()
    })

    it('displays character thumbnails', () => {
      const images = screen.getAllByRole('img')
      expect(images[0]).toHaveAttribute('src', 'https://example.com/sparkle.png')
      expect(images[1]).toHaveAttribute('src', 'https://example.com/rocket.png')
    })

    it('shows empty state when no quests', () => {
      render(<ParentDashboard {...defaultProps} recentQuests={[]} />)
      enterPin(TEST_PIN)
      expect(
        screen.getByText(/no quests completed yet/i)
      ).toBeInTheDocument()
    })

    it('caps displayed quests at 50', () => {
      const manyQuests: CompletedQuest[] = Array.from({ length: 60 }, (_, i) => ({
        quest_id: `q${i}`,
        lesson: `lesson-${i}`,
        genre: 'fantasy_kingdom' as const,
        character_name: `Char-${i}`,
        character_thumbnail: `https://example.com/char-${i}.png`,
        completed_at: `2026-06-${String(15 - (i % 15)).padStart(2, '0')}T10:00:00Z`,
        coins_earned: 7,
      }))

      // cleanup from beforeEach is handled automatically by RTL between tests,
      // but since beforeEach already rendered, we need a fresh isolated render.
      // Use container scoping to avoid cross-component DOM queries.
      const { container } = render(
        <ParentDashboard {...defaultProps} recentQuests={manyQuests} />
      )

      // Authenticate via this specific instance
      const inputs = container.querySelectorAll('input[type="password"]')
      const input = inputs[inputs.length - 1] as HTMLInputElement
      fireEvent.change(input, { target: { value: TEST_PIN } })
      const form = input.closest('form')!
      fireEvent.submit(form)

      const items = container.querySelectorAll('li')
      expect(items).toHaveLength(50)
    })
  })

  describe('Close button', () => {
    it('calls onClose when close button is clicked on PIN screen', () => {
      const onClose = jest.fn()
      render(<ParentDashboard {...defaultProps} onClose={onClose} />)
      fireEvent.click(screen.getByLabelText(/close/i))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when close button is clicked on dashboard', () => {
      const onClose = jest.fn()
      render(<ParentDashboard {...defaultProps} onClose={onClose} />)
      enterPin(TEST_PIN)
      fireEvent.click(screen.getByLabelText(/close dashboard/i))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Accessibility', () => {
    it('renders PIN entry as a dialog with aria-modal', () => {
      render(<ParentDashboard {...defaultProps} />)
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })

    it('renders dashboard content as a dialog', () => {
      render(<ParentDashboard {...defaultProps} />)
      enterPin(TEST_PIN)
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })

    it('has minimum 44px tap targets on buttons', () => {
      render(<ParentDashboard {...defaultProps} />)
      const unlockBtn = screen.getByRole('button', { name: /unlock/i })
      expect(unlockBtn).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
    })
  })
})

describe('ParentDashboardTrigger (Requirement 11.6)', () => {
  it('renders a settings icon button', () => {
    render(<ParentDashboardTrigger onClick={jest.fn()} />)
    expect(
      screen.getByRole('button', { name: /open parent dashboard/i })
    ).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = jest.fn()
    render(<ParentDashboardTrigger onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /open parent dashboard/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has 44px minimum tap target', () => {
    render(<ParentDashboardTrigger onClick={jest.fn()} />)
    const btn = screen.getByRole('button', { name: /open parent dashboard/i })
    expect(btn).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
  })

  it('has reduced opacity to be less prominent to children', () => {
    render(<ParentDashboardTrigger onClick={jest.fn()} />)
    const btn = screen.getByRole('button', { name: /open parent dashboard/i })
    expect(btn.className).toContain('opacity-60')
  })
})

describe('formatDuration (Requirement 11.5)', () => {
  it('formats 0 minutes as "0m"', () => {
    expect(formatDuration(0)).toBe('0m')
  })

  it('formats minutes-only correctly', () => {
    expect(formatDuration(45)).toBe('45m')
  })

  it('formats exact hours correctly', () => {
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(120)).toBe('2h')
  })

  it('formats hours and minutes correctly', () => {
    expect(formatDuration(125)).toBe('2h 5m')
    expect(formatDuration(61)).toBe('1h 1m')
    expect(formatDuration(90)).toBe('1h 30m')
  })

  it('formats negative values as "0m"', () => {
    expect(formatDuration(-10)).toBe('0m')
  })
})
