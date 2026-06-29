import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import CharacterStudio from './CharacterStudio'
import { Character } from '../lib/types'

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock DrawingCanvas
const mockGetImageData = jest.fn(() => 'data:image/png;base64,testdrawingdata')
const mockClear = jest.fn()

jest.mock('./DrawingCanvas', () => {
  const { forwardRef, useImperativeHandle } = require('react')
  return {
    __esModule: true,
    default: forwardRef(function MockDrawingCanvas(props: any, ref: any) {
      useImperativeHandle(ref, () => ({
        getImageData: mockGetImageData,
        clear: mockClear,
      }))
      return <div data-testid="mock-drawing-canvas">Drawing Canvas</div>
    }),
  }
})

// Mock ImageUploader
jest.mock('./ImageUploader', () => {
  return {
    __esModule: true,
    default: function MockImageUploader({ onImageReady }: { onImageReady: (data: string) => void }) {
      return (
        <div data-testid="mock-image-uploader">
          <button
            data-testid="mock-upload-trigger"
            onClick={() => onImageReady('data:image/png;base64,uploadeddata')}
          >
            Mock Upload
          </button>
        </div>
      )
    },
  }
})

// Mock fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

// ─── Test Data ───────────────────────────────────────────────────────────────

const mockCharacter: Character = {
  id: 'char-123',
  name: 'Sparkle',
  character_type: 'bunny',
  character_description: 'A cheerful pink bunny with sparkly star patterns',
  colors_used: ['pink', 'gold', 'white'],
  artistic_style: 'whimsical',
  mood: 'happy',
  generated_image_url: 'https://cdn.example.com/characters/char-123.png',
  original_drawing_url: 'https://cdn.example.com/drawings/char-123.png',
  created_at: '2026-06-15T10:30:00Z',
}

