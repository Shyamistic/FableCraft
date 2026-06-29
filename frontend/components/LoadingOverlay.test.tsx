import React from 'react'
import { render, screen, act } from '@testing-library/react'
import LoadingOverlay from './LoadingOverlay'

/**
 * Tests for LoadingOverlay component
 * Validates: Requirements 16.6, 20.3
 */

describe('LoadingOverlay', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders inline loading indicator when isLoading is true', () => {
    render(<LoadingOverlay isLoading={true} message="Loading..." />)
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('does not render when isLoading is false', () => {
    render(<LoadingOverlay isLoading={false} message="Loading..." />)
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument()
  })

  it('renders overlay variant with full-screen backdrop', () => {
    render(<LoadingOverlay isLoading={true} variant="overlay" message="Creating..." />)
    expect(screen.getByTestId('loading-overlay')).toBeInTheDocument()
    expect(screen.getByText('Creating...')).toBeInTheDocument()
  })

  it('displays custom message', () => {
    render(<LoadingOverlay isLoading={true} message="Generating character..." />)
    expect(screen.getByText('Generating character...')).toBeInTheDocument()
  })

  it('shows indicator within 1 second when showDelay is set', () => {
    render(<LoadingOverlay isLoading={true} showDelay={500} message="Delayed..." />)
    // Not visible yet
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument()

    // Advance time by 500ms
    act(() => {
      jest.advanceTimersByTime(500)
    })

    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()
  })

  it('caps showDelay at 1000ms to ensure indicator shows within 1 second', () => {
    render(<LoadingOverlay isLoading={true} showDelay={5000} message="Capped..." />)
    // Not visible yet
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument()

    // Should appear at 1000ms even though showDelay was 5000
    act(() => {
      jest.advanceTimersByTime(1000)
    })

    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()
  })

  it('has proper aria attributes for accessibility', () => {
    render(<LoadingOverlay isLoading={true} message="Processing..." />)
    const indicator = screen.getByTestId('loading-indicator')
    expect(indicator).toHaveAttribute('role', 'status')
    expect(indicator).toHaveAttribute('aria-live', 'polite')
    expect(indicator).toHaveAttribute('aria-label', 'Processing...')
  })

  it('hides when isLoading becomes false', () => {
    const { rerender } = render(<LoadingOverlay isLoading={true} message="Loading..." />)
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()

    rerender(<LoadingOverlay isLoading={false} message="Loading..." />)
    expect(screen.queryByTestId('loading-indicator')).not.toBeInTheDocument()
  })
})
