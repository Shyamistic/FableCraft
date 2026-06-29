/**
 * Magic Brush rendering algorithms for the DrawingCanvas.
 * Each mode applies unique visual effects to canvas strokes.
 */

export type MagicBrushMode = 'normal' | 'rainbow' | 'sparkle' | 'glow' | 'neon'

const RAINBOW_COLORS = ['#FF0000', '#FF7700', '#FFDD00', '#00DD00', '#0088FF', '#8800FF', '#FF00FF']

/**
 * Renders a magic brush stroke segment between two points.
 */
export function renderMagicSegment(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  mode: MagicBrushMode,
  lineWidth: number,
  segmentIndex: number
): void {
  switch (mode) {
    case 'rainbow':
      renderRainbowSegment(ctx, from, to, lineWidth, segmentIndex)
      break
    case 'sparkle':
      renderSparkleSegment(ctx, from, to, lineWidth, segmentIndex)
      break
    case 'glow':
      renderGlowSegment(ctx, from, to, lineWidth)
      break
    case 'neon':
      renderNeonSegment(ctx, from, to, lineWidth)
      break
    default:
      // Normal drawing handled by existing canvas logic
      break
  }
}

function renderRainbowSegment(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  lineWidth: number,
  segmentIndex: number
): void {
  const colorIndex = segmentIndex % RAINBOW_COLORS.length
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.strokeStyle = RAINBOW_COLORS[colorIndex]
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
}

function renderSparkleSegment(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  lineWidth: number,
  segmentIndex: number
): void {
  // Draw golden base stroke
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.strokeStyle = '#FFD700'
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.stroke()

  // Add sparkle particles every few segments
  if (segmentIndex % 3 === 0) {
    const sparkleX = to.x + (Math.random() - 0.5) * 12
    const sparkleY = to.y + (Math.random() - 0.5) * 12
    const size = 2 + Math.random() * 3
    const hue = 30 + Math.random() * 30 // Gold range
    ctx.fillStyle = `hsla(${hue}, 100%, 70%, ${0.5 + Math.random() * 0.5})`
    ctx.beginPath()
    ctx.arc(sparkleX, sparkleY, size, 0, Math.PI * 2)
    ctx.fill()
  }
}

function renderGlowSegment(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  lineWidth: number
): void {
  ctx.save()
  ctx.shadowBlur = 15
  ctx.shadowColor = '#8B5CF6'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.strokeStyle = '#C084FC'
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.restore()
}

function renderNeonSegment(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  lineWidth: number
): void {
  // Outer glow
  ctx.save()
  ctx.shadowBlur = 20
  ctx.shadowColor = '#00FF88'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.strokeStyle = '#00FF88'
  ctx.lineWidth = lineWidth + 2
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()

  // Inner bright core
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = Math.max(1, lineWidth - 2)
  ctx.lineCap = 'round'
  ctx.stroke()
}

/**
 * Get the stroke color for the current magic brush mode (for history/undo).
 */
export function getMagicBrushColor(mode: MagicBrushMode): string {
  switch (mode) {
    case 'rainbow': return '#FF0000' // Placeholder — actual rendering is multi-color
    case 'sparkle': return '#FFD700'
    case 'glow': return '#C084FC'
    case 'neon': return '#00FF88'
    default: return '#000000'
  }
}
