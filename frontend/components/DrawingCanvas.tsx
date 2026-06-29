'use client'

import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Undo, Eraser, Trash2 } from 'lucide-react'
import MagicBrushSelector, { type MagicBrushMode } from './MagicBrushSelector'
import StickerPalette, { type Sticker } from './StickerPalette'
import { renderMagicSegment } from '@/lib/magicBrush'

/**
 * DrawingCanvas component providing a freehand drawing interface.
 *
 * Supports:
 * - Touch and mouse input via Pointer Events (pointerdown/pointermove/pointerup)
 * - 12+ color palette with visual selection indicator
 * - Adjustable brush size (1-20px)
 * - Undo (stroke history), Clear, and Eraser tools
 * - All interactive elements have minimum 44×44px tap targets (WCAG)
 * - Canvas renders at minimum 900×600px with white background
 * - Exports canvas data as base64 PNG via imperative handle (getImageData)
 *
 * Requirements: 1.1, 1.4, 1.7, 20.4
 */

// ─── Color Palette (16 colors) ───────────────────────────────────────────────
const COLOR_PALETTE = [
  '#000000', // Black
  '#FF0000', // Red
  '#FF6B00', // Orange
  '#FFD600', // Yellow
  '#00C853', // Green
  '#0091EA', // Blue
  '#6200EA', // Purple
  '#FF4081', // Pink
  '#795548', // Brown
  '#607D8B', // Slate
  '#00BFA5', // Teal
  '#FF6D00', // Deep Orange
  '#AA00FF', // Violet
  '#64DD17', // Lime
  '#00B8D4', // Cyan
  '#F50057', // Magenta
]

// ─── Constants ───────────────────────────────────────────────────────────────
const CANVAS_WIDTH = 900
const CANVAS_HEIGHT = 600
const MIN_BRUSH_SIZE = 1
const MAX_BRUSH_SIZE = 20
const ERASER_COLOR = '#FFFFFF'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DrawingCanvasProps {
  /** Callback when drawing changes. Receives the current canvas data URL. */
  onDrawingChange?: (dataUrl: string) => void
  /** Optional title displayed above the canvas */
  title?: string
}

export interface DrawingCanvasHandle {
  /** Returns the canvas content as a base64-encoded PNG data URL */
  getImageData: () => string
  /** Clears the canvas to white */
  clear: () => void
}

/** Represents a single stroke (series of points drawn in one pointer-down session) */
interface Stroke {
  points: { x: number; y: number }[]
  color: string
  lineWidth: number
}

