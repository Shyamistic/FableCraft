'use client'

import { BRAND_COLORS } from '@/lib/branding'
import type { BookshelfEntry } from '@/lib/achievements'

interface BookshelfProps {
  entries: BookshelfEntry[]
  onClose: () => void
}

export default function Bookshelf({ entries, onClose }: BookshelfProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📚</div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: BRAND_COLORS.tertiary }}>
          Your Bookshelf
        </h2>
        <p className="text-gray-600 mb-6">
          Complete quests to fill your bookshelf with stories!
        </p>
        <button
          onClick={onClose}
          className="px-6 py-3 rounded-full font-bold text-white transition-all hover:scale-105"
          style={{ background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.secondary})`, minHeight: '44px' }}
        >
          Start an Adventure!
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold" style={{ color: BRAND_COLORS.tertiary }}>
          📚 My Bookshelf
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl"
          style={{ minWidth: '44px', minHeight: '44px' }}
          aria-label="Close bookshelf"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {entries.map((entry, i) => (
          <div
            key={entry.questId + i}
            className="bg-white rounded-xl p-3 shadow-sm border hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer"
            style={{ borderColor: `${BRAND_COLORS.secondary}20` }}
          >
            {/* Cover image */}
            <div
              className="w-full aspect-[3/4] rounded-lg mb-2 bg-gradient-to-br flex items-center justify-center text-4xl"
              style={{
                background: entry.coverImageUrl
                  ? `url(${entry.coverImageUrl}) center/cover`
                  : `linear-gradient(135deg, ${BRAND_COLORS.primary}30, ${BRAND_COLORS.tertiary}30)`,
              }}
            >
              {!entry.coverImageUrl && '📖'}
            </div>

            {/* Title */}
            <p className="text-xs font-bold truncate" style={{ color: BRAND_COLORS.primary }}>
              {entry.title}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {entry.characterName}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs">⭐</span>
              <span className="text-xs font-bold" style={{ color: BRAND_COLORS.secondary }}>
                {entry.coinsEarned}/8
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
