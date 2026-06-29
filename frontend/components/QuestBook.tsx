'use client'

import { useState, useCallback, useEffect } from 'react'
import type { Quest, Scene } from '@/lib/types'
import { BRAND_COLORS } from '@/lib/branding'
import {
  TOTAL_QUEST_SCENES,
  MAX_COINS_PER_QUEST,
  MIN_TAP_TARGET_PX,
} from '@/lib/constants'
import ScenePlayer from './ScenePlayer'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QuestBookProps {
  /** The full quest data object. */
  quest: Quest
  /** Called when the quest is complete with total coins earned. */
  onQuestComplete: (coinsEarned: number) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * QuestBook orchestrates scene-by-scene story playback. It displays one scene
 * at a time via ScenePlayer, tracks coins earned, shows progress, and handles
 * quest completion.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 6.8, 6.9
 */
export default function QuestBook({ quest, onQuestComplete }: QuestBookProps) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0)
  const [coinsEarned, setCoinsEarned] = useState(0)
  const [completedScenes, setCompletedScenes] = useState<Set<number>>(new Set())
  const [showComplete, setShowComplete] = useState(false)

  const scenes = quest.scenes
  const totalScenes = scenes.length || TOTAL_QUEST_SCENES
  const currentScene: Scene | undefined = scenes[currentSceneIndex]
  const isLastScene = currentSceneIndex === totalScenes - 1

  // Preload next scene image
  useEffect(() => {
    if (currentSceneIndex < scenes.length - 1) {
      const nextScene = scenes[currentSceneIndex + 1]
      if (nextScene?.image_url) {
        const img = new Image()
        img.src = nextScene.image_url
      }
    }
  }, [currentSceneIndex, scenes])

  /**
   * Called when a correct answer is selected in ScenePlayer.
   * Awards +1 star coin. Coins never decrease (Requirement 6.9, 8.3).
   */
  const handleCorrectAnswer = useCallback(() => {
    setCoinsEarned((prev) => Math.min(prev + 1, MAX_COINS_PER_QUEST))
    setCompletedScenes((prev) => {
      const next = new Set(prev)
      next.add(currentSceneIndex)
      return next
    })
  }, [currentSceneIndex])

  /**
   * Called when the 8-second countdown finishes. Advances to next scene
   * or shows quest complete screen.
   */
  const handleAutoAdvance = useCallback(() => {
    if (isLastScene) {
      setShowComplete(true)
    } else {
      setCurrentSceneIndex((prev) => prev + 1)
    }
  }, [isLastScene])

  /**
   * Navigate back to a previously completed scene (Req 8.8).
   * The ScenePlayer will render options as disabled.
   */
  const handleSceneNavigation = useCallback(
    (index: number) => {
      if (index >= 0 && index < totalScenes) {
        setCurrentSceneIndex(index)
      }
    },
    [totalScenes]
  )

  if (!currentScene) return null

  return (
    <div className="min-h-screen flex items-start justify-center pt-4 px-4 pb-8">
      <div className="relative w-full max-w-3xl">
        {/* Star Coin Counter (Requirement 8.6) — visible on every scene */}
        <div
          className="flex items-center gap-2 mb-4 justify-end"
          aria-label={`Star coins: ${coinsEarned} out of ${MAX_COINS_PER_QUEST}`}
        >
          <div
            className="flex items-center gap-2 px-5 py-2 rounded-full shadow-md font-bold text-lg"
            style={{
              backgroundColor: BRAND_COLORS.secondary,
              color: '#92400E',
            }}
          >
            <span className="text-xl" aria-hidden="true">
              ⭐
            </span>
            <span>
              {coinsEarned} / {MAX_COINS_PER_QUEST}
            </span>
          </div>
        </div>

        {/* Quest Title + Scene Counter */}
        <div className="text-center mb-4">
          <h2
            className="text-3xl md:text-4xl font-bold"
            style={{ color: BRAND_COLORS.tertiary }}
          >
            {quest.title}
          </h2>
          <div className="mt-1 inline-flex items-center gap-2 px-3 py-1 rounded-full" style={{ backgroundColor: `${BRAND_COLORS.tertiary}10` }}>
            <span className="text-sm font-semibold" style={{ color: BRAND_COLORS.tertiary }}>
              📖 Scene {currentSceneIndex + 1} of {totalScenes}
            </span>
          </div>
        </div>

        {/* Scene Player Card with page-flip animation on scene change */}
        <div key={currentSceneIndex} className="bg-white rounded-3xl shadow-xl border-4 border-amber-200 overflow-hidden animate-page-flip">
          <ScenePlayer
            scene={currentScene}
            isCompleted={completedScenes.has(currentSceneIndex)}
            onCorrectAnswer={handleCorrectAnswer}
            onAutoAdvance={handleAutoAdvance}
            isLastScene={isLastScene}
          />
        </div>

        {/* Progress Indicator (Requirement 8.5) */}
        <div
          className="flex justify-center items-center gap-2 mt-6"
          role="navigation"
          aria-label="Scene progress"
        >
          {Array.from({ length: totalScenes }, (_, index) => (
            <button
              key={index}
              onClick={() => handleSceneNavigation(index)}
              disabled={!completedScenes.has(index) && index !== currentSceneIndex}
              className={`
                rounded-full transition-all duration-300
                ${
                  index === currentSceneIndex
                    ? 'w-8 h-3'
                    : 'w-3 h-3'
                }
                ${
                  !completedScenes.has(index) && index !== currentSceneIndex
                    ? 'cursor-not-allowed'
                    : 'cursor-pointer hover:scale-125'
                }
              `}
              style={{
                backgroundColor:
                  index === currentSceneIndex
                    ? BRAND_COLORS.tertiary
                    : completedScenes.has(index)
                    ? BRAND_COLORS.success
                    : '#D1D5DB',
                minWidth: '12px',
                minHeight: '12px',
              }}
              aria-label={`Scene ${index + 1}${
                completedScenes.has(index) ? ' (completed)' : ''
              }${index === currentSceneIndex ? ' (current)' : ''}`}
              aria-current={index === currentSceneIndex ? 'step' : undefined}
            />
          ))}
        </div>

        <p className="text-center text-sm text-gray-500 mt-2">
          Scene {currentSceneIndex + 1} of {totalScenes}
        </p>

        {/* Quest Complete Overlay (Requirement 8.7) */}
        {showComplete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-10 text-center shadow-2xl max-w-md mx-4">
              <h2
                className="text-4xl font-bold mb-6"
                style={{ color: BRAND_COLORS.tertiary }}
              >
                Quest Complete! 🎉
              </h2>
              <div
                className="rounded-full px-8 py-4 inline-flex items-center gap-3 mb-6"
                style={{ backgroundColor: `${BRAND_COLORS.secondary}30` }}
              >
                <span className="text-4xl" aria-hidden="true">
                  ⭐
                </span>
                <span className="text-2xl font-bold" style={{ color: '#92400E' }}>
                  {coinsEarned} Stars Earned!
                </span>
              </div>
              <br />
              <button
                onClick={() => onQuestComplete(coinsEarned)}
                className="mt-4 px-8 py-4 rounded-full font-bold text-xl text-white transition-all hover:scale-105 shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${BRAND_COLORS.tertiary}, ${BRAND_COLORS.primary})`,
                  minWidth: `${MIN_TAP_TARGET_PX}px`,
                  minHeight: `${MIN_TAP_TARGET_PX}px`,
                }}
              >
                New Story Adventure!
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
