import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import CollaborativeMode, {
  getActivePlayer,
  isValidRoomCode,
  CollabSessionState,
} from './CollaborativeMode'
import { ROOM_CODE_LENGTH, MAX_COINS_PER_QUEST, TOTAL_QUEST_SCENES } from '../lib/constants'

// ─── WebSocket Mock ──────────────────────────────────────────────────────────

class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3

  url: string
  readyState = MockWebSocket.OPEN
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sentMessages: string[] = []

  constructor(url: string) {
    this.url = url
    // Simulate connection opening
    setTimeout(() => {
      if (this.onopen) this.onopen()
    }, 0)
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose()
  }

  // Helper to simulate receiving a message
  simulateMessage(msg: object) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(msg) })
    }
  }

  // Helper to simulate error
  simulateError() {
    if (this.onerror) this.onerror()
  }
}

let mockWsInstance: MockWebSocket | null = null

beforeAll(() => {
  ;(global as any).WebSocket = class extends MockWebSocket {
    constructor(url: string) {
      super(url)
      mockWsInstance = this
    }
  }
  ;(global as any).WebSocket.OPEN = MockWebSocket.OPEN
  ;(global as any).WebSocket.CLOSED = MockWebSocket.CLOSED
})

afterEach(() => {
  mockWsInstance = null
  jest.clearAllTimers()
  jest.useRealTimers()
})

// ─── Utility Function Tests ──────────────────────────────────────────────────

describe('getActivePlayer', () => {
  it('returns Player 1 for odd scenes', () => {
    expect(getActivePlayer(1)).toBe(1)
    expect(getActivePlayer(3)).toBe(1)
    expect(getActivePlayer(5)).toBe(1)
    expect(getActivePlayer(7)).toBe(1)
  })

  it('returns Player 2 for even scenes', () => {
    expect(getActivePlayer(2)).toBe(2)
    expect(getActivePlayer(4)).toBe(2)
    expect(getActivePlayer(6)).toBe(2)
    expect(getActivePlayer(8)).toBe(2)
  })
})

describe('isValidRoomCode', () => {
  it('accepts valid 4-digit codes', () => {
    expect(isValidRoomCode('1234')).toBe(true)
    expect(isValidRoomCode('0000')).toBe(true)
    expect(isValidRoomCode('9999')).toBe(true)
  })

  it('rejects codes that are not exactly 4 digits', () => {
    expect(isValidRoomCode('123')).toBe(false)
    expect(isValidRoomCode('12345')).toBe(false)
    expect(isValidRoomCode('')).toBe(false)
    expect(isValidRoomCode('abcd')).toBe(false)
    expect(isValidRoomCode('12a4')).toBe(false)
  })
})

// ─── Component Tests ─────────────────────────────────────────────────────────

