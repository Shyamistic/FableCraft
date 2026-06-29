'use client'

import { useEffect } from 'react'
import { BRAND_COLORS } from '@/lib/branding'
import { useSoundEffects } from '@/hooks/useSoundEffects'

interface QuestCompleteProps {
  characterName: string
  coinsEarned: number
  totalScenes: number
  onPlayAgain: () => void
  onGoHome: () => void
}

export default function QuestComplete({
  characterName,
  coinsEarned,
  totalScenes,
  onPlayAgain,
  onGoHome,
}: QuestCompleteProps) {
  const sfx = useSoundEffects()

  useEffect(() => {
    sfx.play('level_up')
    // Create celebration confetti
    createCelebrationConfetti()
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center animate-slide-up">
      {/* Trophy/celebration emoji */}
      <div className="text-8xl mb-6 animate-bounce-gentle">🏆</div>

      {/* Title */}
      <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{
        background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        Quest Complete!
      </h1>

      {/* Character message */}
      <p className="text-xl md:text-2xl text-gray-700 mb-8 max-w-md">
        Amazing job! <span className="font-bold">{characterName}</span> had an incredible adventure! 🎉
      </p>

      {/* Stars earned */}
      <div className="flex items-center gap-2 mb-8">
        {Array.from({ length: totalScenes }).map((_, i) => (
          <span key={i} className={`text-3xl ${i < coinsEarned ? 'animate-sparkle' : 'opacity-30'}`}
            style={{ animationDelay: `${i * 0.1}s` }}>
            ⭐
          </span>
        ))}
      </div>

      {/* Score */}
      <div className="bg-white rounded-2xl p-6 shadow-lg mb-8 border-2" style={{ borderColor: BRAND_COLORS.secondary }}>
        <p className="text-lg text-gray-600">Stars Earned</p>
        <p className="text-4xl font-bold" style={{ color: BRAND_COLORS.primary }}>
          {coinsEarned} / {totalScenes}
        </p>
        {coinsEarned === totalScenes && (
          <p className="text-sm font-bold mt-2" style={{ color: BRAND_COLORS.success }}>
            ✨ Perfect Score! +50 XP Bonus!
          </p>
        )}
      </div>

      {/* XP earned */}
      <div className="flex items-center gap-2 mb-8 text-lg">
        <span className="text-2xl">⚡</span>
        <span className="font-bold" style={{ color: BRAND_COLORS.tertiary }}>
          +{coinsEarned === totalScenes ? 150 : 100} XP earned!
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={onPlayAgain}
          className="px-8 py-4 rounded-full font-bold text-white text-lg transition-all hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
            boxShadow: '0 4px 14px rgba(249, 115, 22, 0.3)',
            minWidth: '44px',
            minHeight: '44px',
          }}
        >
          🎨 New Adventure
        </button>
        <button
          onClick={onGoHome}
          className="px-8 py-4 rounded-full font-bold text-lg transition-all hover:scale-105 border-2"
          style={{
            borderColor: BRAND_COLORS.tertiary,
            color: BRAND_COLORS.tertiary,
            minWidth: '44px',
            minHeight: '44px',
          }}
        >
          🏠 Go Home
        </button>
      </div>
    </div>
  )
}

function createCelebrationConfetti() {
  const colors = ['#F97316', '#FBBF24', '#8B5CF6', '#38BDF8', '#34D399', '#FFD700', '#FF6B6B', '#4ECDC4']
  for (let i = 0; i < 100; i++) {
    const confetti = document.createElement('div')
    confetti.className = 'confetti-piece'
    confetti.style.left = Math.random() * 100 + '%'
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)]
    confetti.style.animationDelay = Math.random() * 1 + 's'
    confetti.style.animationDuration = Math.random() * 3 + 4 + 's'
    if (Math.random() > 0.5) confetti.style.borderRadius = '50%'
    document.body.appendChild(confetti)
    setTimeout(() => confetti.remove(), 6000)
  }
}
