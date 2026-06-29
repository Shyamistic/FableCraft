'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ParentStats, CompletedQuest, Genre } from '../lib/types'
import { BRAND_COLORS } from '../lib/branding'
import {
  MAX_RECENT_QUESTS,
  PARENT_PIN_LENGTH,
  MAX_PIN_ATTEMPTS,
  PIN_LOCKOUT_DURATION_SECONDS,
} from '../lib/constants'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Formats total minutes into hours and minutes string (e.g. "2h 5m").
 * If total is 0, returns "0m".
 * Requirements: 11.5
 */
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

/** Genre display labels. */
const GENRE_LABELS: Record<Genre, string> = {
  fantasy_kingdom: 'Fantasy Kingdom',
  outer_space: 'Outer Space',
  underwater_world: 'Underwater World',
  jungle_safari: 'Jungle Safari',
}

// ─── Component Props ─────────────────────────────────────────────────────────

interface ParentDashboardProps {
  /** The correct 4-digit PIN set by the parent. */
  pin: string
  /** Stats aggregated from session data. */
  stats: ParentStats
  /** Recent completed quests, newest-first. */
  recentQuests: CompletedQuest[]
  /** Called when the dashboard is closed. */
  onClose: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * ParentDashboard is a PIN-protected panel showing child progress.
 * It displays aggregated stats (quests completed, unique lessons, coins,
 * characters created, time spent) and lists up to 50 recent quests.
 *
 * Access is gated by a 4-digit numeric PIN entry with lockout after
 * 5 consecutive incorrect attempts for 60 seconds.
 *
 * Accessible via a settings icon in the top corner (reduced size).
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
export default function ParentDashboard({
  pin,
  stats,
  recentQuests,
  onClose,
}: ParentDashboardProps) {
  const [authenticated, setAuthenticated] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [lockoutRemaining, setLockoutRemaining] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    if (!authenticated && inputRef.current) {
      inputRef.current.focus()
    }
  }, [authenticated])

  // Lockout countdown timer
  useEffect(() => {
    if (lockedUntil === null) return

    const tick = () => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockedUntil(null)
        setLockoutRemaining(0)
        setAttempts(0)
        setError('')
      } else {
        setLockoutRemaining(remaining)
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  const isLockedOut = lockedUntil !== null && Date.now() < lockedUntil

  const handlePinSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()

      if (isLockedOut) return

      // Accept the input if it matches the stored PIN, or '1234' if no PIN is set
      const validPin = pin || '1234'
      if (pinInput === validPin) {
        setAuthenticated(true)
        setError('')
        setAttempts(0)
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        setPinInput('')

        if (newAttempts >= MAX_PIN_ATTEMPTS) {
          setLockedUntil(Date.now() + PIN_LOCKOUT_DURATION_SECONDS * 1000)
          setError('Too many tries! Wait a minute and try again.')
        } else {
          setError('Incorrect PIN. Please try again.')
        }
      }
    },
    [pinInput, pin, attempts, isLockedOut]
  )

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, PARENT_PIN_LENGTH)
    setPinInput(value)
  }

  // Compute total time from session durations
  const totalMinutes = stats.session_durations.reduce(
    (sum, s) => sum + s.duration_minutes,
    0
  )

  // Cap recent quests at 50, sorted newest-first (should already be sorted)
  const displayedQuests = recentQuests.slice(0, MAX_RECENT_QUESTS)

  // ─── PIN Entry Screen ────────────────────────────────────────────────────────

  if (!authenticated) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        role="dialog"
        aria-modal="true"
        aria-label="Parent Dashboard PIN Entry"
      >
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800">Parent Dashboard</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              ✕
            </button>
          </div>

          <form onSubmit={handlePinSubmit}>
            <label
              htmlFor="pin-input"
              className="block text-sm font-medium text-gray-600 mb-2"
            >
              Enter your 4-digit PIN
            </label>
            <input
              ref={inputRef}
              id="pin-input"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={PARENT_PIN_LENGTH}
              value={pinInput}
              onChange={handlePinChange}
              disabled={isLockedOut}
              className={`
                w-full text-center text-2xl tracking-widest py-3 px-4
                border-2 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-offset-2
                ${isLockedOut
                  ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 focus:border-purple-400 focus:ring-purple-200'
                }
              `}
              aria-describedby={error ? 'pin-error' : undefined}
              aria-invalid={error ? 'true' : 'false'}
            />

            {error && (
              <p
                id="pin-error"
                className="mt-3 text-sm text-center"
                style={{ color: BRAND_COLORS.error }}
                role="alert"
              >
                {error}
                {isLockedOut && (
                  <span className="block mt-1 font-medium">
                    {lockoutRemaining}s remaining
                  </span>
                )}
              </p>
            )}

            <button
              type="submit"
              disabled={isLockedOut || pinInput.length < PARENT_PIN_LENGTH}
              className={`
                mt-4 w-full py-3 rounded-xl font-bold text-white
                transition-all duration-200
                ${isLockedOut || pinInput.length < PARENT_PIN_LENGTH
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'hover:opacity-90 active:scale-95'
                }
              `}
              style={{
                backgroundColor:
                  isLockedOut || pinInput.length < PARENT_PIN_LENGTH
                    ? undefined
                    : BRAND_COLORS.tertiary,
                minWidth: '44px',
                minHeight: '44px',
              }}
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── Dashboard Content ───────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Parent Dashboard"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-800">Parent Dashboard</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close dashboard"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <StatCard
              label="Quests Completed"
              value={stats.quests_completed}
              emoji="📚"
            />
            <StatCard
              label="Unique Lessons"
              value={stats.unique_lessons.length}
              emoji="🎯"
            />
            <StatCard
              label="Total Coins"
              value={stats.total_coins}
              emoji="⭐"
            />
            <StatCard
              label="Characters Created"
              value={stats.characters_created}
              emoji="🎨"
            />
            <StatCard
              label="Time Spent"
              value={formatDuration(totalMinutes)}
              emoji="⏱️"
            />
          </div>

          {/* Recent Quests */}
          <h3 className="text-lg font-bold text-gray-700 mb-4">
            Recent Quests
          </h3>

          {displayedQuests.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No quests completed yet. Time to start an adventure!
            </p>
          ) : (
            <ul className="space-y-3" aria-label="Recent completed quests">
              {displayedQuests.map((quest) => (
                <li
                  key={`${quest.quest_id}-${quest.completed_at}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
                >
                  {/* Character thumbnail */}
                  <img
                    src={quest.character_thumbnail}
                    alt={`${quest.character_name} thumbnail`}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).src =
                        '/placeholder-character.svg'
                    }}
                  />

                  {/* Quest details */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">
                      {quest.lesson}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {GENRE_LABELS[quest.genre]} · {quest.character_name}
                    </p>
                  </div>

                  {/* Date */}
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatDate(quest.completed_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  emoji,
}: {
  label: string
  value: string | number
  emoji: string
}) {
  return (
    <div className="flex flex-col items-center p-4 rounded-xl bg-gray-50 border border-gray-100">
      <span className="text-2xl mb-1" aria-hidden="true">
        {emoji}
      </span>
      <span className="text-xl font-bold text-gray-800">{value}</span>
      <span className="text-xs text-gray-500 text-center">{label}</span>
    </div>
  )
}

/** Formats ISO date string to a short human-readable date. */
function formatDate(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

// ─── Settings Icon Trigger ───────────────────────────────────────────────────

interface SettingsIconProps {
  /** Called when the settings icon is clicked to open the dashboard. */
  onClick: () => void
}

/**
 * A small settings gear icon placed in the top corner.
 * Rendered at reduced size so it's not prominent to children.
 * Requirements: 11.6
 */
export function ParentDashboardTrigger({ onClick }: SettingsIconProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed top-3 right-3 z-40 p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 opacity-60 hover:opacity-100"
      aria-label="Open parent dashboard"
      title="Parent Dashboard"
      style={{ minWidth: '44px', minHeight: '44px' }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  )
}
