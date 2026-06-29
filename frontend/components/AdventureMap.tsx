'use client'

import { BRAND_COLORS } from '@/lib/branding'
import type { Genre } from '@/lib/types'

interface AdventureMapProps {
  questsCompleted: number
  genresExplored: string[]
  level: number
  xpProgress: number
  onClose: () => void
}

const WORLDS: { genre: Genre; name: string; emoji: string; color: string; position: { top: string; left: string } }[] = [
  { genre: 'fantasy_kingdom', name: 'Fantasy Kingdom', emoji: '🏰', color: '#8B5CF6', position: { top: '20%', left: '15%' } },
  { genre: 'outer_space', name: 'Outer Space', emoji: '🚀', color: '#38BDF8', position: { top: '25%', left: '65%' } },
  { genre: 'underwater_world', name: 'Underwater World', emoji: '🐠', color: '#34D399', position: { top: '60%', left: '20%' } },
  { genre: 'jungle_safari', name: 'Jungle Safari', emoji: '🌴', color: '#F97316', position: { top: '55%', left: '70%' } },
]

export default function AdventureMap({ questsCompleted, genresExplored, level, xpProgress, onClose }: AdventureMapProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold" style={{ color: BRAND_COLORS.tertiary }}>
          🗺️ Adventure Map
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl"
          style={{ minWidth: '44px', minHeight: '44px' }}
          aria-label="Close adventure map"
        >
          ✕
        </button>
      </div>

      {/* Map area */}
      <div
        className="relative w-full rounded-2xl overflow-hidden border-2"
        style={{
          height: '400px',
          background: 'linear-gradient(135deg, #E8F5E0 0%, #FFF9F0 30%, #D5F0FF 60%, #F8F0FF 100%)',
          borderColor: `${BRAND_COLORS.secondary}40`,
        }}
      >
        {/* Decorative path connecting worlds */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path
            d="M 15 25 Q 40 35 65 30 Q 80 45 70 60 Q 50 65 20 65"
            fill="none"
            stroke={BRAND_COLORS.secondary}
            strokeWidth="0.5"
            strokeDasharray="2 1"
            opacity="0.5"
          />
        </svg>

        {/* World nodes */}
        {WORLDS.map(world => {
          const isExplored = genresExplored.includes(world.genre)
          return (
            <div
              key={world.genre}
              className={`absolute flex flex-col items-center transition-all ${
                isExplored ? 'scale-100 opacity-100' : 'scale-90 opacity-50'
              }`}
              style={{ top: world.position.top, left: world.position.left, transform: 'translate(-50%, -50%)' }}
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg border-3 ${
                  isExplored ? 'animate-bounce-gentle' : ''
                }`}
                style={{
                  background: isExplored ? `${world.color}20` : '#f3f4f6',
                  borderColor: isExplored ? world.color : '#d1d5db',
                  borderWidth: '3px',
                }}
              >
                {isExplored ? world.emoji : '🔒'}
              </div>
              <span className={`mt-1 text-xs font-bold text-center ${isExplored ? '' : 'text-gray-400'}`} style={{ color: isExplored ? world.color : undefined }}>
                {world.name}
              </span>
              {isExplored && (
                <span className="text-xs text-gray-500">✓ Explored</span>
              )}
            </div>
          )
        })}

        {/* Player position / level indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div
            className="px-4 py-2 rounded-full flex items-center gap-2 shadow-md"
            style={{ background: 'white', border: `2px solid ${BRAND_COLORS.primary}` }}
          >
            <span className="text-xl">🧭</span>
            <span className="text-sm font-bold" style={{ color: BRAND_COLORS.primary }}>
              Level {level} • {questsCompleted} Quests
            </span>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="mt-4 flex items-center justify-between p-3 bg-white rounded-xl border" style={{ borderColor: `${BRAND_COLORS.tertiary}20` }}>
        <div className="flex items-center gap-4 text-sm">
          <span>🌍 {genresExplored.length}/4 Worlds</span>
          <span>📖 {questsCompleted} Stories</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Next Level:</span>
          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(xpProgress * 100, 100)}%`,
                background: `linear-gradient(90deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