const successResponse = {
  status: 'success',
  character: mockCharacter,
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function renderStudio(props?: Partial<React.ComponentProps<typeof CharacterStudio>>) {
  return render(
    <CharacterStudio sessionId="test-session-123" {...props} />
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CharacterStudio', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => successResponse,
    })
  })

  describe('Input Step (initial render)', () => {
    it('renders the character studio container', () => {
      renderStudio()
      expect(screen.getByTestId('character-studio')).toBeInTheDocument()
    })

    it('displays "Create Your Character" heading', () => {
      renderStudio()
      expect(screen.getByText('Create Your Character')).toBeInTheDocument()
    })

    it('shows Draw and Upload mode tabs', () => {
      renderStudio()
      expect(screen.getByRole('tab', { name: /draw/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /upload/i })).toBeInTheDocument()
    })

    it('defaults to Draw mode', () => {
      renderStudio()
      expect(screen.getByRole('tab', { name: /draw/i })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByTestId('mock-drawing-canvas')).toBeInTheDocument()
    })

    it('switches to Upload mode when Upload tab is clicked', () => {
      renderStudio()
      fireEvent.click(screen.getByRole('tab', { name: /upload/i }))
      expect(screen.getByTestId('mock-image-uploader')).toBeInTheDocument()
    })

    it('shows a submit button', () => {
      renderStudio()
      expect(screen.getByTestId('submit-drawing-btn')).toBeInTheDocument()
    })

    it('submit button has minimum 44x44px tap target', () => {
      renderStudio()
      const btn = screen.getByTestId('submit-drawing-btn')
      expect(btn).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
    })
  })

  describe('Preview Step (artwork preview)', () => {
    it('shows preview of drawing after submit in draw mode', () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      expect(screen.getByTestId('artwork-preview')).toBeInTheDocument()
    })

    it('shows preview of uploaded image after submit in upload mode', () => {
      renderStudio()
      fireEvent.click(screen.getByRole('tab', { name: /upload/i }))
      fireEvent.click(screen.getByTestId('mock-upload-trigger'))
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      expect(screen.getByTestId('artwork-preview')).toBeInTheDocument()
    })

    it('shows character name input field', () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      expect(screen.getByTestId('character-name-input')).toBeInTheDocument()
    })

    it('shows the generate button', () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      expect(screen.getByTestId('generate-btn')).toBeInTheDocument()
    })

    it('shows a back button to return to input', () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      expect(screen.getByLabelText('Go back to drawing')).toBeInTheDocument()
    })

    it('navigates back to input step when back button is clicked', () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.click(screen.getByLabelText('Go back to drawing'))
      expect(screen.getByTestId('mock-drawing-canvas')).toBeInTheDocument()
    })
  })

  describe('Character Name Validation (Requirement 1.6)', () => {
    it('shows error when trying to generate without a name', () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.click(screen.getByTestId('generate-btn'))
      expect(screen.getByTestId('name-error')).toBeInTheDocument()
      expect(screen.getByText('Please give your character a name!')).toBeInTheDocument()
    })

    it('shows error for whitespace-only name', () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: '   ' } })
      fireEvent.click(screen.getByTestId('generate-btn'))
      expect(screen.getByTestId('name-error')).toBeInTheDocument()
    })

    it('clears name error when user types', () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.click(screen.getByTestId('generate-btn'))
      expect(screen.getByTestId('name-error')).toBeInTheDocument()
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'S' } })
      expect(screen.queryByTestId('name-error')).not.toBeInTheDocument()
    })
  })

  describe('Loading State (Requirement 16.6)', () => {
    it('shows loading indicator when generating', async () => {
      // Make fetch hang
      mockFetch.mockImplementation(() => new Promise(() => {}))

      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()
      expect(screen.getByText('Creating your character...')).toBeInTheDocument()
    })

    it('loading indicator has role="status" for accessibility', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))

      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(screen.getByRole('status')).toBeInTheDocument()
    })
  })

  describe('API Call (POST /api/characters/generate)', () => {
    it('calls the correct endpoint with proper payload', async () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/characters/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drawing_data: 'testdrawingdata',
          character_name: 'Sparkle',
          session_id: 'test-session-123',
        }),
      })
    })

    it('uses custom apiBaseUrl when provided', async () => {
      renderStudio({ apiBaseUrl: 'http://localhost:8000' })
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/characters/generate',
        expect.any(Object)
      )
    })

    it('strips data URL prefix before sending', async () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.drawing_data).toBe('testdrawingdata')
      expect(callBody.drawing_data).not.toContain('data:image')
    })
  })

  describe('Result Step (Requirement 3.4 — side-by-side display)', () => {
    it('displays original drawing and generated character side-by-side', async () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(screen.getByTestId('character-comparison')).toBeInTheDocument()
      expect(screen.getByTestId('original-drawing')).toBeInTheDocument()
      expect(screen.getByTestId('generated-character')).toBeInTheDocument()
    })

    it('displays the character name in the heading', async () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(screen.getByText(/Meet Sparkle/)).toBeInTheDocument()
    })

    it('displays character description and type', async () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      // Character type and mood appear in the details section
      const allBunny = screen.getAllByText(/bunny/i)
      expect(allBunny.length).toBeGreaterThan(0)
      expect(screen.getByText(/happy/)).toBeInTheDocument()
    })

    it('calls onCharacterGenerated callback with the character', async () => {
      const onCharacterGenerated = jest.fn()
      renderStudio({ onCharacterGenerated })
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(onCharacterGenerated).toHaveBeenCalledWith(mockCharacter)
    })

    it('shows a "Draw Another" button to start over', async () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(screen.getByText('Draw Another')).toBeInTheDocument()
    })
  })

  describe('Error Handling (Requirements 3.5, 3.6, 16.5)', () => {
    it('shows child-friendly error message on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(screen.getByTestId('error-message')).toBeInTheDocument()
      expect(screen.getByText(/couldn't reach the character creator/i)).toBeInTheDocument()
    })

    it('shows backend error message when API returns error status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({
          status: 'error',
          message: "Let's try drawing something different! Your character needs to be friendly and fun.",
        }),
      })

      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(screen.getByTestId('error-message')).toBeInTheDocument()
      expect(screen.getByText(/drawing something different/i)).toBeInTheDocument()
    })

    it('shows fallback error when backend provides no message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ status: 'error' }),
      })

      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(screen.getByTestId('error-message')).toBeInTheDocument()
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    })

    it('shows retry button on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      expect(screen.getByTestId('retry-btn')).toBeInTheDocument()
    })

    it('retry button returns to preview step', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      fireEvent.click(screen.getByTestId('retry-btn'))
      expect(screen.getByTestId('artwork-preview')).toBeInTheDocument()
      expect(screen.getByTestId('generate-btn')).toBeInTheDocument()
    })

    it('error messages are child-friendly (no technical jargon)', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      const errorText = screen.getByTestId('error-message').textContent || ''
      expect(errorText).not.toMatch(/ECONNREFUSED|500|error code|stack trace/i)
    })
  })

  describe('Start Over', () => {
    it('resets all state when starting over from error', async () => {
      mockFetch.mockRejectedValue(new Error('fail'))

      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      fireEvent.click(screen.getByText('Start Over'))
      expect(screen.getByText('Create Your Character')).toBeInTheDocument()
      expect(screen.getByTestId('mock-drawing-canvas')).toBeInTheDocument()
    })

    it('resets all state when starting over from result', async () => {
      renderStudio()
      fireEvent.click(screen.getByTestId('submit-drawing-btn'))
      fireEvent.change(screen.getByTestId('character-name-input'), { target: { value: 'Sparkle' } })

      await act(async () => {
        fireEvent.click(screen.getByTestId('generate-btn'))
      })

      fireEvent.click(screen.getByText('Draw Another'))
      expect(screen.getByText('Create Your Character')).toBeInTheDocument()
    })
  })
})
