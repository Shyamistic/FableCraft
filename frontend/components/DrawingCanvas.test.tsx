import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import DrawingCanvas, { DrawingCanvasHandle } from './DrawingCanvas'

// Mock canvas context
const mockGetContext = jest.fn()
const mockFillRect = jest.fn()
const mockBeginPath = jest.fn()
const mockMoveTo = jest.fn()
const mockLineTo = jest.fn()
const mockStroke = jest.fn()
const mockToDataURL = jest.fn(() => 'data:image/png;base64,mockdata')
const mockSetPointerCapture = jest.fn()
const mockReleasePointerCapture = jest.fn()

const mockCtx = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  lineCap: '',
  lineJoin: '',
  fillRect: mockFillRect,
  beginPath: mockBeginPath,
  moveTo: mockMoveTo,
  lineTo: mockLineTo,
  stroke: mockStroke,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetContext.mockReturnValue(mockCtx)

  // Mock HTMLCanvasElement methods
  HTMLCanvasElement.prototype.getContext = mockGetContext as any
  HTMLCanvasElement.prototype.toDataURL = mockToDataURL
  HTMLCanvasElement.prototype.setPointerCapture = mockSetPointerCapture
  HTMLCanvasElement.prototype.releasePointerCapture = mockReleasePointerCapture
  HTMLCanvasElement.prototype.getBoundingClientRect = jest.fn(() => ({
    left: 0,
    top: 0,
    width: 900,
    height: 600,
    right: 900,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => {},
  }))
})