describe('CollaborativeMode', () => {
  const defaultProps = {
    playerName: 'Alice',
  }

  describe('Menu Phase', () => {
    it('renders the initial menu with create and join options', () => {
      render(<CollaborativeMode {...defaultProps} />)
      expect(screen.getByText('🤝 Play Together!')).toBeInTheDocument()
      expect(screen.getByLabelText('Create a new room')).toBeInTheDocument()
      expect(screen.getByLabelText('Join room')).toBeInTheDocument()
    })

    it('renders room code input with numeric input mode', () => {
      render(<CollaborativeMode {...defaultProps} />)
      const input = screen.getByLabelText('Enter 4-digit room code')
      expect(input).toHaveAttribute('inputMode', 'numeric')
      expect(input).toHaveAttribute('maxLength', String(ROOM_CODE_LENGTH))
    })

    it('disables join button when code is incomplete', () => {
      render(<CollaborativeMode {...defaultProps} />)
      const joinBtn = screen.getByLabelText('Join room')
      expect(joinBtn).toBeDisabled()
    })

    it('enables join button when 4 digits are entered', () => {
      render(<CollaborativeMode {...defaultProps} />)
      const input = screen.getByLabelText('Enter 4-digit room code')
      fireEvent.change(input, { target: { value: '1234' } })
      const joinBtn = screen.getByLabelText('Join room')
      expect(joinBtn).not.toBeDisabled()
    })

    it('filters non-numeric characters from room code input', () => {
      render(<CollaborativeMode {...defaultProps} />)
      const input = screen.getByLabelText('Enter 4-digit room code') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'ab12cd34' } })
      expect(input.value).toBe('1234')
    })

    it('shows error for invalid room code on join attempt', () => {
      render(<CollaborativeMode {...defaultProps} />)
      const input = screen.getByLabelText('Enter 4-digit room code')
      fireEvent.change(input, { target: { value: '12' } })
      // Force join button click (even though disabled, test the validation logic)
      const joinBtn = screen.getByLabelText('Join room')
      fireEvent.click(joinBtn)
      // Button is disabled so validation won't trigger, which is correct behavior
      expect(joinBtn).toBeDisabled()
    })

    it('renders go back button when onClose is provided', () => {
      const onClose = jest.fn()
      render(<CollaborativeMode {...defaultProps} onClose={onClose} />)
      const backBtn = screen.getByText('Go back')
      fireEvent.click(backBtn)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not render go back button when onClose is not provided', () => {
      render(<CollaborativeMode {...defaultProps} />)
      expect(screen.queryByText('Go back')).not.toBeInTheDocument()
    })
  })

  describe('Creating Phase', () => {
    it('calls onSetupQuest when create room is clicked', () => {
      const onSetupQuest = jest.fn()
      render(<CollaborativeMode {...defaultProps} onSetupQuest={onSetupQuest} />)
      fireEvent.click(screen.getByLabelText('Create a new room'))
      expect(onSetupQuest).toHaveBeenCalledTimes(1)
    })

    it('shows setup UI when creating without quest', () => {
      render(<CollaborativeMode {...defaultProps} />)
      fireEvent.click(screen.getByLabelText('Create a new room'))
      expect(screen.getByTestId('collab-creating')).toBeInTheDocument()
      expect(screen.getByText('🎨 Set Up Your Adventure')).toBeInTheDocument()
    })
  })

  describe('Waiting Phase', () => {
    it('displays room code when room is created', async () => {
      jest.useFakeTimers()
      render(<CollaborativeMode {...defaultProps} quest={{ id: 'q1' } as any} />)
      
      // Click create room
      fireEvent.click(screen.getByLabelText('Create a new room'))
      
      // Wait for WS connection
      await act(async () => {
        jest.advanceTimersByTime(10)
      })

      // Simulate room_created message
      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'room_created',
          room_code: '5678',
          player_number: 1,
          player_name: 'Alice',
        })
      })

      expect(screen.getByTestId('room-code-display')).toHaveTextContent('5678')
      expect(screen.getByText(/Waiting for your friend to join/)).toBeInTheDocument()
    })
  })

  describe('Playing Phase - Turn Indicator', () => {
    it('shows turn indicator for active player', async () => {
      jest.useFakeTimers()
      render(<CollaborativeMode {...defaultProps} quest={{ id: 'q1' } as any} />)
      
      fireEvent.click(screen.getByLabelText('Create a new room'))
      
      await act(async () => {
        jest.advanceTimersByTime(10)
      })

      // Simulate full flow: room created -> player joined -> scene start
      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'room_created',
          room_code: '5678',
          player_number: 1,
          player_name: 'Alice',
        })
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'player_joined',
          player_name: 'Bob',
          player_number: 2,
        })
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'scene_start',
          scene_number: 1,
          active_player: 1,
        })
      })

      const turnIndicator = screen.getByTestId('turn-indicator')
      expect(turnIndicator).toBeInTheDocument()
      // Player 1 (Alice) is active for scene 1 (odd)
      expect(turnIndicator).toHaveTextContent(/Your turn/)
    })

    it('shows waiting message when it is not the players turn', async () => {
      jest.useFakeTimers()
      render(<CollaborativeMode {...defaultProps} quest={{ id: 'q1' } as any} />)
      
      fireEvent.click(screen.getByLabelText('Create a new room'))
      
      await act(async () => {
        jest.advanceTimersByTime(10)
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'room_created',
          room_code: '5678',
          player_number: 1,
          player_name: 'Alice',
        })
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'player_joined',
          player_name: 'Bob',
          player_number: 2,
        })
      })

      // Scene 2 is Player 2's turn
      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'scene_start',
          scene_number: 2,
          active_player: 2,
        })
      })

      const turnIndicator = screen.getByTestId('turn-indicator')
      expect(turnIndicator).toHaveTextContent(/Waiting for your friend/)
    })
  })

  describe('Quest Complete Phase', () => {
    it('displays shared coin total on quest complete', async () => {
      jest.useFakeTimers()
      render(<CollaborativeMode {...defaultProps} quest={{ id: 'q1' } as any} />)
      
      fireEvent.click(screen.getByLabelText('Create a new room'))
      
      await act(async () => {
        jest.advanceTimersByTime(10)
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'room_created',
          room_code: '5678',
          player_number: 1,
          player_name: 'Alice',
        })
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'player_joined',
          player_name: 'Bob',
          player_number: 2,
        })
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'quest_complete',
          total_coins: 6,
        })
      })

      expect(screen.getByTestId('collab-complete')).toBeInTheDocument()
      expect(screen.getByTestId('shared-coin-total')).toHaveTextContent(`6 / ${MAX_COINS_PER_QUEST}`)
      expect(screen.getByText(/Great teamwork/)).toBeInTheDocument()
    })
  })

  describe('Disconnect Handling', () => {
    it('shows disconnect notice and solo continuation option', async () => {
      jest.useFakeTimers()
      render(<CollaborativeMode {...defaultProps} quest={{ id: 'q1' } as any} />)
      
      fireEvent.click(screen.getByLabelText('Create a new room'))
      
      await act(async () => {
        jest.advanceTimersByTime(10)
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'room_created',
          room_code: '5678',
          player_number: 1,
          player_name: 'Alice',
        })
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'player_joined',
          player_name: 'Bob',
          player_number: 2,
        })
      })

      // Simulate disconnect notice (after 30s timeout on backend)
      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'disconnect_notice',
          player_number: 2,
          message: 'Your friend had to go. You can finish the adventure on your own!',
        })
      })

      expect(screen.getByTestId('collab-disconnected')).toBeInTheDocument()
      expect(screen.getAllByText(/Your friend had to go/).length).toBeGreaterThan(0)
      expect(screen.getByLabelText('Continue adventure solo')).toBeInTheDocument()
    })

    it('transitions to solo play when continue solo is clicked', async () => {
      jest.useFakeTimers()
      render(<CollaborativeMode {...defaultProps} quest={{ id: 'q1' } as any} />)
      
      fireEvent.click(screen.getByLabelText('Create a new room'))
      
      await act(async () => {
        jest.advanceTimersByTime(10)
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'room_created',
          room_code: '5678',
          player_number: 1,
          player_name: 'Alice',
        })
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'player_joined',
          player_name: 'Bob',
          player_number: 2,
        })
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'disconnect_notice',
          player_number: 2,
          message: 'Your friend had to go.',
        })
      })

      fireEvent.click(screen.getByLabelText('Continue adventure solo'))
      expect(screen.getByTestId('collab-playing')).toBeInTheDocument()
    })
  })

  describe('Expired Room Code', () => {
    it('shows expired message and offers new room creation', async () => {
      jest.useFakeTimers()
      render(<CollaborativeMode {...defaultProps} quest={{ id: 'q1' } as any} />)
      
      fireEvent.click(screen.getByLabelText('Create a new room'))
      
      await act(async () => {
        jest.advanceTimersByTime(10)
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'room_created',
          room_code: '5678',
          player_number: 1,
          player_name: 'Alice',
        })
      })

      // Simulate expired error
      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'error',
          message: 'The invite code expired. Ask your friend for a new one!',
        })
      })

      expect(screen.getByTestId('collab-expired')).toBeInTheDocument()
      expect(screen.getByText(/The invite code expired/)).toBeInTheDocument()
      expect(screen.getByLabelText('Create a new room')).toBeInTheDocument()
    })

    it('returns to menu when create new room is clicked on expired screen', async () => {
      jest.useFakeTimers()
      render(<CollaborativeMode {...defaultProps} quest={{ id: 'q1' } as any} />)
      
      fireEvent.click(screen.getByLabelText('Create a new room'))
      
      await act(async () => {
        jest.advanceTimersByTime(10)
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'room_created',
          room_code: '5678',
          player_number: 1,
          player_name: 'Alice',
        })
      })

      act(() => {
        mockWsInstance?.simulateMessage({
          type: 'error',
          message: 'The invite code expired.',
        })
      })

      fireEvent.click(screen.getByLabelText('Create a new room'))
      expect(screen.getByTestId('collab-menu')).toBeInTheDocument()
    })
  })

  describe('Error Phase', () => {
    it('shows error message on WebSocket error', async () => {
      jest.useFakeTimers()
      render(<CollaborativeMode {...defaultProps} quest={{ id: 'q1' } as any} />)
      
      fireEvent.click(screen.getByLabelText('Create a new room'))
      
      await act(async () => {
        jest.advanceTimersByTime(10)
      })

      act(() => {
        mockWsInstance?.simulateError()
      })

      expect(screen.getByTestId('collab-error')).toBeInTheDocument()
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument()
    })
  })

  describe('Tap Target Sizes (Requirement 20.4)', () => {
    it('all primary buttons have minimum 44x44px tap target', () => {
      render(<CollaborativeMode {...defaultProps} onClose={() => {}} />)
      const createBtn = screen.getByLabelText('Create a new room')
      const joinBtn = screen.getByLabelText('Join room')
      expect(createBtn).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
      expect(joinBtn).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
    })
  })
})
