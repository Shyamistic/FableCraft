'use client'

import { BRAND_COLORS } from '@/lib/branding'
import type { WeeklyChallenge as WeeklyChallengeType } from '@/lib/achievements'

interface WeeklyChallengeProps {
  challenge: WeeklyChallengeType | null
}

export default function WeeklyChallenge({ challenge }: WeeklyChallengeProps) {
  if (!challenge) return null

  const progress = Math.min(challenge.progress / challenge.target, 1)

  return (
    <div
      className="rounded-2xl p-4 border-2 transition-all hover:scale-[1.01]"
      style={{
        background: challenge.completed
          ? `linear-gradient(135deg, ${BRAND_COLORS.success}10, ${BRAND_COLORS.success}05)`
          : 'white',
        borderColor: challenge.completed ? BRAND_COLORS.success : `${BRAND_COLORS.info}30`,
        boxShadow: `0 2px 12px ${BRAND_COLORS.info}10`,
      }}
    >
      <div className="flex items-center gap-3">
        <div className="text-3xl">
          {challenge.completed ? '🏆' : challenge.type === 'quests' ? '📖' : challenge.type === 'drawings' ? '🎨' : '🔥'}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm" style={{ color: BRAND_COLORS.tertiary }}>
              Weekly Challenge
            </h3>
            {challenge.completed && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${BRAND_COLORS.success}20`, color: BRAND_COLORS.success }}>
                Complete! ✓
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 font-medium">{challenge.title}</p>
          <p className="text-xs text-gray-500">{challenge.description}</p>

          {/* Progress bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress * 100}%`,
                  background: challenge.completed
                    ? BRAND_COLORS.success
                    : `linear-gradient(90deg, ${BRAND_COLORS.info}, ${BRAND_COLORS.tertiary})`,
                }}
              />
            </div>
            <span className="text-xs font-bold" style={{ color: BRAND_COLORS.info }}>
              {challenge.progress}/{challenge.target}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
