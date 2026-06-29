'use client'

import { useState, useCallback, useMemo } from 'react'
import type { GalleryEntry } from '../lib/types'
import { MAX_GALLERY_CHARACTERS, MAX_PERSISTED_CHARACTERS, LOCAL_STORAGE_KEY } from '../lib/constants'
import { BRAND_COLORS, BRAND_NAME } from '../lib/branding'

interface CharacterGalleryProps {
  /** Called when a character is selected from the gallery. */
  onCharacterSelected: (character: GalleryEntry) => void
  /** Called when the user wants to create a new character. */
  onCreateNew: () => void
  /** The list of gallery entries to display (from local storage or parent state). */
  characters: GalleryEntry[]
}

/** Placeholder image used when a character thumbnail fails to load. */
const PLACEHOLDER_IMAGE = '/logo-placeholder.svg'

/**
 * CharacterGallery displays stored characters as thumbnail cards, sorted
 * newest-first, with a max of 50 visible. Selecting a character proceeds
 * to Lesson Selection with that character pre-loaded.
 *
 * - Empty state: encouraging message + button to DrawingCanvas
 * - Failed thumbnail loads: replaced with placeholder image
 * - Max 50 characters displayed; oldest removed when limit exceeded
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */
export default function CharacterGallery({
  onCharacterSelected,
  onCreateNew,
  characters,
}: CharacterGalleryProps) {
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())

  /**
   * Sort characters newest-first and cap at MAX_GALLERY_CHARACTERS (50).
   * Requirement 10.2: ordered from most recently created to oldest.
   * Requirement 10.4: max 50 characters per user session.
   */
  const displayedCharacters = useMemo(() => {
    const sorted = [...characters].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return sorted.slice(0, MAX_GALLERY_CHARACTERS)
  }, [characters])

  /**
   * Handle image load error by adding the character id to failed set.
   * Requirement 10.6: display placeholder without preventing access to other characters.
   */
  const handleImageError = useCallback((characterId: string) => {
    setFailedImages((prev) => new Set(prev).add(characterId))
  }, [])

  /**
   * Handle character selection.
   * Requirement 10.3: proceed to Lesson Selection with character pre-loaded.
   */
  const handleSelect = useCallback(
    (character: GalleryEntry) => {
      onCharacterSelected(character)
    },
    [onCharacterSelected]
  )

  // Empty state (Requirement 10.5)
  if (characters.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center p-8 space-y-4"
        role="region"
        aria-label="Character Gallery"
      >
        <span className="text-6xl" aria-hidden="true">
          🎨
        </span>
        <h2 className="text-xl font-bold text-gray-700">
          No characters yet!
        </h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Draw your first character and watch them come to life in a magical adventure!
        </p>
        <button
          type="button"
          onClick={onCreateNew}
          className="px-6 py-3 rounded-xl text-white font-bold text-sm transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            backgroundColor: BRAND_COLORS.primary,
            minWidth: '44px',
            minHeight: '44px',
          }}
          aria-label="Create your first character"
        >
          ✏️ Draw a Character
        </button>
      </div>
    )
  }

  return (
    <div
      className="w-full space-y-4"
      role="region"
      aria-label="Character Gallery"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-700">
          My Characters
        </h2>
        <button
          type="button"
          onClick={onCreateNew}
          className="px-4 py-2 rounded-xl text-white font-bold text-xs transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            backgroundColor: BRAND_COLORS.primary,
            minWidth: '44px',
            minHeight: '44px',
          }}
          aria-label="Create a new character"
        >
          + New
        </button>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
        role="list"
        aria-label="Character list"
      >
        {displayedCharacters.map((character) => {
          const imageHasFailed = failedImages.has(character.id)
          const imageSrc = imageHasFailed ? PLACEHOLDER_IMAGE : character.generated_image_url

          return (
            <button
              key={character.id}
              type="button"
              role="listitem"
              onClick={() => handleSelect(character)}
              className="flex flex-col items-center rounded-2xl border-2 border-gray-200 bg-white p-3 cursor-pointer select-none transition-all duration-300 ease-out hover:border-orange-300 hover:shadow-md hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-300"
              style={{ minWidth: '44px', minHeight: '44px' }}
              aria-label={`Select ${character.name}`}
            >
              {/* Character thumbnail */}
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-gray-100 mb-2">
                <img
                  src={imageSrc}
                  alt={`${character.name} character`}
                  className="w-full h-full object-cover"
                  onError={() => handleImageError(character.id)}
                  loading="lazy"
                />
              </div>

              {/* Character name */}
              <span className="text-xs font-bold text-gray-700 text-center truncate w-full">
                {character.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Utility: Add a character to the gallery, enforcing the max limit.
 * When the gallery reaches capacity, the oldest entry is removed.
 * This function returns a new array (does not mutate the input).
 *
 * Requirement 10.1: persist character record after generation.
 * Requirement 10.4: max 50 in session, 20 persisted in local storage.
 */
export function addCharacterToGallery(
  gallery: GalleryEntry[],
  newCharacter: GalleryEntry,
  maxLimit: number = MAX_GALLERY_CHARACTERS
): GalleryEntry[] {
  // Sort newest-first, add new character at front
  const updated = [newCharacter, ...gallery.filter((c) => c.id !== newCharacter.id)]

  // Sort by created_at descending to ensure order
  updated.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // Trim to max limit, removing oldest
  if (updated.length > maxLimit) {
    return updated.slice(0, maxLimit)
  }

  return updated
}

/**
 * Utility: Get the gallery entries to persist in local storage.
 * Capped at MAX_PERSISTED_CHARACTERS (20), newest-first.
 *
 * Requirement 19.3: persist max 20 characters in local storage.
 */
export function getPersistedGallery(gallery: GalleryEntry[]): GalleryEntry[] {
  const sorted = [...gallery].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  return sorted.slice(0, MAX_PERSISTED_CHARACTERS)
}
