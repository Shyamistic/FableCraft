import { render, screen, fireEvent } from '@testing-library/react'
import GenreSelector, { DEFAULT_GENRE, GENRE_EMOJIS } from './GenreSelector'
import { GENRES } from '../lib/constants'

describe('GenreSelector', () => {
  const mockOnGenreSelected = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders all 4 genre cards', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      const cards = screen.getAllByRole('radio')
      expect(cards).toHaveLength(4)
    })

    it('renders genre names on each card', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      expect(screen.getByText('Fantasy Kingdom')).toBeInTheDocument()
      expect(screen.getByText('Outer Space')).toBeInTheDocument()
      expect(screen.getByText('Underwater World')).toBeInTheDocument()
      expect(screen.getByText('Jungle Safari')).toBeInTheDocument()
    })

    it('renders genre descriptions on each card', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      expect(screen.getByText('Castles, dragons, and magical lands')).toBeInTheDocument()
      expect(screen.getByText('Planets, stars, and cosmic adventures')).toBeInTheDocument()
      expect(screen.getByText('Ocean depths and sea creatures')).toBeInTheDocument()
      expect(screen.getByText('Wild animals and tropical forests')).toBeInTheDocument()
    })

    it('renders emoji illustrations for each genre', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      expect(screen.getByText('🏰')).toBeInTheDocument()
      expect(screen.getByText('🚀')).toBeInTheDocument()
      expect(screen.getByText('🐠')).toBeInTheDocument()
      expect(screen.getByText('🦁')).toBeInTheDocument()
    })

    it('each genre description is at most 50 characters', () => {
      for (const genre of GENRES) {
        expect(genre.description.length).toBeLessThanOrEqual(50)
      }
    })

    it('renders a radiogroup with accessible label', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      expect(screen.getByRole('radiogroup', { name: /choose a story genre/i })).toBeInTheDocument()
    })
  })

  describe('Selection', () => {
    it('highlights the selected genre card', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      const cards = screen.getAllByRole('radio')

      fireEvent.click(cards[1]) // Select "Outer Space"
      expect(cards[1]).toHaveAttribute('aria-checked', 'true')
      expect(cards[0]).toHaveAttribute('aria-checked', 'false')
    })

    it('calls onGenreSelected callback when a genre is selected', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      const cards = screen.getAllByRole('radio')

      fireEvent.click(cards[0]) // Select "Fantasy Kingdom"
      expect(mockOnGenreSelected).toHaveBeenCalledWith('fantasy_kingdom')
    })

    it('calls onGenreSelected with correct genre id for each card', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      const cards = screen.getAllByRole('radio')

      fireEvent.click(cards[0])
      expect(mockOnGenreSelected).toHaveBeenCalledWith('fantasy_kingdom')

      fireEvent.click(cards[1])
      expect(mockOnGenreSelected).toHaveBeenCalledWith('outer_space')

      fireEvent.click(cards[2])
      expect(mockOnGenreSelected).toHaveBeenCalledWith('underwater_world')

      fireEvent.click(cards[3])
      expect(mockOnGenreSelected).toHaveBeenCalledWith('jungle_safari')
    })

    it('shows a checkmark indicator on the selected card', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      const cards = screen.getAllByRole('radio')

      // Initially no checkmark visible
      expect(screen.queryByText('✓')).not.toBeInTheDocument()

      fireEvent.click(cards[2]) // Select "Underwater World"
      expect(screen.getByText('✓')).toBeInTheDocument()
    })

    it('no card is selected by default when initialGenre is null', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      const cards = screen.getAllByRole('radio')
      cards.forEach((card) => {
        expect(card).toHaveAttribute('aria-checked', 'false')
      })
    })

    it('pre-selects the card matching initialGenre prop', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} initialGenre="outer_space" />)
      const cards = screen.getAllByRole('radio')
      expect(cards[1]).toHaveAttribute('aria-checked', 'true')
    })
  })

  describe('Default Genre (Requirement 5.4)', () => {
    it('defaults to fantasy_kingdom when exported', () => {
      expect(DEFAULT_GENRE).toBe('fantasy_kingdom')
    })
  })

  describe('Highlight Timing (Requirement 5.5)', () => {
    it('applies transition with duration under 1 second', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      const cards = screen.getAllByRole('radio')
      // Each card has transition-all duration-300 (300ms < 1000ms)
      for (const card of cards) {
        expect(card.className).toContain('duration-300')
      }
    })
  })

  describe('Tap Target Size (Requirement 20.4)', () => {
    it('each genre card has minimum 44x44px tap target', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      const cards = screen.getAllByRole('radio')
      for (const card of cards) {
        expect(card).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
      }
    })
  })

  describe('Accessibility', () => {
    it('each card has an aria-label with genre name and description', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      expect(screen.getByLabelText('Fantasy Kingdom: Castles, dragons, and magical lands')).toBeInTheDocument()
      expect(screen.getByLabelText('Outer Space: Planets, stars, and cosmic adventures')).toBeInTheDocument()
      expect(screen.getByLabelText('Underwater World: Ocean depths and sea creatures')).toBeInTheDocument()
      expect(screen.getByLabelText('Jungle Safari: Wild animals and tropical forests')).toBeInTheDocument()
    })

    it('emoji illustrations are hidden from screen readers', () => {
      render(<GenreSelector onGenreSelected={mockOnGenreSelected} />)
      const emojis = screen.getAllByText(/[🏰🚀🐠🦁]/)
      for (const emoji of emojis) {
        expect(emoji).toHaveAttribute('aria-hidden', 'true')
      }
    })
  })

  describe('GENRE_EMOJIS export', () => {
    it('has an emoji for every genre', () => {
      expect(GENRE_EMOJIS.fantasy_kingdom).toBe('🏰')
      expect(GENRE_EMOJIS.outer_space).toBe('🚀')
      expect(GENRE_EMOJIS.underwater_world).toBe('🐠')
      expect(GENRE_EMOJIS.jungle_safari).toBe('🦁')
    })
  })
})
