'use client'

import { BRAND_COLORS } from '@/lib/branding'

interface XPProgressBarProps {
  xp: number
  level: number
  xpForNextLevel: number
  xpProgress: number
}

export default function XPProgressBar({ xp, level, xpForNextLevel, xpProgress }: XPProgressBarProps) {
  const clampedProgress = Math.min(Math.max(xpProgress, 0), 1)

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-xs font-bold px-2 py-0.5 rounded-full"
        style={{ background: `${BRAND_COLORS.tertiary}20`, color: BRAND_COLORS.tertiary }}
      >
        ⭐ Lv.{level}
      </span>
      <div className="relative w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${clampedProgress * 100}%`,
            background: `linear-gradient(90deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
          }}
          role="progressbar"
          aria-valuenow={xp}
          aria-valuemin={0}
          aria-valuemax={xpForNextLevel}
          aria-label={`Experience progress: ${xp} of ${xpForNextLevel} XP to next level`}
        />
      </div>
      <span className="text-xs text-gray-500 hidden md:inline">{xp}/{xpForNextLevel}</span>
    </div>
  )
}
