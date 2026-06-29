'use client'

import { useEffect, useState } from 'react'
import { BRAND_COLORS } from '@/lib/branding'
import { useSoundEffects } from '@/hooks/useSoundEffects'
import type { Achievement } from '@/lib/achievements'

interface AchievementToastProps {
  achievement: Achievement | null
  onDismiss: () => void
}

export default function AchievementToast({ achievement, onDismiss }: AchievementToastProps) {
  const [isVisible, setIsVisible] = useState(false)
  const sfx = useSoundEffects()

  useEffect(() => {
    if (achievement) {
      setIsVisible(true)
      sfx.play('achievement_unlock')
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(onDismiss, 300)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [achievement])

  if (!achievement) return null

  return (
    <div
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95'
      }`}
      role="alert"
      aria-live="assertive"
    >
      <div
        className="flex items-center gap-4 px-6 py-4 rounded-2xl shadow-xl border-2"
        style={{
          background: 'white',
          borderColor: BRAND_COLORS.secondary,
          boxShadow: `0 8px 32px ${BRAND_COLORS.secondary}40`,
        }}
      >
        <div className="text-4xl animate-bounce-gentle">{achievement.icon}</div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: BRAND_COLORS.secondary }}>
            Achievement Unlocked!
          </p>
          <p className="text-lg font-bold" style={{ color: BRAND_COLORS.primary }}>
            {achievement.title}
          </p>
          <p className="text-sm text-gray-600">{achievement.description}</p>
        </div>
        <button
          onClick={() => { setIsVisible(false); setTimeout(onDismiss, 300) }}
          className="ml-2 text-gray-400 hover:text-gray-600 text-lg"
          aria-label="Dismiss achievement notification"
          style={{ minWidth: '44px', minHeight: '44px' }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
