'use client'

import { useState } from 'react'
import { BRAND_COLORS } from '@/lib/branding'

export interface Sticker {
  id: string
  emoji: string
  name: string
  category: 'shapes' | 'animals' | 'nature' | 'emojis' | 'fantasy'
}

const STICKERS: Sticker[] = [
  // Shapes
  { id: 'star', emoji: '⭐', name: 'Star', category: 'shapes' },
  { id: 'heart', emoji: '❤️', name: 'Heart', category: 'shapes' },
  { id: 'diamond', emoji: '💎', name: 'Diamond', category: 'shapes' },
  { id: 'moon', emoji: '🌙', name: 'Moon', category: 'shapes' },
  { id: 'sun', emoji: '☀️', name: 'Sun', category: 'shapes' },
  // Animals
  { id: 'cat', emoji: '🐱', name: 'Cat', category: 'animals' },
  { id: 'dog', emoji: '🐶', name: 'Dog', category: 'animals' },
  { id: 'bunny', emoji: '🐰', name: 'Bunny', category: 'animals' },
  { id: 'butterfly', emoji: '🦋', name: 'Butterfly', category: 'animals' },
  { id: 'unicorn', emoji: '🦄', name: 'Unicorn', category: 'animals' },
  // Nature
  { id: 'flower', emoji: '🌸', name: 'Flower', category: 'nature' },
  { id: 'tree', emoji: '🌳', name: 'Tree', category: 'nature' },
  { id: 'rainbow', emoji: '🌈', name: 'Rainbow', category: 'nature' },
  { id: 'cloud', emoji: '☁️', name: 'Cloud', category: 'nature' },
  { id: 'mushroom', emoji: '🍄', name: 'Mushroom', category: 'nature' },
  // Fantasy
  { id: 'crown', emoji: '👑', name: 'Crown', category: 'fantasy' },
  { id: 'wand', emoji: '🪄', name: 'Wand', category: 'fantasy' },
  { id: 'dragon', emoji: '🐉', name: 'Dragon', category: 'fantasy' },
  { id: 'fairy', emoji: '🧚', name: 'Fairy', category: 'fantasy' },
  { id: 'castle', emoji: '🏰', name: 'Castle', category: 'fantasy' },
]

interface StickerPaletteProps {
  onStickerSelect: (sticker: Sticker) => void
  isOpen: boolean
  onToggle: () => void
}

export default function StickerPalette({ onStickerSelect, isOpen, onToggle }: StickerPaletteProps) {
  const [activeCategory, setActiveCategory] = useState<string>('shapes')

  const categories = [
    { id: 'shapes', label: '⭐', name: 'Shapes' },
    { id: 'animals', label: '🐱', name: 'Animals' },
    { id: 'nature', label: '🌸', name: 'Nature' },
    { id: 'fantasy', label: '👑', name: 'Fantasy' },
  ]

  const filteredStickers = STICKERS.filter(s => s.category === activeCategory)

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all hover:scale-105"
        style={{
          background: `${BRAND_COLORS.secondary}20`,
          color: BRAND_COLORS.secondary,
          minWidth: '44px',
          minHeight: '44px',
        }}
        title="Open stickers"
      >
        <span className="text-xl">🎯</span>
        <span className="hidden sm:inline text-sm">Stickers</span>
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-lg border-2 animate-slide-up" style={{ borderColor: `${BRAND_COLORS.secondary}40` }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm" style={{ color: BRAND_COLORS.tertiary }}>Stickers</h3>
        <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 mb-3">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              activeCategory === cat.id ? 'bg-orange-100 scale-105' : 'hover:bg-gray-100'
            }`}
            title={cat.name}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Sticker grid */}
      <div className="grid grid-cols-5 gap-2">
        {filteredStickers.map(sticker => (
          <button
            key={sticker.id}
            onClick={() => onStickerSelect(sticker)}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-orange-50 hover:scale-125 transition-all text-2xl"
            title={sticker.name}
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            {sticker.emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
