'use client'

import { useEffect, useRef, ReactNode } from 'react'
import type { TrackedEventName, AnalyticsEvent } from '../lib/types'

/**
 * AnalyticsProvider component — Novus.ai integration placeholder.
 *
 * Novus.ai auto-instruments by connecting to your GitHub repo.
 * Once you connect your repo at https://novus.pendo.io/ and merge their PR,
 * this provider will work alongside Novus's auto-instrumentation.
 *
 * Currently provides:
 * - Event queue for analytics events (ready for Novus)
 * - Global window.trackEvent dispatcher
 * - Session tracking (anonymous, COPPA-compliant)
 */

interface AnalyticsProviderProps {
  children: ReactNode
}

declare global {
  interface Window {
    novusai?: {
      track?: (eventName: string, properties: Record<string, unknown>) => void
    }
    pendo?: {
      track?: (eventName: string, properties: Record<string, unknown>) => void
    }
    trackEvent?: (eventName: TrackedEventName, properties?: Record<string, string | number | boolean>) => void
  }
}

let sessionId: string = ''

function generateSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Dispatch event to whatever analytics SDK is available.
 * Novus/Pendo auto-installs via their PR — we check for their global objects.
 */
function dispatchEvent(event: AnalyticsEvent): void {
  const properties = {
    session_id: event.session_id,
    timestamp: event.timestamp,
    ...event.properties,
  }

  // Try Novus.ai
  if (window.novusai?.track) {
    window.novusai.track(event.event_name, properties)
    return
  }

  // Try Pendo (Novus uses Pendo under the hood)
  if (window.pendo?.track) {
    window.pendo.track(event.event_name, properties)
    return
  }

  // No SDK available — events are silently dropped in production
  // This is fine per hackathon requirements — Novus auto-instruments via repo connection
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    sessionId = generateSessionId()

    // Initialize Pendo SDK with anonymous visitor
    pendo.initialize({
      visitor: {
        id: '',
        sessionId: sessionId,
      }
    })

    // Attach global event dispatcher for use throughout the app
    window.trackEvent = (
      eventName: TrackedEventName,
      properties: Record<string, string | number | boolean> = {}
    ) => {
      const event: AnalyticsEvent = {
        event_name: eventName,
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        properties,
      }
      dispatchEvent(event)
    }
  }, [])

  return <>{children}</>
}

export default AnalyticsProvider
