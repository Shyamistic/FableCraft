'use client'

import { useState } from 'react'
import { BRAND_COLORS } from '@/lib/branding'

export type DifficultyLevel = 'easy' | 'medium' | 'advanced'

export interface DifficultyConfig {
  level: DifficultyLevel
  maxWordsPerSentence: number
  vocabularyLevel: 'basic' | 'intermediate' | 'rich'
  questionComplexity: 'simple' | 'moderate' | 'nuanced'
  ageRange: string
}

export const DIFFICULTY_CONFIGS: Record<DifficultyLevel, DifficultyConfig> = {
  easy: {
    level: 'easy',
    maxWordsPerSentence: 8,
    vocabularyLevel: 'basic',
    questionComplexity: 'simple',
    ageRange: '4-5',
  },
  medium: {
    level: 'medium',
    maxWordsPerSentence: 15,
    vocabularyLevel: 'intermediate',
    questionComplexity: 'moderate',
    ageRange: '5-6',
  },
  advanced: {
    level: 'advanced',
    maxWordsPerSentence: 25,
    vocabularyLevel: 'rich',
    questionComplexity: 'nuanced',
    ageRange: '6-8',
  },
}

interface DifficultySelectorProps {
  selected: DifficultyLevel
  onSelect: (level: DifficultyLevel) => void
}

const DIFFICULTY_OPTIONS: { level: DifficultyLevel; emoji: string; label: string; desc: string; color: string }[] = [
  { level: 'easy', emoji: '🌱', label: 'Easy', desc: 'Ages 4-5 • Short sentences', color: BRAND_COLORS.success },
  { level: 'medium', emoji: '🌿', label: 'Medium', desc: 'Ages 5-6 • Moderate challenge', color: BRAND_COLORS.secondary },
  { level: 'advanced', emoji: '🌳', label: 'Advanced', desc: 'Ages 6-8 • Rich vocabulary', color: BRAND_COLORS.tertiary },
]

export default function DifficultySelector({ selected, onSelect }: DifficultySelectorProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-bold text-center" style={{ color: BRAND_COLORS.tertiary }}>
        Choose Difficulty
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {DIFFICULTY_OPTIONS.map(opt => (
          <button
            key={opt.level}
            onClick={() => onSelect(opt.level)}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:scale-105 ${
              selected === opt.level ? 'scale-105 shadow-md' : 'opacity-80'
            }`}
            style={{
              borderColor: selected === opt.level ? opt.color : '#e5e7eb',
              background: selected === opt.level ? `${opt.color}10` : 'white',
              minHeight: '44px',
            }}
            aria-pressed={selected === opt.level}
            aria-label={`${opt.label} difficulty: ${opt.desc}`}
          >
            <span className="text-3xl">{opt.emoji}</span>
            <span className="font-bold" style={{ color: opt.color }}>{opt.label}</span>
            <span className="text-xs text-gray-500 text-center">{opt.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
