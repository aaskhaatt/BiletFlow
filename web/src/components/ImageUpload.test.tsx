import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import ImageUpload from '@/components/ImageUpload'
import { ru } from '@/i18n/locales/ru'

const limit = 5 * 1024 * 1024

it.each([
  { bytes: limit + 1, type: 'image/png', message: ru.errors.ImageTooLargeError },
  { bytes: 8, type: 'image/gif', message: ru.errors.InvalidImageError },
])('rejects an unsupported selection before upload', ({ bytes, type, message }) => {
  const upload = vi.fn().mockResolvedValue(undefined)
  render(<ImageUpload onUpload={upload} />)
  fireEvent.change(screen.getByLabelText(ru.imageUpload.label), {
    target: { files: [new File([new Uint8Array(bytes)], 'cover', { type })] },
  })

  expect(upload).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent(message)
})

it.each([
  [413, ru.errors.ImageTooLargeError],
  [415, ru.errors.InvalidImageError],
  [503, ru.errors.StorageUnavailableError],
])(
  'translates an API failure with status %i after accepting a valid selection',
  async (status, message) => {
    const upload = vi
      .fn()
      .mockRejectedValue(
        new ApiError({ status, error: 'UNKNOWN_ERROR', message: 'Server message' }),
      )
    render(<ImageUpload onUpload={upload} />)
    const file = new File([new Uint8Array(limit)], 'cover.webp', { type: 'image/webp' })
    fireEvent.change(screen.getByLabelText(ru.imageUpload.label), { target: { files: [file] } })

    await screen.findAllByText(message)
    expect(upload).toHaveBeenCalledExactlyOnceWith(file)
    expect(screen.getByRole('alert')).toHaveTextContent(message)
  },
)
