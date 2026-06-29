import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ImageUploader, { validateFileFormat, validateFileSize } from './ImageUploader'

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Upload: () => <span data-testid="upload-icon" />,
  X: () => <span data-testid="x-icon" />,
  ImageIcon: () => <span data-testid="image-icon" />,
}))

function createMockFile(
  name: string,
  size: number,
  type: string
): File {
  const buffer = new ArrayBuffer(size)
  return new File([buffer], name, { type })
}

describe('ImageUploader', () => {
  let onImageReady: jest.Mock

  beforeEach(() => {
    onImageReady = jest.fn()
  })

  describe('validateFileFormat', () => {
    it('accepts PNG files', () => {
      const file = createMockFile('test.png', 1000, 'image/png')
      expect(validateFileFormat(file)).toBeNull()
    })

    it('accepts JPEG files', () => {
      const file = createMockFile('test.jpg', 1000, 'image/jpeg')
      expect(validateFileFormat(file)).toBeNull()
    })

    it('accepts WEBP files', () => {
      const file = createMockFile('test.webp', 1000, 'image/webp')
      expect(validateFileFormat(file)).toBeNull()
    })

    it('rejects GIF files with specific error message', () => {
      const file = createMockFile('test.gif', 1000, 'image/gif')
      expect(validateFileFormat(file)).toBe(
        'Please use a PNG, JPG, or WEBP image'
      )
    })

    it('rejects BMP files', () => {
      const file = createMockFile('test.bmp', 1000, 'image/bmp')
      expect(validateFileFormat(file)).toBe(
        'Please use a PNG, JPG, or WEBP image'
      )
    })

    it('rejects non-image files', () => {
      const file = createMockFile('test.pdf', 1000, 'application/pdf')
      expect(validateFileFormat(file)).toBe(
        'Please use a PNG, JPG, or WEBP image'
      )
    })
  })

  describe('validateFileSize', () => {
    it('accepts files exactly 5 MB', () => {
      const file = createMockFile('test.png', 5 * 1024 * 1024, 'image/png')
      expect(validateFileSize(file)).toBeNull()
    })

    it('accepts files smaller than 5 MB', () => {
      const file = createMockFile('test.png', 1024, 'image/png')
      expect(validateFileSize(file)).toBeNull()
    })

    it('rejects files larger than 5 MB with specific error message', () => {
      const file = createMockFile(
        'test.png',
        5 * 1024 * 1024 + 1,
        'image/png'
      )
      expect(validateFileSize(file)).toBe(
        'Your picture is too big! Please pick one smaller than 5 MB'
      )
    })
  })

  describe('component rendering', () => {
    it('renders the upload prompt when no image is selected', () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      expect(screen.getByText('Drop your picture here')).toBeInTheDocument()
      expect(
        screen.getByText('PNG, JPG, or WEBP — up to 5 MB')
      ).toBeInTheDocument()
      expect(screen.getByText('Choose a Picture')).toBeInTheDocument()
    })

    it('has a hidden file input with correct accept attribute', () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const input = screen.getByLabelText('Upload an image')
      expect(input).toHaveAttribute('accept', '.png,.jpg,.jpeg,.webp')
      expect(input).toHaveAttribute('type', 'file')
    })

    it('renders the Choose a Picture button with min 44x44px tap target', () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const button = screen.getByText('Choose a Picture')
      expect(button).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
    })
  })

  describe('file selection via input', () => {
    it('displays error for invalid format', async () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const input = screen.getByLabelText('Upload an image')
      const file = createMockFile('test.gif', 1000, 'image/gif')

      fireEvent.change(input, { target: { files: [file] } })

      expect(
        screen.getByText('Please use a PNG, JPG, or WEBP image')
      ).toBeInTheDocument()
      expect(onImageReady).not.toHaveBeenCalled()
    })

    it('displays error for oversized file', async () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const input = screen.getByLabelText('Upload an image')
      const file = createMockFile(
        'big.png',
        6 * 1024 * 1024,
        'image/png'
      )

      fireEvent.change(input, { target: { files: [file] } })

      expect(
        screen.getByText(
          'Your picture is too big! Please pick one smaller than 5 MB'
        )
      ).toBeInTheDocument()
      expect(onImageReady).not.toHaveBeenCalled()
    })

    it('calls onImageReady with base64 data for valid file', async () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const input = screen.getByLabelText('Upload an image')
      const file = createMockFile('test.png', 1024, 'image/png')

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        expect(onImageReady).toHaveBeenCalledTimes(1)
      })

      const base64Arg = onImageReady.mock.calls[0][0]
      expect(base64Arg).toMatch(/^data:image\/png;base64,/)
    })

    it('shows preview image after valid file selection', async () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const input = screen.getByLabelText('Upload an image')
      const file = createMockFile('test.png', 1024, 'image/png')

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        const previewImg = screen.getByAltText('Uploaded image preview')
        expect(previewImg).toBeInTheDocument()
      })
    })

    it('shows remove button after valid file selection', async () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const input = screen.getByLabelText('Upload an image')
      const file = createMockFile('test.png', 1024, 'image/png')

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        const removeButton = screen.getByLabelText('Remove uploaded image')
        expect(removeButton).toBeInTheDocument()
        expect(removeButton).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
      })
    })
  })

  describe('remove image', () => {
    it('clears the preview and shows upload prompt again', async () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const input = screen.getByLabelText('Upload an image')
      const file = createMockFile('test.png', 1024, 'image/png')

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByAltText('Uploaded image preview')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Remove uploaded image'))

      expect(screen.queryByAltText('Uploaded image preview')).not.toBeInTheDocument()
      expect(screen.getByText('Drop your picture here')).toBeInTheDocument()
    })
  })

  describe('drag and drop', () => {
    it('shows drag over state', () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const dropZone = screen.getByText('Drop your picture here').closest('div[class*="border-dashed"]')!

      fireEvent.dragOver(dropZone, {
        dataTransfer: { files: [] },
      })

      expect(dropZone).toHaveClass('border-orange-400')
    })

    it('resets drag state on drag leave', () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const dropZone = screen.getByText('Drop your picture here').closest('div[class*="border-dashed"]')!

      fireEvent.dragOver(dropZone, {
        dataTransfer: { files: [] },
      })
      fireEvent.dragLeave(dropZone, {
        dataTransfer: { files: [] },
      })

      expect(dropZone).not.toHaveClass('border-orange-400')
    })
  })

  describe('error display', () => {
    it('displays error with role="alert" for accessibility', () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const input = screen.getByLabelText('Upload an image')
      const file = createMockFile('test.gif', 1000, 'image/gif')

      fireEvent.change(input, { target: { files: [file] } })

      const errorEl = screen.getByRole('alert')
      expect(errorEl).toBeInTheDocument()
      expect(errorEl).toHaveTextContent('Please use a PNG, JPG, or WEBP image')
    })

    it('clears error when a valid file is selected', async () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const input = screen.getByLabelText('Upload an image')

      // First trigger an error
      const badFile = createMockFile('test.gif', 1000, 'image/gif')
      fireEvent.change(input, { target: { files: [badFile] } })
      expect(screen.getByRole('alert')).toBeInTheDocument()

      // Then select a valid file
      const goodFile = createMockFile('test.png', 1024, 'image/png')
      fireEvent.change(input, { target: { files: [goodFile] } })

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      })
    })
  })

  describe('preview image constraints', () => {
    it('constrains preview to 900x600 max dimensions', async () => {
      render(<ImageUploader onImageReady={onImageReady} />)
      const input = screen.getByLabelText('Upload an image')
      const file = createMockFile('test.png', 1024, 'image/png')

      fireEvent.change(input, { target: { files: [file] } })

      await waitFor(() => {
        const previewImg = screen.getByAltText('Uploaded image preview')
        expect(previewImg).toHaveStyle({
          maxWidth: '900px',
          maxHeight: '600px',
          objectFit: 'contain',
        })
      })
    })
  })
})
