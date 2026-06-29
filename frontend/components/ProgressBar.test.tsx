import { render, screen } from '@testing-library/react'
import ProgressBar, { ProgressBarProps } from './ProgressBar'

describe('ProgressBar', () => {
  const defaultProps: ProgressBarProps = {
    totalScenes: 8,
    currentScene: 1,
    completedScenes: [],
    coinsEarned: 0,
  }

  describe('Scene Progress Indicator (Requirement 8.5)', () => {
    it('displays current scene number out of total scenes', () => {
      render(<ProgressBar {...defaultProps} currentScene={3} />)
      expect(screen.getByText('Scene 3 of 8')).toBeInTheDocument()
    })

    it('renders one dot per scene', () => {
      render(<ProgressBar {...defaultProps} />)
      const dots = screen.getAllByRole('listitem')
      expect(dots).toHaveLength(8)
    })

    it('marks completed scenes with a distinct visual style', () => {
      render(<ProgressBar {...defaultProps} completedScenes={[1, 2, 3]} currentScene={4} />)
      const dots = screen.getAllByRole('listitem')
      // Completed dots have success color (#34D399)
      expect(dots[0]).toHaveStyle({ backgroundColor: '#34D399' })
      expect(dots[1]).toHaveStyle({ backgroundColor: '#34D399' })
      expect(dots[2]).toHaveStyle({ backgroundColor: '#34D399' })
    })

    it('highlights the current scene distinctly from completed and incomplete', () => {
      render(<ProgressBar {...defaultProps} completedScenes={[1, 2]} currentScene={3} />)
      const dots = screen.getAllByRole('listitem')
      // Current scene has tertiary (purple) color
      expect(dots[2]).toHaveStyle({ backgroundColor: '#8B5CF6' })
    })

    it('shows incomplete scenes in gray', () => {
      render(<ProgressBar {...defaultProps} currentScene={1} />)
      const dots = screen.getAllByRole('listitem')
      // Scenes 2-8 should be gray
      for (let i = 1; i < 8; i++) {
        expect(dots[i]).toHaveStyle({ backgroundColor: '#D1D5DB' })
      }
    })

    it('provides accessible labels for each scene dot', () => {
      render(<ProgressBar {...defaultProps} completedScenes={[1]} currentScene={2} />)
      expect(screen.getByLabelText('Scene 1, completed')).toBeInTheDocument()
      expect(screen.getByLabelText('Scene 2, current')).toBeInTheDocument()
      expect(screen.getByLabelText('Scene 3')).toBeInTheDocument()
    })
  })

  describe('Star Coin Counter (Requirement 8.6)', () => {
    it('displays current coins out of 8', () => {
      render(<ProgressBar {...defaultProps} coinsEarned={3} />)
      expect(screen.getByText('3 / 8')).toBeInTheDocument()
    })

    it('displays zero coins when none earned', () => {
      render(<ProgressBar {...defaultProps} coinsEarned={0} />)
      expect(screen.getByText('0 / 8')).toBeInTheDocument()
    })

    it('displays maximum coins correctly', () => {
      render(<ProgressBar {...defaultProps} coinsEarned={8} />)
      expect(screen.getByText('8 / 8')).toBeInTheDocument()
    })

    it('shows a star emoji as visual indicator', () => {
      render(<ProgressBar {...defaultProps} coinsEarned={5} />)
      expect(screen.getByText('⭐')).toBeInTheDocument()
    })

    it('has accessible label for screen readers', () => {
      render(<ProgressBar {...defaultProps} coinsEarned={4} />)
      expect(screen.getByLabelText('4 of 8 star coins earned')).toBeInTheDocument()
    })

    it('uses aria-live polite for dynamic updates', () => {
      render(<ProgressBar {...defaultProps} coinsEarned={2} />)
      const coinCounter = screen.getByRole('status')
      expect(coinCounter).toHaveAttribute('aria-live', 'polite')
    })
  })

  describe('Accessibility', () => {
    it('wraps in a region with label "Quest progress"', () => {
      render(<ProgressBar {...defaultProps} />)
      expect(screen.getByRole('region', { name: 'Quest progress' })).toBeInTheDocument()
    })

    it('scene dots are wrapped in a list for screen readers', () => {
      render(<ProgressBar {...defaultProps} />)
      expect(screen.getByRole('list', { name: 'Scene completion status' })).toBeInTheDocument()
    })
  })
})
