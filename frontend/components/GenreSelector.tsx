'use client'

import { useState } from 'react'
import type { Genre } from '../lib/types'
import { GENRES, DEFAULT_GENRE } from '../lib/constants'
import { BRAND_COLORS } from '../lib/branding'

/** Emoji illustrations for each genre. */
const GENRE_EMOJIS: Record<Genre, string> = {
  fantasy_kingdom: '🏰',
  outer_space: '🚀',
  underwater_world: '🐠',
  jungle_safari: '🦁',
}

interface GenreSelectorProps {
  /** Called when a genre card is selected. */
  onGenreSelected: (genre: Genre) => void
  /** Optionally pre-select a genre. Defaults to none (Fantasy Kingdom used if user proceeds without selecting). */
  initialGenre?: Genre | null
}

/**
 * GenreSelector renders 4+ genre cards in a responsive grid.
 * Each card displays an emoji illustration, genre name, and short description.
 * Selecting a card highlights it with a scale + border + glow effect.
 * If the user proceeds without selecting, Fantasy Kingdom is used as default.
 *
 * Requirements: 5.1, 5.3, 5.4, 5.5
 */
export default function GenreSelector({ onGenreSelected, initialGenre = null }: GenreSelectorProps) {
  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(initialGenre)

  const handleSelect = (genreId: Genre) => {
    setSelectedGenre(genreId)
    onGenreSelected(genreId)
  }

  /**
   * Returns the genre to use when proceeding.
   * If none is explicitly selected, defaults to Fantasy Kingdom (Requirement 5.4).
   */
  const getEffectiveGenre = (): Genre => {
    return selectedGenre ?? DEFAULT_GENRE
  }

  return (
    <div className="w-full">
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        role="radiogroup"
        aria-label="Choose a story genre"
      >
        {GENRES.map((genre) => {
          const isSelected = selectedGenre === genre.id

          return (
            <button
              key={genre.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${genre.name}: ${genre.description}`}
              onClick={() => handleSelect(genre.id)}
              className={`
                relative flex flex-col items-center justify-center
                rounded-2xl border-2 p-6
                cursor-pointer select-none
                transition-all duration-300 ease-out
                focus:outline-none focus:ring-2 focus:ring-offset-2
                ${isSelected
                  ? 'border-orange-400 bg-orange-50 scale-105 shadow-lg shadow-orange-200'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
                }
              `}
              style={{
                minWidth: '44px',
                minHeight: '44px',
                ...(isSelected
                  ? {
                      borderColor: BRAND_COLORS.primary,
                      boxShadow: `0 4px 20px ${BRAND_COLORS.primary}33`,
                    }
                  : {}),
              }}
            >
              {/* Genre emoji illustration */}
              <span
                className={`text-5xl mb-3 transition-transform duration-300 ${
                  isSelected ? 'scale-110' : ''
                }`}
                aria-hidden="true"
              >
                {GENRE_EMOJIS[genre.id]}
              </span>

              {/* Genre name */}
              <span
                className={`text-base font-bold mb-1 transition-colors duration-200 ${
                  isSelected ? 'text-orange-700' : 'text-gray-700'
                }`}
              >
                {genre.name}
              </span>

              {/* Genre description (max 50 chars enforced by constants) */}
              <span
                className={`text-sm text-center leading-tight transition-colors duration-200 ${
                  isSelected ? 'text-orange-600' : 'text-gray-500'
                }`}
              >
                {genre.description}
              </span>

              {/* Selection indicator */}
              {isSelected && (
                <span
                  className="absolute top-2 right-2 flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
                  style={{ backgroundColor: BRAND_COLORS.primary }}
                  aria-hidden="true"
                >
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Export for testing: returns the default genre when none selected. */
export { DEFAULT_GENRE, GENRE_EMOJIS }
