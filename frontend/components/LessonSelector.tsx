'use client'

import { useState, useCallback, useRef } from 'react'
import {
  LESSONS,
  CUSTOM_LESSON_MIN_LENGTH,
  CUSTOM_LESSON_MAX_LENGTH,
} from '../lib/constants'
import type { LessonOption } from '../lib/constants'
import { BRAND_COLORS } from '../lib/branding'

interface LessonSelectorProps {
  /** Called when a lesson is confirmed (predefined or validated custom). */
  onLessonSelected: (lesson: string) => void
  /** Session ID used for custom lesson validation API call. */
  sessionId: string
  /** Optionally pre-select a lesson by id. */
  initialLesson?: string | null
}

/**
 * LessonSelector displays 12+ predefined lesson cards with emojis and
 * provides a custom lesson input with server-side validation.
 *
 * - Predefined lessons: tapping a card highlights it and proceeds within 2s.
 * - Custom lessons: validated via POST /api/lessons/validate before proceeding.
 * - Validation failures show child-friendly message and redirect to predefined lessons.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
export default function LessonSelector({
  onLessonSelected,
  sessionId,
  initialLesson = null,
}: LessonSelectorProps) {
  const [selectedLesson, setSelectedLesson] = useState<string | null>(initialLesson)
  const [customLesson, setCustomLesson] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [showCustomInput, setShowCustomInput] = useState(false)

  // Timer ref for the 2-second auto-proceed on predefined selection
  const proceedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Handle predefined lesson card tap.
   * Highlights the card and proceeds (calls onLessonSelected) within 2 seconds.
   * Requirement 4.2: highlight + proceed within 2 seconds.
   */
  const handlePredefinedSelect = useCallback(
    (lesson: LessonOption) => {
      // Clear any pending proceed timer
      if (proceedTimerRef.current) {
        clearTimeout(proceedTimerRef.current)
      }

      setSelectedLesson(lesson.id)
      setValidationError(null)

      // Proceed within 2 seconds (using 1.5s for a smooth UX)
      proceedTimerRef.current = setTimeout(() => {
        onLessonSelected(lesson.id)
      }, 1500)
    },
    [onLessonSelected],
  )

  /**
   * Validate and submit a custom lesson via /api/lessons/validate.
   * Requirements 4.3, 4.4, 4.5, 4.6
   */
  const handleCustomLessonSubmit = useCallback(async () => {
    const trimmed = customLesson.trim()

    // Client-side length validation (Requirement 4.3)
    if (trimmed.length < CUSTOM_LESSON_MIN_LENGTH || trimmed.length > CUSTOM_LESSON_MAX_LENGTH) {
      setValidationError(
        `Your lesson idea needs to be between ${CUSTOM_LESSON_MIN_LENGTH} and ${CUSTOM_LESSON_MAX_LENGTH} characters. Try making it a bit longer or shorter!`,
      )
      return
    }

    setIsValidating(true)
    setValidationError(null)

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/lessons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_lesson: trimmed,
          session_id: sessionId,
        }),
      })

      if (!response.ok) {
        // Requirement 4.6: LLM_Router timeout or error → show retry + predefined option
        setValidationError(
          "Oops! We couldn't check your lesson idea right now. Please try again or pick one of the fun lessons below!",
        )
        setIsValidating(false)
        return
      }

      const data = await response.json()

      if (data.is_appropriate) {
        // Validated successfully — proceed with sanitized lesson
        setSelectedLesson('custom')
        onLessonSelected(data.sanitized_lesson || trimmed)
      } else {
        // Requirement 4.5: not age-appropriate → child-friendly message + redirect to predefined
        setValidationError(
          "Let's pick a different topic! How about one of the fun lessons below?",
        )
      }
    } catch {
      // Requirement 4.6: network/timeout failure → show retry + predefined option
      setValidationError(
        "Oops! We couldn't check your lesson idea right now. Please try again or pick one of the fun lessons below!",
      )
    } finally {
      setIsValidating(false)
    }
  }, [customLesson, sessionId, onLessonSelected])

  return (
    <div className="w-full space-y-6">
      {/* Predefined Lesson Cards Grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        role="radiogroup"
        aria-label="Choose a life lesson"
      >
        {LESSONS.map((lesson) => {
          const isSelected = selectedLesson === lesson.id

          return (
            <button
              key={lesson.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${lesson.title}: ${lesson.description}`}
              onClick={() => handlePredefinedSelect(lesson)}
              className={`
                relative flex flex-col items-center justify-center
                rounded-2xl border-2 p-4
                cursor-pointer select-none
                transition-all duration-300 ease-out
                focus:outline-none focus:ring-2 focus:ring-offset-2
                ${
                  isSelected
                    ? 'border-orange-400 bg-orange-50 scale-105 shadow-lg shadow-orange-200'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                }
              `}
              style={{
                minWidth: '48px',
                minHeight: '48px',
                ...(isSelected
                  ? {
                      borderColor: BRAND_COLORS.primary,
                      boxShadow: `0 4px 20px ${BRAND_COLORS.primary}33`,
                    }
                  : {}),
              }}
            >
              {/* Lesson emoji */}
              <span
                className={`text-4xl mb-2 transition-transform duration-300 ${
                  isSelected ? 'scale-110' : ''
                }`}
                aria-hidden="true"
              >
                {lesson.emoji}
              </span>

              {/* Lesson title */}
              <span
                className={`text-sm font-bold text-center leading-tight mb-1 transition-colors duration-200 ${
                  isSelected ? 'text-orange-700' : 'text-gray-700'
                }`}
              >
                {lesson.title}
              </span>

              {/* Lesson description */}
              <span
                className={`text-xs text-center leading-tight transition-colors duration-200 ${
                  isSelected ? 'text-orange-600' : 'text-gray-500'
                }`}
              >
                {lesson.description}
              </span>

              {/* Selection indicator */}
              {isSelected && (
                <span
                  className="absolute top-2 right-2 flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold"
                  style={{ backgroundColor: BRAND_COLORS.primary }}
                  aria-hidden="true"
                >
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Custom Lesson Input Section */}
      <div className="border-t border-gray-200 pt-4">
        {!showCustomInput ? (
          <button
            type="button"
            onClick={() => setShowCustomInput(true)}
            className="text-sm font-medium transition-colors duration-200 hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 rounded px-3 py-2"
            style={{ color: BRAND_COLORS.tertiary, minWidth: '44px', minHeight: '44px' }}
          >
            ✏️ Or type your own lesson idea...
          </button>
        ) : (
          <div className="space-y-3">
            <label
              htmlFor="custom-lesson-input"
              className="block text-sm font-medium text-gray-700"
            >
              Type your own lesson idea:
            </label>
            <div className="flex gap-2">
              <input
                id="custom-lesson-input"
                type="text"
                value={customLesson}
                onChange={(e) => {
                  setCustomLesson(e.target.value)
                  setValidationError(null)
                }}
                placeholder="e.g. Learning to share with my little brother"
                maxLength={CUSTOM_LESSON_MAX_LENGTH}
                aria-describedby="custom-lesson-hint custom-lesson-error"
                className={`
                  flex-1 px-4 py-3 rounded-xl border-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-offset-1
                  transition-colors duration-200
                  ${validationError ? 'border-rose-300 focus:ring-rose-200' : 'border-gray-200 focus:ring-purple-200 focus:border-purple-400'}
                `}
                disabled={isValidating}
              />
              <button
                type="button"
                onClick={handleCustomLessonSubmit}
                disabled={isValidating || customLesson.trim().length < CUSTOM_LESSON_MIN_LENGTH}
                aria-label="Submit custom lesson"
                className={`
                  px-5 py-3 rounded-xl text-white text-sm font-bold
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-offset-2
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
                style={{
                  backgroundColor: BRAND_COLORS.primary,
                  minWidth: '44px',
                  minHeight: '44px',
                }}
              >
                {isValidating ? '...' : 'Go!'}
              </button>
            </div>

            {/* Character count hint */}
            <p id="custom-lesson-hint" className="text-xs text-gray-400">
              {customLesson.length}/{CUSTOM_LESSON_MAX_LENGTH} characters
            </p>

            {/* Validation error message */}
            {validationError && (
              <p
                id="custom-lesson-error"
                role="alert"
                className="text-sm rounded-lg px-3 py-2"
                style={{ color: BRAND_COLORS.error, backgroundColor: '#FFF1F2' }}
              >
                {validationError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
