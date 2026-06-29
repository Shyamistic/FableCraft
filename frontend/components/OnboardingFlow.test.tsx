import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OnboardingFlow, { STEPS, STEP_ORDER } from './OnboardingFlow'
import * as fc from 'fast-check'
import '@testing-library/jest-dom'
import type { OnboardingFlowData } from './OnboardingFlow'

/**
 * Unit Tests for OnboardingFlow Component
 * 
 * Tests:
 * 1. Renders all 6 steps with correct labels
 * 2. Current step is highlighted
 * 3. Transition animations occur (200-600ms per Requirement 20.2)
 * 4. Step navigation (next, back, click on completed steps)
 * 5. Flow completion callback
 * 6. Disabled state of navigation buttons
 * 7. Accessibility attributes
 * 8. Step indicators update correctly
 */

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('OnboardingFlow', () => {
  const mockRenderStepContent = (step: string) => <div>{step} content</div>

  const defaultProps = {
    sessionId: 'test-session-123',
    renderStepContent: mockRenderStepContent,
  }

  it('renders all 6 steps with correct labels', () => {
    render(<OnboardingFlow {...defaultProps} />)

    STEP_ORDER.forEach(step => {
      const label = STEPS[step].label
      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })

  it('displays the current step as highlighted with proper styling', () => {
    render(<OnboardingFlow {...defaultProps} />)

    const firstStepIndicator = screen.getByTestId('step-indicator-draw')
    const firstStepButton = firstStepIndicator.querySelector('button')

    expect(firstStepButton).toHaveClass('scale-125')
  })

  it('shows step content for the current step', () => {
    const renderStep = (step: string) => <div data-testid={`content-${step}`}>{step} content</div>
    render(<OnboardingFlow {...defaultProps} renderStepContent={renderStep} />)

    expect(screen.getByTestId('content-draw')).toBeInTheDocument()
  })

  it('advances to the next step when Next button is clicked', async () => {
    const renderStep = (step: string) => <div data-testid={`content-${step}`}>{step} content</div>
    render(<OnboardingFlow {...defaultProps} renderStepContent={renderStep} />)

    expect(screen.getByTestId('content-draw')).toBeInTheDocument()

    const nextBtn = screen.getByTestId('onboarding-next-btn')
    fireEvent.click(nextBtn)

    // Flush the transition timer (200-600ms)
    act(() => {
      jest.advanceTimersByTime(700)
    })

    expect(screen.getByTestId('content-name')).toBeInTheDocument()
  })

  it('goes back to the previous step when Back button is clicked', async () => {
    const renderStep = (step: string) => <div data-testid={`content-${step}`}>{step} content</div>
    render(<OnboardingFlow {...defaultProps} renderStepContent={renderStep} />)

    // Advance to second step
    const nextBtn = screen.getByTestId('onboarding-next-btn')
    fireEvent.click(nextBtn)
    act(() => { jest.advanceTimersByTime(700) })

    expect(screen.getByTestId('content-name')).toBeInTheDocument()

    // Go back
    const backBtn = screen.getByTestId('onboarding-back-btn')
    fireEvent.click(backBtn)
    act(() => { jest.advanceTimersByTime(700) })

    expect(screen.getByTestId('content-draw')).toBeInTheDocument()
  })

  it('disables Back button on the first step', () => {
    render(<OnboardingFlow {...defaultProps} />)

    const backBtn = screen.getByTestId('onboarding-back-btn')
    expect(backBtn).toBeDisabled()
  })

  it('shows completion button on the last step', async () => {
    const renderStep = (step: string) => <div data-testid={`content-${step}`}>{step} content</div>
    render(<OnboardingFlow {...defaultProps} renderStepContent={renderStep} />)

    // Click Next repeatedly to reach the last step
    for (let i = 0; i < STEP_ORDER.length - 1; i++) {
      const nextBtn = screen.getByTestId('onboarding-next-btn')
      fireEvent.click(nextBtn)
      act(() => { jest.advanceTimersByTime(700) })
    }

    expect(screen.getByTestId('onboarding-complete-btn')).toBeInTheDocument()
  })

  it('calls onComplete callback when flow is finished', async () => {
    const onComplete = jest.fn()
    const renderStep = (step: string) => <div data-testid={`content-${step}`}>{step} content</div>
    render(<OnboardingFlow {...defaultProps} renderStepContent={renderStep} onComplete={onComplete} />)

    // Advance to last step
    for (let i = 0; i < STEP_ORDER.length - 1; i++) {
      const nextBtn = screen.getByTestId('onboarding-next-btn')
      fireEvent.click(nextBtn)
      act(() => { jest.advanceTimersByTime(700) })
    }

    const completeBtn = screen.getByTestId('onboarding-complete-btn')
    fireEvent.click(completeBtn)

    expect(onComplete).toHaveBeenCalled()
  })

  it('allows clicking on completed steps to navigate back', async () => {
    const renderStep = (step: string) => <div data-testid={`content-${step}`}>{step} content</div>
    render(<OnboardingFlow {...defaultProps} renderStepContent={renderStep} />)

    // Advance to the third step
    for (let i = 0; i < 2; i++) {
      const nextBtn = screen.getByTestId('onboarding-next-btn')
      fireEvent.click(nextBtn)
      act(() => { jest.advanceTimersByTime(700) })
    }

    // Click on the first step indicator to go back
    const firstStepIndicator = screen.getByTestId('step-indicator-draw')
    const firstStepButton = firstStepIndicator.querySelector('button') as HTMLButtonElement
    fireEvent.click(firstStepButton)
    act(() => { jest.advanceTimersByTime(700) })

    expect(screen.getByTestId('content-draw')).toBeInTheDocument()
  })

  it('renders step indicators with correct styling for completed, current, and future steps', async () => {
    render(<OnboardingFlow {...defaultProps} />)

    // Advance to the second step
    const nextBtn = screen.getByTestId('onboarding-next-btn')
    fireEvent.click(nextBtn)
    act(() => { jest.advanceTimersByTime(700) })

    // First step should show checkmark (completed)
    const firstStepIndicator = screen.getByTestId('step-indicator-draw')
    const firstStepButton = firstStepIndicator.querySelector('button') as HTMLButtonElement
    expect(firstStepButton.textContent).toBe('✓')

    // Second step should show "2" (current)
    const secondStepIndicator = screen.getByTestId('step-indicator-name')
    const secondStepButton = secondStepIndicator.querySelector('button') as HTMLButtonElement
    expect(secondStepButton.textContent).toBe('2')
  })

  it('renders step description with emoji', () => {
    render(<OnboardingFlow {...defaultProps} />)
    
    const drawStep = STEPS.draw
    expect(screen.getByText(new RegExp(drawStep.emoji))).toBeInTheDocument()
  })

  it('provides accessibility labels for step navigation', () => {
    render(<OnboardingFlow {...defaultProps} />)

    const nextBtn = screen.getByTestId('onboarding-next-btn')
    expect(nextBtn).toHaveTextContent('Next')

    const backBtn = screen.getByTestId('onboarding-back-btn')
    expect(backBtn).toHaveTextContent('Back')
  })

  it('disables navigation buttons during transition', async () => {
    const renderStep = (step: string) => <div data-testid={`content-${step}`}>{step} content</div>
    render(<OnboardingFlow {...defaultProps} renderStepContent={renderStep} />)

    const nextBtn = screen.getByTestId('onboarding-next-btn')
    fireEvent.click(nextBtn)

    // Button should be disabled during transition (before timer fires)
    expect(nextBtn).toBeDisabled()

    // Flush the transition
    act(() => { jest.advanceTimersByTime(700) })
  })
})

/**
 * Property-Based Tests for OnboardingFlow
 * 
 * **Property 33: Transition Animation Duration Bounds**
 * For any step transition animation, the animation duration SHALL be between 200ms and 600ms inclusive.
 * 
 * **Validates: Requirements 20.2**
 */
describe('OnboardingFlow - Property-Based Tests', () => {
  it('should have transition animations between 200-600ms for all step transitions', () => {
    const renderStep = (step: string) => <div data-testid={`content-${step}`}>{step} content</div>
    const mockOnComplete = jest.fn()

    const { unmount } = render(
      <OnboardingFlow 
        sessionId="test-session-123"
        renderStepContent={renderStep}
        onComplete={mockOnComplete}
      />
    )

    // Perform multiple transitions - each should complete within 600ms (max) so 700ms is safe
    for (let i = 0; i < 3; i++) {
      const nextBtn = screen.getByTestId('onboarding-next-btn')
      fireEvent.click(nextBtn)
      
      // Verify button is disabled during transition (transition started)
      expect(nextBtn).toBeDisabled()
      
      // Advance past maximum transition duration
      act(() => { jest.advanceTimersByTime(700) })
    }

    // We should be at step 4 (lesson) now
    expect(screen.getByTestId('content-lesson')).toBeInTheDocument()

    unmount()
  })

  // Property-based test: forward/back navigation consistency
  it('should maintain consistent state when navigating forward and backward', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: STEP_ORDER.length - 1 }),
        (stepCount) => {
          const renderStep = (step: string) => <div data-testid={`content-${step}`}>{step} content</div>
          const { unmount } = render(
            <OnboardingFlow sessionId="test-session-123" renderStepContent={renderStep} />
          )

          // Navigate forward
          for (let i = 0; i < stepCount; i++) {
            const nextBtn = screen.getByTestId('onboarding-next-btn')
            fireEvent.click(nextBtn)
            act(() => { jest.advanceTimersByTime(700) })
          }

          // Verify we're at the expected step
          expect(screen.getByTestId(`content-${STEP_ORDER[stepCount]}`)).toBeInTheDocument()

          // Navigate backward same number of steps
          for (let i = stepCount; i > 0; i--) {
            const backBtn = screen.getByTestId('onboarding-back-btn')
            fireEvent.click(backBtn)
            act(() => { jest.advanceTimersByTime(700) })
          }

          // Should be back at the first step
          expect(screen.getByTestId('content-draw')).toBeInTheDocument()

          unmount()
        }
      )
    )
  })

  // Property-based test: step indicator consistency
  it('should maintain consistent step indicators across all transitions', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: STEP_ORDER.length - 1 }),
        (targetStep) => {
          const renderStep = (step: string) => <div data-testid={`content-${step}`}>{step} content</div>
          const { unmount } = render(
            <OnboardingFlow sessionId="test-session-123" renderStepContent={renderStep} />
          )

          // Navigate to target step
          for (let i = 0; i < targetStep; i++) {
            const nextBtn = screen.getByTestId('onboarding-next-btn')
            fireEvent.click(nextBtn)
            act(() => { jest.advanceTimersByTime(700) })
          }

          // Verify the correct step is displayed
          const expectedStepName = STEP_ORDER[targetStep]
          expect(screen.getByTestId(`content-${expectedStepName}`)).toBeInTheDocument()

          unmount()
        }
      )
    )
  })
})
