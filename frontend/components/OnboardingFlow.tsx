'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { BRAND_COLORS } from '../lib/branding'
import { TRANSITION_DURATION_MIN_MS, TRANSITION_DURATION_MAX_MS } from '../lib/constants'
import type { Character, Genre, Quest } from '../lib/types'

/**
 * OnboardingFlow component provides a step-by-step guided flow for new users.
 * 
 * Flow: draw → name → generate character → pick lesson → pick genre → play quest
 *
 * Each step is labeled with a visual step indicator where the current step is highlighted.
 * Transition animations between steps (200-600ms, fade/scale/slide).
 * The component manages the overall flow but delegates to child components for content.
 *
 * Requirements: 16.4, 20.2
 * Validates: Requirements 16.4, 20.2
 */

export type OnboardingStep = 'draw' | 'name' | 'generate' | 'lesson' | 'genre' | 'play'

interface OnboardingFlowProps {
  /** Called when the user completes the onboarding flow */
  onComplete?: (data: OnboardingFlowData) => void
  /** Optional API base URL override */
  apiBaseUrl?: string
  /** Session ID for the current user session */
  sessionId: string
  /** Callback for rendering custom content for each step */
  renderStepContent: (step: OnboardingStep, data: OnboardingFlowData) => React.ReactNode
  /** Force-skip to a specific step (used after character generation) */
  forceStep?: OnboardingStep | null
}

export interface OnboardingFlowData {
  character: Character | null
  characterName: string
  lesson: string | null
  genre: Genre | null
  quest: Quest | null
}

/**
 * Step metadata: label, icon, description
 */
const STEPS: Record<OnboardingStep, { label: string; emoji: string; description: string }> = {
  draw: { label: 'Create', emoji: '🎨', description: 'Draw and create your character' },
  name: { label: 'Create', emoji: '🎨', description: 'Draw and create your character' },
  generate: { label: 'Create', emoji: '🎨', description: 'Draw and create your character' },
  lesson: { label: 'Lesson', emoji: '📖', description: 'Pick something to learn' },
  genre: { label: 'Genre', emoji: '🎬', description: 'Choose your world' },
  play: { label: 'Play', emoji: '🎮', description: 'Start your adventure!' },
}

const STEP_ORDER: OnboardingStep[] = ['draw', 'name', 'generate', 'lesson', 'genre', 'play']

/** Visible step indicators (collapsed draw/name/generate into one) */
const VISIBLE_STEPS: { step: OnboardingStep; label: string; emoji: string }[] = [
  { step: 'draw', label: 'Create', emoji: '🎨' },
  { step: 'lesson', label: 'Lesson', emoji: '📖' },
  { step: 'genre', label: 'Genre', emoji: '🎬' },
  { step: 'play', label: 'Play', emoji: '🎮' },
]

