import { render, screen, fireEvent } from '@testing-library/react'
import CharacterGallery, {
  addCharacterToGallery,
  getPersistedGallery,
} from './CharacterGallery'
import { MAX_GALLERY_CHARACTERS, MAX_PERSISTED_CHARACTERS } from '../lib/constants'
import type { GalleryEntry } from '../lib/types'

/** Helper to create a mock GalleryEntry with a given index for ordering. */
function createMockCharacter(index: number, overrides: Partial<GalleryEntry> = {}): GalleryEntry {
  const date = new Date(2026, 0, 1 + index, 0, 0, 0)
  return {
    id: `char-${index}`,
    name: `Character ${index}`,
    generated_image_url: `https://cdn.example.com/characters/char-${index}.png`,
    original_drawing_url: `https://cdn.example.com/drawings/char-${index}.png`,
    created_at: date.toISOString(),
    ...overrides,
  }
}

describe('CharacterGallery', () => {
  const mockOnCharacterSelected = jest.fn()
  const mockOnCreateNew = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Empty State (Requirement 10.5)', () => {
    it('displays encouraging message when no characters exist', () => {
      render(
        <CharacterGallery
          characters={[]}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      expect(screen.getByText(/no characters yet/i)).toBeInTheDocument()
      expect(screen.getByText(/draw your first character/i)).toBeInTheDocument()
    })

    it('displays a button to navigate to DrawingCanvas', () => {
      render(
        <CharacterGallery
          characters={[]}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      const button = screen.getByRole('button', { name: /create your first character/i })
      expect(button).toBeInTheDocument()
    })

    it('calls onCreateNew when the create button is clicked', () => {
      render(
        <CharacterGallery
          characters={[]}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      const button = screen.getByRole('button', { name: /create your first character/i })
      fireEvent.click(button)
      expect(mockOnCreateNew).toHaveBeenCalledTimes(1)
    })

    it('empty state button has minimum tap target size of 44px', () => {
      render(
        <CharacterGallery
          characters={[]}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      const button = screen.getByRole('button', { name: /create your first character/i })
      expect(button).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
    })
  })

  describe('Rendering Characters (Requirement 10.2)', () => {
    it('displays character thumbnails and names', () => {
      const chars = [createMockCharacter(1), createMockCharacter(2)]
      render(
        <CharacterGallery
          characters={chars}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      expect(screen.getByText('Character 1')).toBeInTheDocument()
      expect(screen.getByText('Character 2')).toBeInTheDocument()
      expect(screen.getByAltText('Character 1 character')).toBeInTheDocument()
      expect(screen.getByAltText('Character 2 character')).toBeInTheDocument()
    })

    it('orders characters newest-first', () => {
      const older = createMockCharacter(1) // Jan 2
      const newer = createMockCharacter(5) // Jan 6
      render(
        <CharacterGallery
          characters={[older, newer]}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      const items = screen.getAllByRole('listitem')
      expect(items[0]).toHaveAttribute('aria-label', 'Select Character 5')
      expect(items[1]).toHaveAttribute('aria-label', 'Select Character 1')
    })

    it('has a region labeled Character Gallery', () => {
      const chars = [createMockCharacter(1)]
      render(
        <CharacterGallery
          characters={chars}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      expect(screen.getByRole('region', { name: /character gallery/i })).toBeInTheDocument()
    })
  })

  describe('Character Selection (Requirement 10.3)', () => {
    it('calls onCharacterSelected when a character is clicked', () => {
      const chars = [createMockCharacter(1), createMockCharacter(2)]
      render(
        <CharacterGallery
          characters={chars}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      const charButton = screen.getByRole('listitem', { name: /select character 2/i })
      fireEvent.click(charButton)
      expect(mockOnCharacterSelected).toHaveBeenCalledTimes(1)
      expect(mockOnCharacterSelected).toHaveBeenCalledWith(chars[1])
    })

    it('each character button has minimum tap target of 44px', () => {
      const chars = [createMockCharacter(1)]
      render(
        <CharacterGallery
          characters={chars}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      const charButton = screen.getByRole('listitem', { name: /select character 1/i })
      expect(charButton).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
    })
  })

  describe('Max Characters Limit (Requirement 10.4)', () => {
    it('displays at most 50 characters', () => {
      const chars = Array.from({ length: 60 }, (_, i) => createMockCharacter(i))
      render(
        <CharacterGallery
          characters={chars}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      const items = screen.getAllByRole('listitem')
      expect(items.length).toBe(MAX_GALLERY_CHARACTERS)
    })

    it('retains the 50 most recently created characters', () => {
      const chars = Array.from({ length: 60 }, (_, i) => createMockCharacter(i))
      render(
        <CharacterGallery
          characters={chars}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      // The newest character (index 59) should be first
      const items = screen.getAllByRole('listitem')
      expect(items[0]).toHaveAttribute('aria-label', 'Select Character 59')
      // The oldest visible should be index 10 (60 - 50 = 10)
      expect(items[49]).toHaveAttribute('aria-label', 'Select Character 10')
    })
  })

  describe('Failed Thumbnail Loads (Requirement 10.6)', () => {
    it('shows placeholder when image fails to load', () => {
      const chars = [createMockCharacter(1)]
      render(
        <CharacterGallery
          characters={chars}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      const img = screen.getByAltText('Character 1 character')
      // Simulate image load error
      fireEvent.error(img)
      // After error, the src should be the placeholder
      expect(img).toHaveAttribute('src', '/logo-placeholder.svg')
    })

    it('other characters remain accessible after one image fails', () => {
      const chars = [createMockCharacter(1), createMockCharacter(2)]
      render(
        <CharacterGallery
          characters={chars}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      // Fail the first image
      const img1 = screen.getByAltText('Character 1 character')
      fireEvent.error(img1)

      // Second character should still be clickable
      const charButton = screen.getByRole('listitem', { name: /select character 2/i })
      fireEvent.click(charButton)
      expect(mockOnCharacterSelected).toHaveBeenCalledWith(chars[1])
    })
  })

  describe('Create New Button (with existing characters)', () => {
    it('shows a create new button when characters exist', () => {
      const chars = [createMockCharacter(1)]
      render(
        <CharacterGallery
          characters={chars}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      const button = screen.getByRole('button', { name: /create a new character/i })
      expect(button).toBeInTheDocument()
    })

    it('calls onCreateNew when create new button is clicked', () => {
      const chars = [createMockCharacter(1)]
      render(
        <CharacterGallery
          characters={chars}
          onCharacterSelected={mockOnCharacterSelected}
          onCreateNew={mockOnCreateNew}
        />
      )
      const button = screen.getByRole('button', { name: /create a new character/i })
      fireEvent.click(button)
      expect(mockOnCreateNew).toHaveBeenCalledTimes(1)
    })
  })
})

describe('addCharacterToGallery utility', () => {
  it('adds a character to an empty gallery', () => {
    const newChar = createMockCharacter(1)
    const result = addCharacterToGallery([], newChar)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('char-1')
  })

  it('places new character at front (newest-first)', () => {
    const existing = [createMockCharacter(1)]
    const newChar = createMockCharacter(5)
    const result = addCharacterToGallery(existing, newChar)
    expect(result[0].id).toBe('char-5')
    expect(result[1].id).toBe('char-1')
  })

  it('removes oldest when exceeding max limit', () => {
    const gallery = Array.from({ length: 50 }, (_, i) => createMockCharacter(i))
    const newChar = createMockCharacter(100)
    const result = addCharacterToGallery(gallery, newChar, 50)
    expect(result).toHaveLength(50)
    // Newest should be first
    expect(result[0].id).toBe('char-100')
    // Oldest (char-0) should have been removed
    expect(result.find((c) => c.id === 'char-0')).toBeUndefined()
  })

  it('does not duplicate an existing character', () => {
    const existing = [createMockCharacter(1), createMockCharacter(2)]
    const updatedChar = createMockCharacter(1, { name: 'Updated Name' })
    const result = addCharacterToGallery(existing, updatedChar)
    expect(result).toHaveLength(2)
    expect(result.filter((c) => c.id === 'char-1')).toHaveLength(1)
  })
})

describe('getPersistedGallery utility', () => {
  it('returns at most 20 characters for local storage persistence', () => {
    const gallery = Array.from({ length: 50 }, (_, i) => createMockCharacter(i))
    const persisted = getPersistedGallery(gallery)
    expect(persisted).toHaveLength(MAX_PERSISTED_CHARACTERS)
  })

  it('retains the 20 most recently created characters', () => {
    const gallery = Array.from({ length: 50 }, (_, i) => createMockCharacter(i))
    const persisted = getPersistedGallery(gallery)
    // Most recent is char-49, least recent persisted should be char-30
    expect(persisted[0].id).toBe('char-49')
    expect(persisted[19].id).toBe('char-30')
  })

  it('returns all characters if fewer than 20 exist', () => {
    const gallery = Array.from({ length: 5 }, (_, i) => createMockCharacter(i))
    const persisted = getPersistedGallery(gallery)
    expect(persisted).toHaveLength(5)
  })
})
