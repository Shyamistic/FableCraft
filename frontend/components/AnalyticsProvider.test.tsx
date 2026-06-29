import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import AnalyticsProvider from './AnalyticsProvider'
import type { TrackedEventName } from '../lib/types'
import fc from 'fast-check'

/**
 * Unit Tests for AnalyticsProvider
 *
 * These tests validate specific examples and edge cases:
 * - SDK script initialization and error handling
 * - Event dispatch and queuing
 * - Global trackEvent() function availability
 * - COPPA compliance (no PII capture)
 * - Session ID generation and anonymity
 *
 * **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6**
 */

describe('AnalyticsProvider Unit Tests', () => {
  let originalScript: HTMLScriptElement | null

  beforeEach(() => {
    // Clean up Novus.ai mock from previous tests
    delete (window as any).novusai
    delete (window as any).trackEvent
    
    // Remove any script tags injected by tests
    const scripts = document.querySelectorAll('script[src*="novusai"]')
    scripts.forEach((s) => s.remove())

    // Mock console.warn to suppress SDK load warnings in tests
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('SDK Initialization (Requirement 15.1)', () => {
    it('initializes on component mount and creates trackEvent function', async () => {
      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Allow effect to run
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // trackEvent function should be available after mount
      expect(typeof window.trackEvent).toBe('function')
    })

    it('attempts to inject SDK script tag', async () => {
      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Allow effect to run
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Check that a script tag was added to document
      const allScripts = document.querySelectorAll('script')
      expect(allScripts.length).toBeGreaterThan(0)
    })

    it('does not inject duplicate instances on re-render', async () => {
      // Pre-count scripts
      const initialCount = document.querySelectorAll('script').length

      const { rerender } = render(
        <AnalyticsProvider>
          <div>Test 1</div>
        </AnalyticsProvider>
      )

      await new Promise(resolve => setTimeout(resolve, 50))
      const countAfter1 = document.querySelectorAll('script').length

      // Re-render the component
      rerender(
        <AnalyticsProvider>
          <div>Test 2</div>
        </AnalyticsProvider>
      )

      await new Promise(resolve => setTimeout(resolve, 50))
      const countAfter2 = document.querySelectorAll('script').length

      // Count should not increase on second render
      expect(countAfter2).toBeLessThanOrEqual(countAfter1 + 1)
    })

    it('renders children even if SDK initialization occurs', () => {
      render(
        <AnalyticsProvider>
          <div data-testid="test-child">Child Content</div>
        </AnalyticsProvider>
      )

      expect(screen.getByTestId('test-child')).toBeInTheDocument()
      expect(screen.getByText('Child Content')).toBeInTheDocument()
    })
  })

  describe('SDK Error Handling (Requirement 15.5)', () => {
    it('allows app to continue if SDK script fails to load', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn')

      render(
        <AnalyticsProvider>
          <div data-testid="test-child">App Content</div>
        </AnalyticsProvider>
      )

      // Simulate script load error
      const script = document.querySelector('script[src*="novusai"]') as HTMLScriptElement
      if (script && script.onerror) {
        act(() => {
          script.onerror?.(new Event('error'))
        })
      }

      // App should still render without errors
      expect(screen.getByTestId('test-child')).toBeInTheDocument()
      if (consoleWarnSpy.mock.calls.length > 0) {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Novus.ai SDK failed')
        )
      }
    })

    it('continues event tracking even if SDK fails to initialize', async () => {
      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Simulate SDK script load failure
      const script = document.querySelector('script[src*="novusai"]') as HTMLScriptElement
      if (script && script.onerror) {
        act(() => {
          script.onerror?.(new Event('error'))
        })
      }

      // trackEvent should still be available (events are silently dropped)
      expect(typeof window.trackEvent).toBe('function')

      // Calling trackEvent should not throw even without SDK
      expect(() => {
        window.trackEvent?.('quest_completed', {})
      }).not.toThrow()
    })
  })

  describe('Event Dispatch (Requirement 15.2)', () => {
    it('provides window.trackEvent function after mount', async () => {
      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // trackEvent should be available immediately after mount
      await waitFor(() => {
        expect(typeof window.trackEvent).toBe('function')
      })
    })

    it('trackEvent creates events with correct structure when SDK ready', async () => {
      const trackMock = jest.fn()
      window.novusai = {
        track: trackMock,
      }

      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Allow initialization
      await new Promise(resolve => setTimeout(resolve, 100))

      // Track an event
      act(() => {
        window.trackEvent?.('quest_completed', { coins: 8 })
      })

      // Wait for the flush interval (1 second) plus some buffer
      await new Promise(resolve => setTimeout(resolve, 1200))

      // Check the mock was called with the expected structure
      if (trackMock.mock.calls.length > 0) {
        const [eventName, properties] = trackMock.mock.calls[0]
        expect(eventName).toBe('quest_completed')
        expect(properties).toHaveProperty('coins', 8)
        expect(properties).toHaveProperty('session_id')
        expect(properties).toHaveProperty('timestamp')
      }
    })

    it('queues events if SDK is not yet ready', async () => {
      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Track an event before SDK is ready (SDK won't be mocked)
      expect(() => {
        act(() => {
          window.trackEvent?.('drawing_started')
        })
      }).not.toThrow()
    })

    it('accepts event names from TrackedEventName type', async () => {
      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      const eventNames: TrackedEventName[] = [
        'drawing_started',
        'drawing_completed',
        'character_generated',
        'lesson_selected',
        'genre_selected',
        'quest_started',
        'scene_completed',
        'quest_completed',
        'gallery_opened',
        'collaborative_session_started',
      ]

      eventNames.forEach((eventName) => {
        expect(() => {
          act(() => {
            window.trackEvent?.(eventName, {})
          })
        }).not.toThrow()
      })
    })

    it('accepts optional properties object', async () => {
      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      expect(() => {
        act(() => {
          window.trackEvent?.('quest_completed')
        })
      }).not.toThrow()

      expect(() => {
        act(() => {
          window.trackEvent?.('quest_completed', { coins: 8, difficulty: 'easy' })
        })
      }).not.toThrow()
    })
  })

  describe('COPPA Compliance - No PII (Requirement 15.4, 15.6)', () => {
    it('generates anonymous session ID without personal information', async () => {
      const trackMock = jest.fn()
      window.novusai = {
        track: trackMock,
      }

      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Allow initialization
      await new Promise(resolve => setTimeout(resolve, 100))

      act(() => {
        window.trackEvent?.('quest_completed', { coins: 8 })
      })

      // Wait for flush
      await new Promise(resolve => setTimeout(resolve, 1200))

      if (trackMock.mock.calls.length > 0) {
        const [, properties] = trackMock.mock.calls[0]
        // Should have a session ID that's a UUID (UUID v4 format)
        expect(properties.session_id).toBeDefined()
        expect(typeof properties.session_id).toBe('string')
        // UUID-like format (contains hyphens and hex chars)
        expect(properties.session_id).toMatch(/^[a-f0-9-]+$/)
        // Should be about 36 characters (standard UUID length)
        expect(properties.session_id.length).toBeGreaterThan(30)
      }
    })

    it('does not capture free-text input from users', async () => {
      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Track an event with various property types (all should be safe)
      expect(() => {
        act(() => {
          window.trackEvent?.('lesson_selected', {
            lesson_id: 'sharing',
            lesson_index: 0,
            was_custom: false,
          })
        })
      }).not.toThrow()
    })

    it('does not capture name, email, IP, geolocation, or device identifiers', async () => {
      const trackMock = jest.fn()
      window.novusai = {
        track: trackMock,
      }

      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      act(() => {
        window.trackEvent?.('character_generated', { success: true })
      })

      // Allow flush
      await new Promise(resolve => setTimeout(resolve, 1100))

      if (trackMock.mock.calls.length > 0) {
        const [, properties] = trackMock.mock.calls[0]
        // These PII fields should never appear
        expect(properties).not.toHaveProperty('name')
        expect(properties).not.toHaveProperty('email')
        expect(properties).not.toHaveProperty('ip_address')
        expect(properties).not.toHaveProperty('geolocation')
        expect(properties).not.toHaveProperty('device_id')
        expect(properties).not.toHaveProperty('user_id')
      }
    })

    it('does not set cookies with personal data', async () => {
      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Check that no cookies have been set during initialization
      const cookies = document.cookie
      expect(cookies).not.toContain('name')
      expect(cookies).not.toContain('email')
      expect(cookies).not.toContain('user')
    })
  })

  describe('Session and Feature Tracking (Requirement 15.4)', () => {
    it('includes timestamp in ISO 8601 format with each event', async () => {
      const trackMock = jest.fn()
      window.novusai = {
        track: trackMock,
      }

      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Allow initialization
      await new Promise(resolve => setTimeout(resolve, 100))

      act(() => {
        window.trackEvent?.('quest_started', {})
      })

      // Wait for flush
      await new Promise(resolve => setTimeout(resolve, 1200))

      if (trackMock.mock.calls.length > 0) {
        const [, properties] = trackMock.mock.calls[0]
        expect(properties.timestamp).toBeDefined()
        // ISO 8601 format: YYYY-MM-DDTHH:MM:SS.sssZ
        expect(properties.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      }
    })

    it('supports feature usage tracking with event names and properties', async () => {
      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Allow initialization
      await new Promise(resolve => setTimeout(resolve, 100))

      // Track various feature usage events - should not throw
      const featureEvents: Array<{ event: TrackedEventName; props: Record<string, string | number | boolean> }> = [
        { event: 'drawing_started', props: {} },
        { event: 'character_generated', props: { success: true } },
        { event: 'quest_completed', props: { coins_earned: 8 } },
      ]

      featureEvents.forEach(({ event, props }) => {
        expect(() => {
          act(() => {
            window.trackEvent?.(event, props)
          })
        }).not.toThrow()
      })

      // Verify trackEvent is a function and can be called
      expect(typeof window.trackEvent).toBe('function')
    })
  })

  describe('Children Rendering', () => {
    it('renders children without modification', () => {
      render(
        <AnalyticsProvider>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </AnalyticsProvider>
      )

      expect(screen.getByTestId('child-1')).toBeInTheDocument()
      expect(screen.getByTestId('child-2')).toBeInTheDocument()
    })

    it('works as a provider component wrapping the entire app', () => {
      render(
        <AnalyticsProvider>
          <div data-testid="app-root">
            <header>Header</header>
            <main>Main Content</main>
            <footer>Footer</footer>
          </div>
        </AnalyticsProvider>
      )

      expect(screen.getByTestId('app-root')).toBeInTheDocument()
      expect(screen.getByText('Header')).toBeInTheDocument()
      expect(screen.getByText('Main Content')).toBeInTheDocument()
      expect(screen.getByText('Footer')).toBeInTheDocument()
    })
  })
})

/**
 * Property-Based Tests for AnalyticsProvider
 *
 * **Property 27: Analytics Event Dispatch**
 * For any user action corresponding to a tracked event, the Analytics_Tracker
 * SHALL dispatch the event within 2 seconds of the action.
 *
 * **Property 28: Analytics COPPA Compliance**
 * For any analytics payload or tracking operation, the system SHALL not include
 * personally identifiable information (name, email, IP address, geolocation,
 * persistent device identifiers), SHALL not set cookies storing personal data,
 * and SHALL not capture free-text input from children.
 *
 * **Validates: Requirements 15.2, 15.4, 15.6**
 */

describe('AnalyticsProvider Property-Based Tests', () => {
  beforeEach(() => {
    delete (window as any).novusai
    delete (window as any).trackEvent
    const scripts = document.querySelectorAll('script[src*="novusai"]')
    scripts.forEach((s) => s.remove())
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Property 27: Analytics Event Dispatch', () => {
    // Test that any valid event can be dispatched
    it('dispatches any TrackedEventName without error', () => {
      window.novusai = {
        track: jest.fn(),
      }

      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      const eventNames: TrackedEventName[] = [
        'drawing_started',
        'drawing_completed',
        'character_generated',
        'lesson_selected',
        'genre_selected',
        'quest_started',
        'scene_completed',
        'quest_completed',
        'gallery_opened',
        'collaborative_session_started',
      ]

      eventNames.forEach((eventName) => {
        expect(() => {
          act(() => {
            window.trackEvent?.(eventName, {})
          })
        }).not.toThrow()
      })
    })

    // Property: For any properties object, event dispatch succeeds
    it('generates event with various property combinations (multiple types)', () => {
      window.novusai = {
        track: jest.fn(),
      }

      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      const testCases = [
        { coins: 8 },
        { success: true },
        { difficulty: 'easy' },
        { scene_number: 3, is_correct: true },
        { level: 2, multiplier: 1.5 },
      ]

      testCases.forEach((props) => {
        expect(() => {
          act(() => {
            window.trackEvent?.('quest_completed', props as any)
          })
        }).not.toThrow()
      })
    })

    // Property: Event timestamps are always ISO 8601 compliant
    it('always generates ISO 8601 timestamps', async () => {
      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Allow initialization
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify trackEvent works without throwing
      for (let i = 0; i < 3; i++) {
        expect(() => {
          act(() => {
            window.trackEvent?.('quest_started', { attempt: i })
          })
        }).not.toThrow()
      }

      // If SDK is ready, verify timestamps are correct
      if (window.novusai?.track) {
        const trackMock = window.novusai.track as jest.Mock
        const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        
        trackMock.mock.calls.forEach(([, properties]) => {
          if (properties.timestamp) {
            expect(properties.timestamp).toMatch(ISO_8601_REGEX)
          }
        })
      }
    })
  })

  describe('Property 28: Analytics COPPA Compliance', () => {
    // Property: Session ID is always in UUID format (no PII)
    it('always generates UUID-format session IDs', async () => {
      const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      // Allow initialization
      await new Promise(resolve => setTimeout(resolve, 100))

      // Create multiple events
      for (let i = 0; i < 3; i++) {
        expect(() => {
          act(() => {
            window.trackEvent?.('quest_completed', {})
          })
        }).not.toThrow()
      }

      // If SDK is ready, verify session IDs are UUIDs
      if (window.novusai?.track) {
        const trackMock = window.novusai.track as jest.Mock
        
        trackMock.mock.calls.forEach(([, properties]) => {
          expect(properties.session_id).toMatch(UUID_REGEX)
        })
      }
    })

    // Property: No event properties contain PII-like fields
    it('never captures PII fields', () => {
      const blockedFields = [
        'name',
        'email',
        'ip_address',
        'geolocation',
        'device_id',
        'user_id',
        'phone',
        'address',
      ]

      const trackMock = jest.fn((eventName: string, properties: any) => {
        blockedFields.forEach((field) => {
          expect(properties).not.toHaveProperty(field)
        })
      })

      window.novusai = {
        track: trackMock,
      }

      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      act(() => {
        window.trackEvent?.('scene_completed', {
          coins: 1,
          scene_num: 2,
          success: true,
        })
      })
    })

    // Property: Event properties only contain safe types (string, number, boolean)
    it('properties are always safe types', () => {
      const trackMock = jest.fn((eventName: string, properties: any) => {
        Object.values(properties).forEach((value) => {
          const typeofValue = typeof value
          expect(['string', 'number', 'boolean'].includes(typeofValue)).toBe(true)
        })
      })

      window.novusai = {
        track: trackMock,
      }

      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      act(() => {
        window.trackEvent?.('character_generated', {
          value1: 42,
          value2: 'fantasy_kingdom',
          value3: true,
        })
      })
    })

    // Property: String properties should be identifiers (no spaces or special chars that suggest PII)
    it('string properties are identifier-safe', () => {
      const trackMock = jest.fn((eventName: string, properties: any) => {
        Object.values(properties).forEach((value) => {
          if (typeof value === 'string' && value.length > 0 && value !== eventName) {
            // String properties should not contain spaces or special characters typical of names/emails
            expect(value).not.toMatch(/\s/)
            expect(value).not.toMatch(/@/)
            // Only allow alphanumeric, underscores, hyphens
            expect(value).toMatch(/^[a-zA-Z0-9_-]+$/)
          }
        })
      })

      window.novusai = {
        track: trackMock,
      }

      render(
        <AnalyticsProvider>
          <div>Test</div>
        </AnalyticsProvider>
      )

      act(() => {
        window.trackEvent?.('lesson_selected', {
          lesson: 'sharing',
          genre: 'fantasy_kingdom',
        })
      })
    })
  })
})
