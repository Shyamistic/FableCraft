'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { BRAND_COLORS } from '../lib/branding'

/**
 * LoadingOverlay displays a visible loading indicator for backend operations.
 *
 * Requirement 16.6: Loading indicators displayed within 1 second of request,
 * visible until completion or failure.
 *
 * Requirement 20.3: Functional on viewports 768px to 1920px.
 *
 * Validates: Requirements 16.6, 20.3
 */

export interface LoadingOverlayProps {
  /** Whether the loading state is active */
  isLoading: boolean
  /** Optional message to display below the spinner */
  message?: string
  /** Whether to show as a full-screen overlay or inline */
  variant?: 'overlay' | 'inline'
  /** Maximum delay before showing the indicator (ms). Defaults to 0 (immediate). */
  showDelay?: number
}

export default function LoadingOverlay({
  isLoading,
  message = 'Loading...',
  variant = 'inline',
  showDelay = 0,
}: LoadingOverlayProps) {
  const [visible, setVisible] = useState(showDelay === 0)

  useEffect(() => {
    if (!isLoading) {
      setVisible(false)
      return
    }

    if (showDelay === 0) {
      setVisible(true)
      return
    }

    // Show indicator after delay (always within 1 second per Req 16.6)
    const timer = setTimeout(() => {
      setVisible(true)
    }, Math.min(showDelay, 1000))

    return () => clearTimeout(timer)
  }, [isLoading, showDelay])

  if (!isLoading || !visible) return null

  if (variant === 'overlay') {
    return (
      <div
        className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        role="status"
        aria-live="polite"
        aria-label={message}
        data-testid="loading-overlay"
      >
        <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-4 max-w-sm w-full">
          <Loader2
            size={48}
            className="animate-spin"
            style={{ color: BRAND_COLORS.primary }}
          />
          <p
            className="text-lg font-semibold text-center"
            style={{ color: BRAND_COLORS.tertiary }}
          >
            {message}
          </p>
        </div>
      </div>
    )
  }

  // Inline variant
  return (
    <div
      className="loading-indicator flex-col gap-3 py-8"
      role="status"
      aria-live="polite"
      aria-label={message}
      data-testid="loading-indicator"
    >
      <Loader2
        size={40}
        className="animate-spin"
        style={{ color: BRAND_COLORS.primary }}
      />
      <p
        className="text-base font-medium text-center"
        style={{ color: BRAND_COLORS.tertiary }}
      >
        {message}
      </p>
    </div>
  )
}
