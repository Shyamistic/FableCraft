'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Volume2 } from 'lucide-react'
import type { Scene, Option } from '@/lib/types'
import { BRAND_COLORS } from '@/lib/branding'
import {
  CORRECT_ANSWER_COUNTDOWN_SECONDS,
  MIN_TAP_TARGET_PX,
} from '@/lib/constants'
import { useSoundEffects } from '@/hooks/useSoundEffects'

// ─── TTS Error Message ───────────────────────────────────────────────────────

const TTS_ERROR_MESSAGE =
  "The read-aloud button isn't working right now, but you can keep reading!"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScenePlayerProps {
  /** The scene data to display. */
  scene: Scene
  /** Whether this scene has already been completed. */
  isCompleted: boolean
  /** Called when the child selects the correct answer. */
  onCorrectAnswer: () => void
  /** Called when the countdown finishes and the scene should auto-advance. */
  onAutoAdvance: () => void
  /** Whether this is the last scene in the quest. */
  isLastScene: boolean
}

// ─── Confetti Helper ─────────────────────────────────────────────────────────

function createConfetti() {
  const colors = [
    BRAND_COLORS.primary,
    BRAND_COLORS.secondary,
    BRAND_COLORS.tertiary,
    BRAND_COLORS.info,
    BRAND_COLORS.success,
    '#FFD700',
    '#FF6B6B',
    '#4ECDC4',
    '#F7DC6F',
    '#BB8FCE',
  ]
  const confettiCount = 80

  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div')
    confetti.className = 'confetti-piece'
    confetti.style.left = Math.random() * 100 + '%'
    confetti.style.backgroundColor =
      colors[Math.floor(Math.random() * colors.length)]
    confetti.style.animationDelay = Math.random() * 0.5 + 's'
    confetti.style.animationDuration = Math.random() * 3 + 4 + 's'

    if (Math.random() > 0.5) {
      confetti.style.borderRadius = '50%'
    }

    document.body.appendChild(confetti)

    setTimeout(() => {
      confetti.remove()
    }, 5000)
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * ScenePlayer renders a single quest scene: illustration, narrative text,
 * question, and two answer option buttons. Handles correct/incorrect answer
 * logic including confetti, countdown, and "Try Again" flow.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 6.8, 6.9
 */
export default function ScenePlayer({
  scene,
  isCompleted,
  onCorrectAnswer,
  onAutoAdvance,
  isLastScene,
}: ScenePlayerProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Monotonic token to guard against stale/overlapping audio requests
  const playTokenRef = useRef<number>(0)
  const sfx = useSoundEffects()

  // Cleanup timers and audio on unmount or scene change
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  // Reset state when scene changes
  useEffect(() => {
    setSelectedOption(null)
    setShowFeedback(false)
    setIsCorrect(false)
    setCountdown(0)
    setTtsError(null)
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current)
    // Stop any playing audio on scene change
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingAudio(null)
  }, [scene.scene_number])

  // Auto-narrate the scene narrative when a new scene loads
  // (playAudio is defined below, but referenced via closure — safe in effects that run after render)
  const playAudioRef = useRef<((text: string, audioId: string) => void) | null>(null)

  const stopAudio = useCallback(() => {
    // Invalidate any in-flight playback request
    playTokenRef.current += 1
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    setPlayingAudio(null)
    // Restore background music volume
    window.dispatchEvent(new Event('narration-end'))
  }, [])

  const playAudio = useCallback(async (text: string, audioId: string) => {
    // If tapping the same speaker icon while playing → stop
    if (playingAudio === audioId) {
      stopAudio()
      return
    }

    // Stop current audio before playing new
    stopAudio()

    // Token to guard against stale/overlapping requests
    const token = ++playTokenRef.current

    // Clear any previous TTS error and show loading/playing state immediately
    setTtsError(null)
    setPlayingAudio(audioId)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const response = await fetch(`${apiUrl}/api/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, session_id: 'current' }),
      })

      // A newer request started while we were waiting — abandon this one silently
      if (token !== playTokenRef.current) return

      if (!response.ok) {
        throw new Error('TTS synthesis failed')
      }

      const data = await response.json()
      if (token !== playTokenRef.current) return

      // Backend signals audio is unavailable (e.g., Polly down) — fail gracefully
      if (data.available === false || !data.audio_url) {
        setPlayingAudio(null)
        setTtsError(data.error_message || TTS_ERROR_MESSAGE)
        return
      }

      const audio = new Audio()
      audio.preload = 'auto'
      audio.src = data.audio_url

      audio.onended = () => {
        if (token !== playTokenRef.current) return
        setPlayingAudio(null)
        audioRef.current = null
        window.dispatchEvent(new Event('narration-end'))
      }
      audio.onerror = () => {
        if (token !== playTokenRef.current) return
        setPlayingAudio(null)
        audioRef.current = null
        setTtsError(TTS_ERROR_MESSAGE)
        window.dispatchEvent(new Event('narration-end'))
      }

      audioRef.current = audio

      // Dispatch narration-start so background music ducks
      window.dispatchEvent(new Event('narration-start'))

      try {
        await audio.play()
      } catch (err: any) {
        // play() rejects when interrupted by a new request (pause). That is
        // expected and must not surface an error to the child.
        if (err && (err.name === 'AbortError' || token !== playTokenRef.current)) {
          return
        }
        throw err
      }
    } catch {
      // Handle TTS failure gracefully, allow quest continuation
      if (token !== playTokenRef.current) return
      setPlayingAudio(null)
      audioRef.current = null
      setTtsError(TTS_ERROR_MESSAGE)
    }
  }, [playingAudio, stopAudio])

  // Keep ref updated for use in effects
  useEffect(() => {
    playAudioRef.current = playAudio
  }, [playAudio])

  // Auto-narrate the scene when it loads
  useEffect(() => {
    const timer = setTimeout(() => {
      if (scene.narrative && !isCompleted && playAudioRef.current) {
        playAudioRef.current(scene.narrative, `narrative-${scene.scene_number}`)
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [scene.scene_number])

  const handleOptionSelect = useCallback(
    (option: Option) => {
      if (isCompleted) return
      if (showFeedback && isCorrect) return // Already answered correctly

      setSelectedOption(option.id)
      setShowFeedback(true)

      // Auto-narrate the option feedback
      if (option.feedback && playAudioRef.current) {
        setTimeout(() => {
          playAudioRef.current?.(option.feedback, `feedback-${option.id}`)
        }, 300)
      }

      if (option.is_correct) {
        setIsCorrect(true)
        createConfetti()
        onCorrectAnswer()
        sfx.play('correct_answer')
        sfx.play('coin_earned')

        // Start countdown
        setCountdown(CORRECT_ANSWER_COUNTDOWN_SECONDS)
        countdownRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              if (countdownRef.current) clearInterval(countdownRef.current)
              return 0
            }
            return prev - 1
          })
        }, 1000)

        // Auto-advance after countdown
        autoAdvanceRef.current = setTimeout(() => {
          if (countdownRef.current) clearInterval(countdownRef.current)
          sfx.play('page_turn')
          onAutoAdvance()
        }, CORRECT_ANSWER_COUNTDOWN_SECONDS * 1000)
      } else {
        setIsCorrect(false)
        sfx.play('wrong_answer')
      }
    },
    [isCompleted, showFeedback, isCorrect, onCorrectAnswer, onAutoAdvance]
  )

  const handleTryAgain = useCallback(() => {
    // Requirement 8.4: dismiss feedback and re-enable both option buttons
    setSelectedOption(null)
    setShowFeedback(false)
    setIsCorrect(false)
  }, [])

  const getFeedbackText = (): string => {
    if (!selectedOption) return ''
    const option = scene.options.find((o) => o.id === selectedOption)
    return option?.feedback ?? ''
  }

  // Determine buttons disabled state
  const buttonsDisabled = isCompleted || (showFeedback && isCorrect)

  return (
    <div className="w-full" data-testid="scene-player">
      {/* Scene Illustration */}
      <div className="relative w-full aspect-video bg-gradient-to-b from-blue-50 to-purple-50 rounded-t-2xl overflow-hidden animate-slide-up">
        {scene.image_url ? (
          <img
            src={scene.image_url}
            alt={`Scene ${scene.scene_number} illustration`}
            className="w-full h-full object-cover transition-opacity duration-500"
            loading="eager"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
            <div className="animate-pulse text-6xl mb-4">🎨</div>
            <p className="text-lg font-semibold">Generating illustration...</p>
          </div>
        )}

        {/* Scene number badge */}
        <div
          className="absolute top-4 left-4 rounded-xl w-12 h-12 flex items-center justify-center shadow-lg border-2 border-white"
          style={{ backgroundColor: BRAND_COLORS.secondary }}
        >
          <span className="text-xl font-bold text-white">
            {scene.scene_number}
          </span>
        </div>

        {/* Auto-narrating indicator */}
        {playingAudio && playingAudio.startsWith('narrative') && (
          <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 shadow-md">
            <div className="flex gap-0.5">
              <div className="w-1 h-3 rounded-full animate-pulse" style={{ backgroundColor: BRAND_COLORS.info, animationDelay: '0ms' }} />
              <div className="w-1 h-4 rounded-full animate-pulse" style={{ backgroundColor: BRAND_COLORS.info, animationDelay: '150ms' }} />
              <div className="w-1 h-2 rounded-full animate-pulse" style={{ backgroundColor: BRAND_COLORS.info, animationDelay: '300ms' }} />
              <div className="w-1 h-4 rounded-full animate-pulse" style={{ backgroundColor: BRAND_COLORS.info, animationDelay: '100ms' }} />
            </div>
            <span className="text-xs font-semibold" style={{ color: BRAND_COLORS.info }}>Reading...</span>
          </div>
        )}
      </div>

      {/* Narrative */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <p className="text-2xl md:text-3xl font-semibold text-gray-800 leading-relaxed flex-1">
            {scene.narrative}
          </p>
          <button
            onClick={() =>
              playAudio(
                scene.narrative,
                `narrative-${scene.scene_number}`
              )
            }
            className="p-2 rounded-full transition-all hover:scale-110"
            style={{
              backgroundColor: `${BRAND_COLORS.info}20`,
              minWidth: `${MIN_TAP_TARGET_PX}px`,
              minHeight: `${MIN_TAP_TARGET_PX}px`,
            }}
            aria-label={playingAudio === `narrative-${scene.scene_number}` ? 'Stop reading narrative' : 'Read narrative aloud'}
            data-testid="tts-narrative"
          >
            <Volume2
              className={`w-6 h-6 ${
                playingAudio === `narrative-${scene.scene_number}`
                  ? 'animate-pulse'
                  : ''
              }`}
              style={{ color: BRAND_COLORS.info }}
            />
          </button>
        </div>
      </div>

      {/* Question */}
      <div className="px-6 pb-4">
        <div className="flex items-center gap-3">
          <h3
            className="text-xl md:text-2xl font-bold flex-1"
            style={{ color: BRAND_COLORS.tertiary }}
          >
            {scene.question}
          </h3>
          <button
            onClick={() =>
              playAudio(scene.question, `question-${scene.scene_number}`)
            }
            className="p-2 rounded-full transition-all hover:scale-110"
            style={{
              backgroundColor: `${BRAND_COLORS.tertiary}20`,
              minWidth: `${MIN_TAP_TARGET_PX}px`,
              minHeight: `${MIN_TAP_TARGET_PX}px`,
            }}
            aria-label={playingAudio === `question-${scene.scene_number}` ? 'Stop reading question' : 'Read question aloud'}
            data-testid="tts-question"
          >
            <Volume2
              className={`w-5 h-5 ${
                playingAudio === `question-${scene.scene_number}`
                  ? 'animate-pulse'
                  : ''
              }`}
              style={{ color: BRAND_COLORS.tertiary }}
            />
          </button>
        </div>
      </div>

      {/* TTS Error Message (Req 9.8) */}
      {ttsError && (
        <div
          className="mx-6 mb-4 p-3 rounded-xl bg-amber-50 border-2 border-amber-200"
          role="alert"
          aria-live="polite"
          data-testid="tts-error"
        >
          <p className="text-sm font-medium text-amber-800">{ttsError}</p>
        </div>
      )}

      {/* Answer Options or Feedback */}
      <div className="px-6 pb-6">
        {showFeedback ? (
          <div
            className={`p-6 rounded-2xl border-4 ${
              isCorrect
                ? 'bg-green-50 border-green-400'
                : 'bg-rose-50 border-rose-300'
            }`}
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-xl md:text-2xl font-semibold text-gray-800 flex-1">
                {getFeedbackText()}
              </p>
              {isCorrect && countdown > 0 && (
                <div className="flex items-center gap-3 text-gray-700">
                  <span className="text-sm font-medium">Next in</span>
                  <span
                    className="text-3xl font-bold"
                    style={{ color: BRAND_COLORS.tertiary }}
                    aria-label={`Auto-advancing in ${countdown} seconds`}
                  >
                    {countdown}
                  </span>
                </div>
              )}
            </div>

            {/* Try Again button for incorrect answers (Req 8.3, 8.4) */}
            {!isCorrect && (
              <button
                onClick={handleTryAgain}
                className="mt-4 px-6 py-3 rounded-full font-bold text-white transition-all hover:scale-105"
                style={{
                  backgroundColor: BRAND_COLORS.primary,
                  minWidth: `${MIN_TAP_TARGET_PX}px`,
                  minHeight: `${MIN_TAP_TARGET_PX}px`,
                }}
                aria-label="Try again"
              >
                Try Again
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* Completed scene badge (Requirement 8.8) */}
            {isCompleted && (
              <div
                className="flex items-center gap-2 mb-3 px-3 py-2 rounded-full w-fit"
                style={{ backgroundColor: `${BRAND_COLORS.success}20` }}
                aria-label="Scene completed"
              >
                <span className="text-lg" aria-hidden="true">✅</span>
                <span
                  className="text-sm font-bold"
                  style={{ color: BRAND_COLORS.success }}
                >
                  Scene Completed
                </span>
              </div>
            )}
            <div
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              role="group"
              aria-label="Answer options"
            >
              {scene.options.map((option, index) => (
                <button
                  key={option.id}
                  onClick={() => handleOptionSelect(option)}
                  disabled={buttonsDisabled}
                  className={`
                    p-4 rounded-2xl border-4 font-semibold text-lg transition-all duration-300
                    ${
                      isCompleted
                        ? option.is_correct
                          ? 'border-green-400 bg-green-50 cursor-not-allowed opacity-90'
                          : 'border-gray-300 bg-gray-100 cursor-not-allowed opacity-50'
                        : buttonsDisabled
                        ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-50'
                        : index === 0
                        ? 'bg-orange-50 border-orange-300 hover:bg-orange-100 hover:border-orange-400 hover:scale-[1.02] cursor-pointer'
                        : 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100 hover:border-yellow-400 hover:scale-[1.02] cursor-pointer'
                    }
                  `}
                  style={{
                    minWidth: `${MIN_TAP_TARGET_PX}px`,
                    minHeight: `${MIN_TAP_TARGET_PX}px`,
                  }}
                  aria-label={`Option ${option.id.toUpperCase()}: ${option.text}${
                    isCompleted && option.is_correct ? ' (correct answer)' : ''
                  }`}
                  aria-disabled={buttonsDisabled}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-2xl font-bold"
                      style={{
                        color:
                          isCompleted && option.is_correct
                            ? BRAND_COLORS.success
                            : index === 0
                            ? BRAND_COLORS.primary
                            : BRAND_COLORS.secondary,
                      }}
                    >
                      {option.id.toUpperCase()}
                    </span>
                    <span className="text-gray-800 text-left text-xl flex-1">
                      {option.text}
                    </span>
                    {isCompleted && option.is_correct && (
                      <span className="text-xl" aria-hidden="true">✅</span>
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        playAudio(option.text, `option-${option.id}-${scene.scene_number}`)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation()
                          e.preventDefault()
                          playAudio(option.text, `option-${option.id}-${scene.scene_number}`)
                        }
                      }}
                      className="p-1 rounded-full transition-all hover:scale-110 shrink-0"
                      style={{
                        backgroundColor: `${BRAND_COLORS.info}15`,
                        minWidth: `${MIN_TAP_TARGET_PX}px`,
                        minHeight: `${MIN_TAP_TARGET_PX}px`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      aria-label={
                        playingAudio === `option-${option.id}-${scene.scene_number}`
                          ? `Stop reading option ${option.id.toUpperCase()}`
                          : `Read option ${option.id.toUpperCase()} aloud`
                      }
                      data-testid={`tts-option-${option.id}`}
                    >
                      <Volume2
                        className={`w-5 h-5 ${
                          playingAudio === `option-${option.id}-${scene.scene_number}`
                            ? 'animate-pulse'
                            : ''
                        }`}
                        style={{ color: BRAND_COLORS.info }}
                      />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