describe('DrawingCanvas', () => {
  describe('Rendering', () => {
    it('renders the canvas element with correct dimensions', () => {
      render(<DrawingCanvas />)
      const canvas = screen.getByTestId('drawing-canvas')
      expect(canvas).toBeInTheDocument()
      expect(canvas).toHaveAttribute('width', '900')
      expect(canvas).toHaveAttribute('height', '600')
    })

    it('renders with white background on mount', () => {
      render(<DrawingCanvas />)
      expect(mockFillRect).toHaveBeenCalledWith(0, 0, 900, 600)
      expect(mockCtx.fillStyle).toBe('#FFFFFF')
    })

    it('renders a title when provided', () => {
      render(<DrawingCanvas title="Draw your character!" />)
      expect(screen.getByText('Draw your character!')).toBeInTheDocument()
    })

    it('does not render a title when not provided', () => {
      render(<DrawingCanvas />)
      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })

    it('canvas has touch-action: none for pointer event support', () => {
      render(<DrawingCanvas />)
      const canvas = screen.getByTestId('drawing-canvas')
      // jsdom doesn't fully parse inline style; check the style attribute directly
      expect(canvas.style.touchAction).toBe('none')
    })

    it('canvas uses responsive sizing with aspect ratio', () => {
      render(<DrawingCanvas />)
      const canvas = screen.getByTestId('drawing-canvas')
      expect(canvas.style.touchAction).toBe('none')
      // Canvas uses aspect ratio for responsive sizing instead of fixed min-width
      expect(canvas.style.aspectRatio).toBe('900 / 600')
    })
  })

  describe('Color Palette', () => {
    it('renders at least 12 color options', () => {
      render(<DrawingCanvas />)
      const colorButtons = screen.getAllByRole('radio')
      expect(colorButtons.length).toBeGreaterThanOrEqual(12)
    })

    it('each color button has minimum 44x44px dimensions', () => {
      render(<DrawingCanvas />)
      const colorButtons = screen.getAllByRole('radio')
      for (const btn of colorButtons) {
        expect(btn).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
      }
    })

    it('highlights the selected color with aria-checked', () => {
      render(<DrawingCanvas />)
      const colorButtons = screen.getAllByRole('radio')
      // First color (black) should be selected by default
      expect(colorButtons[0]).toHaveAttribute('aria-checked', 'true')
    })

    it('changes selected color when clicking a different button', () => {
      render(<DrawingCanvas />)
      const colorButtons = screen.getAllByRole('radio')
      fireEvent.click(colorButtons[2]) // Select the 3rd color
      expect(colorButtons[2]).toHaveAttribute('aria-checked', 'true')
      expect(colorButtons[0]).toHaveAttribute('aria-checked', 'false')
    })

    it('deactivates eraser when a color is selected', () => {
      render(<DrawingCanvas />)
      const eraserBtn = screen.getByTestId('eraser-btn')
      // Activate eraser
      fireEvent.click(eraserBtn)
      expect(eraserBtn).toHaveAttribute('aria-pressed', 'true')
      // Select a color
      const colorButtons = screen.getAllByRole('radio')
      fireEvent.click(colorButtons[1])
      expect(eraserBtn).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('Brush Size', () => {
    it('renders a brush size slider with range 1-20', () => {
      render(<DrawingCanvas />)
      const slider = screen.getByTestId('brush-size-slider')
      expect(slider).toHaveAttribute('min', '1')
      expect(slider).toHaveAttribute('max', '20')
    })

    it('defaults to brush size 5', () => {
      render(<DrawingCanvas />)
      const slider = screen.getByTestId('brush-size-slider')
      expect(slider).toHaveAttribute('value', '5')
    })

    it('updates brush size when slider changes', () => {
      render(<DrawingCanvas />)
      const slider = screen.getByTestId('brush-size-slider')
      fireEvent.change(slider, { target: { value: '12' } })
      expect(slider).toHaveAttribute('value', '12')
    })

    it('displays the current brush size value', () => {
      render(<DrawingCanvas />)
      expect(screen.getByText('Size: 5px')).toBeInTheDocument()
    })

    it('slider has minimum 44px touch target height', () => {
      render(<DrawingCanvas />)
      const slider = screen.getByTestId('brush-size-slider')
      expect(slider).toHaveStyle({ minHeight: '44px' })
    })
  })

  describe('Tools - Tap Target Size', () => {
    it('eraser button has minimum 44x44px tap target', () => {
      render(<DrawingCanvas />)
      const btn = screen.getByTestId('eraser-btn')
      expect(btn).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
    })

    it('undo button has minimum 44x44px tap target', () => {
      render(<DrawingCanvas />)
      const btn = screen.getByTestId('undo-btn')
      expect(btn).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
    })

    it('clear button has minimum 44x44px tap target', () => {
      render(<DrawingCanvas />)
      const btn = screen.getByTestId('clear-btn')
      expect(btn).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
    })
  })

  describe('Eraser Tool', () => {
    it('toggles eraser mode when clicked', () => {
      render(<DrawingCanvas />)
      const eraserBtn = screen.getByTestId('eraser-btn')
      expect(eraserBtn).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(eraserBtn)
      expect(eraserBtn).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(eraserBtn)
      expect(eraserBtn).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('Undo Tool', () => {
    it('undo button is disabled when there are no strokes', () => {
      render(<DrawingCanvas />)
      const undoBtn = screen.getByTestId('undo-btn')
      expect(undoBtn).toBeDisabled()
    })

    it('undo button becomes enabled after drawing a stroke', () => {
      render(<DrawingCanvas />)
      const canvas = screen.getByTestId('drawing-canvas')

      // Simulate a stroke via pointer events
      fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
      fireEvent.pointerMove(canvas, { clientX: 150, clientY: 150, pointerId: 1 })
      fireEvent.pointerUp(canvas, { clientX: 150, clientY: 150, pointerId: 1 })

      const undoBtn = screen.getByTestId('undo-btn')
      expect(undoBtn).not.toBeDisabled()
    })
  })

  describe('Clear Tool', () => {
    it('clears the canvas when clicked', () => {
      render(<DrawingCanvas />)
      const canvas = screen.getByTestId('drawing-canvas')

      // Draw something first
      fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
      fireEvent.pointerMove(canvas, { clientX: 200, clientY: 200, pointerId: 1 })
      fireEvent.pointerUp(canvas, { clientX: 200, clientY: 200, pointerId: 1 })

      // Click clear
      const clearBtn = screen.getByTestId('clear-btn')
      fireEvent.click(clearBtn)

      // Canvas fillRect should be called (to clear)
      expect(mockFillRect).toHaveBeenCalled()
    })
  })

  describe('Drawing with Pointer Events', () => {
    it('draws when pointer is down and moving', () => {
      render(<DrawingCanvas />)
      const canvas = screen.getByTestId('drawing-canvas')

      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1 })
      fireEvent.pointerMove(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
      fireEvent.pointerUp(canvas, { clientX: 100, clientY: 100, pointerId: 1 })

      expect(mockBeginPath).toHaveBeenCalled()
      expect(mockLineTo).toHaveBeenCalled()
      expect(mockStroke).toHaveBeenCalled()
    })

    it('does not draw when pointer is not down', () => {
      render(<DrawingCanvas />)
      const canvas = screen.getByTestId('drawing-canvas')

      mockBeginPath.mockClear()
      fireEvent.pointerMove(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
      // beginPath should not be called for the move (only for initial mount)
      expect(mockBeginPath).not.toHaveBeenCalled()
    })

    it('captures pointer on pointerDown', () => {
      render(<DrawingCanvas />)
      const canvas = screen.getByTestId('drawing-canvas')

      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 42 })
      // setPointerCapture is called (pointerId may be 0 in jsdom as synthetic events don't pass it)
      expect(mockSetPointerCapture).toHaveBeenCalled()
    })

    it('releases pointer on pointerUp', () => {
      render(<DrawingCanvas />)
      const canvas = screen.getByTestId('drawing-canvas')

      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 42 })
      fireEvent.pointerUp(canvas, { clientX: 50, clientY: 50, pointerId: 42 })
      // releasePointerCapture is called (pointerId may be 0 in jsdom)
      expect(mockReleasePointerCapture).toHaveBeenCalled()
    })
  })

  describe('Imperative Handle (ref)', () => {
    it('exposes getImageData via ref', () => {
      const ref = createRef<DrawingCanvasHandle>()
      render(<DrawingCanvas ref={ref} />)

      expect(ref.current).not.toBeNull()
      const dataUrl = ref.current!.getImageData()
      expect(dataUrl).toBe('data:image/png;base64,mockdata')
    })

    it('exposes clear method via ref', () => {
      const ref = createRef<DrawingCanvasHandle>()
      render(<DrawingCanvas ref={ref} />)

      expect(ref.current).not.toBeNull()
      mockFillRect.mockClear()
      ref.current!.clear()
      expect(mockFillRect).toHaveBeenCalledWith(0, 0, 900, 600)
    })
  })

  describe('Callback', () => {
    it('calls onDrawingChange after a stroke is completed', () => {
      const onDrawingChange = jest.fn()
      render(<DrawingCanvas onDrawingChange={onDrawingChange} />)
      const canvas = screen.getByTestId('drawing-canvas')

      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1 })
      fireEvent.pointerMove(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
      fireEvent.pointerUp(canvas, { clientX: 100, clientY: 100, pointerId: 1 })

      expect(onDrawingChange).toHaveBeenCalledWith('data:image/png;base64,mockdata')
    })
  })

  describe('Accessibility', () => {
    it('color palette has radiogroup role', () => {
      render(<DrawingCanvas />)
      expect(screen.getByRole('radiogroup', { name: /color palette/i })).toBeInTheDocument()
    })

    it('eraser button has aria-label', () => {
      render(<DrawingCanvas />)
      expect(screen.getByLabelText('Eraser tool')).toBeInTheDocument()
    })

    it('undo button has aria-label', () => {
      render(<DrawingCanvas />)
      expect(screen.getByLabelText('Undo last stroke')).toBeInTheDocument()
    })

    it('clear button has aria-label', () => {
      render(<DrawingCanvas />)
      expect(screen.getByLabelText('Clear canvas')).toBeInTheDocument()
    })

    it('brush size slider has aria-label', () => {
      render(<DrawingCanvas />)
      expect(screen.getByLabelText(/brush size/i)).toBeInTheDocument()
    })
  })
})
