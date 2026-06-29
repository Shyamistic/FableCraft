'use client'

import { BRAND_COLORS } from '@/lib/branding'

export type MagicBrushMode = 'normal' | 'rainbow' | 'sparkle' | 'glow' | 'neon'

interface MagicBrushSelectorProps {
  currentMode: MagicBrushMode
  onModeSelect: (mode: MagicBrushMode) => void
}

const BRUSH_MODES: { mode: MagicBrushMode; icon: string; label: string; color: string }[] = [
  { mode: 'normal', icon: '✏️', label: 'Normal', color: '#64748b' },
  { mode: 'rainbow', icon: '🌈', label: 'Rainbow', color: '#F97316' },
  { mode: 'sparkle', icon: '✨', label: 'Sparkle', color: '#FBBF24' },
  { mode: 'glow', icon: '💜', label: 'Glow', color: '#8B5CF6' },
  { mode: 'neon', icon: '💚', label: 'Neon', color: '#34D399' },
]

export default function MagicBrushSelector({ currentMode, onModeSelect }: MagicBrushSelectorProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-white rounded-xl shadow-sm border" style={{ borderColor: `${BRAND_COLORS.tertiary}20` }}>
      {BRUSH_MODES.map(brush => (
        <button
          key={brush.mode}
          onClick={() => onModeSelect(brush.mode)}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg font-semibold text-sm transition-all ${
            currentMode === brush.mode
              ? 'scale-105 shadow-md'
              : 'hover:bg-gray-50 opacity-70 hover:opacity-100'
          }`}
          style={{
            backgroundColor: currentMode === brush.mode ? `${brush.color}15` : undefined,
            color: currentMode === brush.mode ? brush.color : '#64748b',
            border: currentMode === brush.mode ? `2px solid ${brush.color}` : '2px solid transparent',
            minWidth: '44px',
            minHeight: '44px',
          }}
          title={brush.label}
        >
          <span className="text-lg">{brush.icon}</span>
          <span className="hidden sm:inline">{brush.label}</span>
        </button>
      ))}
    </div>
  )
}
