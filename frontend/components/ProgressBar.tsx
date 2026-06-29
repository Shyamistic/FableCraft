'use client'

import { BRAND_COLORS } from '../lib/branding'

/**
 * Props for the ProgressBar component.
 */
export interface ProgressBarProps {
  /** Total number of scenes in the quest (always 8). */
  totalScenes: number
  /** The current scene number (1-indexed). */
  currentScene: number
  /** Array of scene numbers (1-indexed) that have been completed. */
  completedScenes: number[]
  /** Running total of star coins earned so far. */
  coinsEarned: number
}

/**
 * ProgressBar displays quest progress and star coin counter.
 *
 * Requirements:
 * - 8.5: Show which scenes are completed and the current scene number out of total scenes.
 * - 8.6: Show a running star coin counter (current/8) visible on every scene.
 */
export default function ProgressBar({
  totalScenes,
  currentScene,
  completedScenes,
  coinsEarned,
}: ProgressBarProps) {
  return (
    <div
      className="flex items-center justify-between w-full px-4 py-3 rounded-2xl"
      style={{ backgroundColor: '#FAF5FF' }}
      role="region"
      aria-label="Quest progress"
    >
      {/* Scene progress indicator */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700 mr-2" aria-live="polite">
          Scene {currentScene} of {totalScenes}
        </span>
        <div className="flex gap-1.5" role="list" aria-label="Scene completion status">
          {Array.from({ length: totalScenes }, (_, i) => {
            const sceneNumber = i + 1
            const isCompleted = completedScenes.includes(sceneNumber)
            const isCurrent = sceneNumber === currentScene

            return (
              <div
                key={sceneNumber}
                role="listitem"
                aria-label={`Scene ${sceneNumber}${isCompleted ? ', completed' : isCurrent ? ', current' : ''}`}
                className={`
                  rounded-full transition-all duration-300
                  ${isCurrent
                    ? 'w-7 h-3'
                    : 'w-3 h-3'
                  }
                `}
                style={{
                  backgroundColor: isCompleted
                    ? BRAND_COLORS.success
                    : isCurrent
                    ? BRAND_COLORS.tertiary
                    : '#D1D5DB',
                }}
              />
            )
          })}
        </div>
      </div>

      {/* Star coin counter */}
      <div
        className="flex items-center gap-2 px-4 py-1.5 rounded-full font-bold"
        style={{ backgroundColor: BRAND_COLORS.secondary, color: '#92400E' }}
        role="status"
        aria-label={`${coinsEarned} of ${totalScenes} star coins earned`}
        aria-live="polite"
      >
        <span className="text-lg" aria-hidden="true">⭐</span>
        <span className="text-base">{coinsEarned} / {totalScenes}</span>
      </div>
    </div>
  )
}