const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ onDrawingChange, title }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [currentColor, setCurrentColor] = useState('#000000')
    const [brushSize, setBrushSize] = useState(5)
    const [isEraser, setIsEraser] = useState(false)
    const [strokes, setStrokes] = useState<Stroke[]>([])
    const currentStrokeRef = useRef<Stroke | null>(null)
    const [magicBrushMode, setMagicBrushMode] = useState<MagicBrushMode>('normal')
    const [showStickers, setShowStickers] = useState(false)
    const [stickerMode, setStickerMode] = useState<Sticker | null>(null)
    const segmentCountRef = useRef(0)

    // ─── Canvas Initialization ─────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Set internal resolution
      canvas.width = CANVAS_WIDTH
      canvas.height = CANVAS_HEIGHT

      // Fill with white background
      ctx.fillStyle = ERASER_COLOR
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    }, [])

    // ─── Redraw all strokes (used after undo/clear) ────────────────────────
    const redrawCanvas = useCallback((strokeList: Stroke[]) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Clear to white
      ctx.fillStyle = ERASER_COLOR
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Redraw each stroke
      for (const stroke of strokeList) {
        if (!stroke) continue

        // Sticker stroke
        if (stroke.color.startsWith('sticker:')) {
          const emoji = stroke.color.replace('sticker:', '')
          if (stroke.points.length > 0) {
            ctx.font = `${stroke.lineWidth}px serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(emoji, stroke.points[0].x, stroke.points[0].y)
          }
          continue
        }

        // Magic brush stroke
        if (stroke.color.startsWith('magic:')) {
          const mode = stroke.color.replace('magic:', '') as MagicBrushMode
          for (let i = 1; i < stroke.points.length; i++) {
            renderMagicSegment(ctx, stroke.points[i - 1], stroke.points[i], mode, stroke.lineWidth, i)
          }
          continue
        }

        // Normal stroke
        if (stroke.points.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
        }
        ctx.strokeStyle = stroke.color
        ctx.lineWidth = stroke.lineWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()
      }
    }, [])

    // ─── Notify parent of drawing change ───────────────────────────────────
    const notifyChange = useCallback(() => {
      if (onDrawingChange) {
        const canvas = canvasRef.current
        if (canvas) {
          onDrawingChange(canvas.toDataURL('image/png'))
        }
      }
    }, [onDrawingChange])

    // ─── Coordinate calculation ────────────────────────────────────────────
    const getCanvasCoords = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const scaleX = CANVAS_WIDTH / rect.width
      const scaleY = CANVAS_HEIGHT / rect.height
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      }
    }, [])

    // ─── Pointer Event Handlers ────────────────────────────────────────────
    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return

      const coords = getCanvasCoords(e)
      if (!coords) return

      // Sticker placement mode
      if (stickerMode) {
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const fontSize = 40
        ctx.font = `${fontSize}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(stickerMode.emoji, coords.x, coords.y)
        // Save as a stroke for undo
        setStrokes(prev => [...prev, {
          points: [coords],
          color: `sticker:${stickerMode.emoji}`,
          lineWidth: fontSize,
        }])
        notifyChange()
        return
      }

      // Capture pointer for reliable tracking
      canvas.setPointerCapture(e.pointerId)

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const strokeColor = isEraser ? ERASER_COLOR : currentColor
      const strokeWidth = isEraser ? brushSize * 2 : brushSize

      // Start a new stroke
      currentStrokeRef.current = {
        points: [coords],
        color: magicBrushMode !== 'normal' ? `magic:${magicBrushMode}` : strokeColor,
        lineWidth: strokeWidth,
      }

      segmentCountRef.current = 0

      if (magicBrushMode !== 'normal' && !isEraser) {
        renderMagicSegment(ctx, coords, { x: coords.x + 0.1, y: coords.y + 0.1 }, magicBrushMode, strokeWidth, 0)
      } else {
        ctx.beginPath()
        ctx.moveTo(coords.x, coords.y)
        ctx.lineTo(coords.x + 0.1, coords.y + 0.1)
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = strokeWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()
      }

      setIsDrawing(true)
    }, [currentColor, brushSize, isEraser, getCanvasCoords, magicBrushMode, stickerMode, notifyChange])

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !currentStrokeRef.current) return
      e.preventDefault()

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const coords = getCanvasCoords(e)
      if (!coords) return

      const stroke = currentStrokeRef.current
      const prevPoint = stroke.points[stroke.points.length - 1]
      stroke.points.push(coords)
      segmentCountRef.current++

      if (stroke.color.startsWith('magic:') && !isEraser) {
        const mode = stroke.color.replace('magic:', '') as MagicBrushMode
        renderMagicSegment(ctx, prevPoint, coords, mode, stroke.lineWidth, segmentCountRef.current)
      } else {
        // Normal drawing
        ctx.beginPath()
        ctx.moveTo(prevPoint.x, prevPoint.y)
        ctx.lineTo(coords.x, coords.y)
        ctx.strokeStyle = stroke.color
        ctx.lineWidth = stroke.lineWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()
      }
    }, [isDrawing, getCanvasCoords, isEraser])

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return

      const canvas = canvasRef.current
      if (canvas) {
        canvas.releasePointerCapture(e.pointerId)
      }

      // Save the completed stroke to history
      if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
        setStrokes(prev => [...prev, currentStrokeRef.current!])
      }
      currentStrokeRef.current = null
      setIsDrawing(false)
      notifyChange()
    }, [isDrawing, notifyChange])

    // ─── Tools ─────────────────────────────────────────────────────────────
    const handleUndo = useCallback(() => {
      setStrokes(prev => {
        if (prev.length === 0) return prev
        const newStrokes = prev.slice(0, -1)
        redrawCanvas(newStrokes)
        return newStrokes
      })
      // Don't call notifyChange during undo to avoid parent re-render/remount
    }, [redrawCanvas])

    const handleClear = useCallback(() => {
      setStrokes([])
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = ERASER_COLOR
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      notifyChange()
    }, [notifyChange])

    const handleEraserToggle = useCallback(() => {
      setIsEraser(prev => !prev)
      setStickerMode(null)
      setMagicBrushMode('normal')
    }, [])

    // ─── Imperative Handle (exposed to parent via ref) ─────────────────────
    useImperativeHandle(ref, () => ({
      getImageData: () => {
        const canvas = canvasRef.current
        if (!canvas) return ''
        return canvas.toDataURL('image/png')
      },
      clear: handleClear,
    }), [handleClear])

    return (
      <div className="flex flex-col gap-3" data-testid="drawing-canvas-container">
        {title && (
          <h2 className="text-2xl font-bold text-purple-700 text-center">{title}</h2>
        )}

        {/* Canvas Area - responsive: fills container width on tablet, respects min on desktop */}
        <div className="flex justify-center w-full">
          <div className="bg-white rounded-2xl overflow-hidden shadow-lg border-2 border-gray-200 w-full max-w-[900px]">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              data-testid="drawing-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`block w-full h-auto ${stickerMode ? 'cursor-cell' : 'cursor-crosshair'}`}
              style={{
                touchAction: 'none',
                aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
              }}
            />
          </div>
        </div>

        {/* Toolbar: Tools + Brush Size */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Magic Brush Selector */}
          <MagicBrushSelector
            currentMode={magicBrushMode}
            onModeSelect={(mode) => {
              setMagicBrushMode(mode)
              setStickerMode(null)
              if (mode !== 'normal') setIsEraser(false)
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sticker Palette */}
          <StickerPalette
            onStickerSelect={(sticker) => {
              setStickerMode(sticker)
              setIsEraser(false)
              setMagicBrushMode('normal')
            }}
            isOpen={showStickers}
            onToggle={() => setShowStickers(!showStickers)}
          />

          {/* Eraser Toggle */}
          <button
            onClick={handleEraserToggle}
            data-testid="eraser-btn"
            aria-label="Eraser tool"
            aria-pressed={isEraser}
            className={`flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors
              ${isEraser
                ? 'bg-orange-500 text-white ring-2 ring-orange-300'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            style={{ minWidth: '44px', minHeight: '44px', padding: '8px 16px' }}
          >
            <Eraser size={22} />
            <span className="hidden sm:inline">Eraser</span>
          </button>

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={strokes.length === 0}
            data-testid="undo-btn"
            aria-label="Undo last stroke"
            className="flex items-center justify-center gap-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ minWidth: '44px', minHeight: '44px', padding: '8px 16px' }}
          >
            <Undo size={22} />
            <span className="hidden sm:inline">Undo</span>
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            data-testid="clear-btn"
            aria-label="Clear canvas"
            className="flex items-center justify-center gap-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors"
            style={{ minWidth: '44px', minHeight: '44px', padding: '8px 16px' }}
          >
            <Trash2 size={22} />
            <span className="hidden sm:inline">Clear</span>
          </button>

          {/* Brush Size Slider */}
          <div className="flex items-center gap-2 ml-auto">
            <label htmlFor="brush-size" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Size: {brushSize}px
            </label>
            <input
              id="brush-size"
              type="range"
              min={MIN_BRUSH_SIZE}
              max={MAX_BRUSH_SIZE}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              data-testid="brush-size-slider"
              aria-label={`Brush size: ${brushSize} pixels`}
              className="w-32 h-2 accent-purple-500"
              style={{ minHeight: '44px' }}
            />
          </div>
        </div>

        {/* Color Palette - Colored Circles */}
        <div className="pencil-picker" role="radiogroup" aria-label="Color palette">
          {COLOR_PALETTE.map((color, index) => (
            <button
              key={color}
              onClick={() => {
                setCurrentColor(color)
                setIsEraser(false)
              }}
              data-testid={`color-btn-${color}`}
              aria-label={`Select color ${color}`}
              aria-pressed={currentColor === color && !isEraser}
              role="radio"
              aria-checked={currentColor === color && !isEraser}
              className={`pencil-item ${
                currentColor === color && !isEraser ? 'selected' : ''
              }`}
              style={{ minWidth: '44px', minHeight: '44px' }}
              title={`Color ${index + 1}`}
            >
              <div
                className="w-8 h-8 rounded-full border-2 transition-all"
                style={{
                  backgroundColor: color,
                  borderColor: currentColor === color && !isEraser ? '#F97316' : '#e5e7eb',
                  transform: currentColor === color && !isEraser ? 'scale(1.2)' : 'scale(1)',
                  boxShadow: currentColor === color && !isEraser ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                }}
              />
            </button>
          ))}
        </div>
      </div>
    )
  }
)

export default DrawingCanvas