export default function OnboardingFlow({
  onComplete,
  apiBaseUrl = '',
  sessionId,
  renderStepContent,
  forceStep,
}: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('draw')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [flowData, setFlowData] = useState<OnboardingFlowData>({
    character: null,
    characterName: '',
    lesson: null,
    genre: null,
    quest: null,
  })

  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Force-advance to a step when parent says so (e.g., after character generation)
  useEffect(() => {
    if (forceStep && forceStep !== currentStep) {
      setCurrentStep(forceStep)
    }
  }, [forceStep])

  /**
   * Transition to the next step with animation.
   * Animation duration is randomized between 200-600ms per requirement 20.2.
   */
  const goToStep = useCallback((step: OnboardingStep) => {
    if (step === currentStep || isTransitioning) return

    setIsTransitioning(true)

    // Random animation duration between 200-600ms
    const duration = Math.random() * (TRANSITION_DURATION_MAX_MS - TRANSITION_DURATION_MIN_MS) + TRANSITION_DURATION_MIN_MS

    transitionTimerRef.current = setTimeout(() => {
      setCurrentStep(step)
      setIsTransitioning(false)
    }, duration)
  }, [currentStep, isTransitioning])

  /**
   * Advance to the next step in the flow
   */
  const nextStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep)
    if (currentIndex < STEP_ORDER.length - 1) {
      goToStep(STEP_ORDER[currentIndex + 1])
    } else {
      // Flow complete
      onComplete?.(flowData)
    }
  }, [currentStep, goToStep, onComplete, flowData])

  /**
   * Go back to the previous step in the flow
   */
  const previousStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(currentStep)
    if (currentIndex > 0) {
      goToStep(STEP_ORDER[currentIndex - 1])
    }
  }, [currentStep, goToStep])

  /**
   * Update flow data and optionally advance to next step
   */
  const updateFlowData = useCallback((updates: Partial<OnboardingFlowData>, autoAdvance = true) => {
    setFlowData(prev => ({ ...prev, ...updates }))
    if (autoAdvance) {
      setTimeout(() => nextStep(), 100)
    }
  }, [nextStep])

  // Cleanup transition timer on unmount
  React.useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current)
      }
    }
  }, [])

  const currentStepIndex = STEP_ORDER.indexOf(currentStep)

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto p-4" data-testid="onboarding-flow">
      {/* Step Indicator Bar */}
      <div className="flex justify-between items-center gap-2">
        {VISIBLE_STEPS.map((vs, index) => {
          // Determine if this visible step is active or completed
          const stepIndex = STEP_ORDER.indexOf(vs.step)
          const isActive = currentStepIndex >= stepIndex && 
            (index === VISIBLE_STEPS.length - 1 || currentStepIndex < STEP_ORDER.indexOf(VISIBLE_STEPS[index + 1]?.step || 'play'))
          const isCompleted = index < VISIBLE_STEPS.length - 1 && 
            currentStepIndex >= STEP_ORDER.indexOf(VISIBLE_STEPS[index + 1].step)

          return (
            <div
              key={vs.step}
              className="flex-1 flex flex-col items-center gap-2"
              data-testid={`step-indicator-${vs.step}`}
            >
              {/* Step Circle */}
              <div
                className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-lg transition-all duration-300 ${
                  isActive
                    ? 'scale-125 ring-4'
                    : isCompleted
                      ? ''
                      : 'opacity-40'
                }`}
                style={{
                  backgroundColor: isActive || isCompleted ? BRAND_COLORS.primary : '#E5E7EB',
                  color: isActive || isCompleted ? 'white' : '#9CA3AF',
                  boxShadow: isActive ? `0 0 0 4px ${BRAND_COLORS.primary}40` : 'none',
                }}
                aria-label={`Step ${index + 1}: ${vs.label}`}
                aria-current={isActive ? 'step' : undefined}
              >
                {isCompleted ? '✓' : vs.emoji}
              </div>

              {/* Step Label */}
              <div className="text-center">
                <p
                  className={`text-xs font-bold uppercase tracking-wide transition-colors duration-300 ${
                    isActive ? 'text-gray-900' : isCompleted ? 'text-gray-600' : 'text-gray-400'
                  }`}
                >
                  {vs.label}
                </p>
              </div>

              {/* Connector Line (between steps) */}
              {index < VISIBLE_STEPS.length - 1 && (
                <div
                  className="h-1 flex-1 transition-colors duration-300"
                  style={{
                    backgroundColor: isCompleted ? BRAND_COLORS.primary : '#E5E7EB',
                    marginTop: '-16px',
                    minWidth: '20px',
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Step Content Container with Transition Animation */}
      <div
        className={`transition-all duration-300 ${
          isTransitioning
            ? 'opacity-0 scale-95'
            : 'opacity-100 scale-100'
        }`}
        role="region"
        aria-label={`Step: ${STEPS[currentStep].label}`}
        aria-live="polite"
      >
        {/* Render step-specific content */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100" data-testid={`step-content-${currentStep}`}>
          {renderStepContent(currentStep, flowData)}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex gap-3 justify-between">
        <button
          onClick={previousStep}
          disabled={currentStepIndex === 0 || isTransitioning}
          className="px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: '#E5E7EB',
            color: '#1F2937',
            minWidth: '44px',
            minHeight: '44px',
          }}
          data-testid="onboarding-back-btn"
        >
          ← Back
        </button>

        {currentStepIndex === STEP_ORDER.length - 1 ? (
          <button
            onClick={() => onComplete?.(flowData)}
            disabled={isTransitioning}
            className="px-6 py-3 rounded-lg font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: BRAND_COLORS.success,
              minWidth: '44px',
              minHeight: '44px',
            }}
            data-testid="onboarding-complete-btn"
          >
            Let&apos;s Play! 🎉
          </button>
        ) : (
          <button
            onClick={nextStep}
            disabled={isTransitioning}
            className="px-6 py-3 rounded-lg font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: BRAND_COLORS.primary,
              minWidth: '44px',
              minHeight: '44px',
            }}
            data-testid="onboarding-next-btn"
          >
            Next →
          </button>
        )}
      </div>

      {/* Step Description (optional, shown below buttons) */}
      <div className="text-center text-sm text-gray-600">
        <p>
          {STEPS[currentStep].emoji} {STEPS[currentStep].description}
        </p>
      </div>
    </div>
  )
}

export { STEPS, STEP_ORDER }
