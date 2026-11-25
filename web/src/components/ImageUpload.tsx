import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/api/error-codes'
import { isApiError } from '@/api/errors'
import FormField from '@/components/FormField'

const imageTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxImageBytes = 5 * 1024 * 1024

function uploadErrorKey(error: unknown): ReturnType<typeof errorMessageKey> {
  if (isApiError(error)) {
    if (error.status === 413) return 'errors.ImageTooLargeError'
    if (error.status === 415) return 'errors.InvalidImageError'
    if (error.status === 503 && error.error !== 'StorageNotConfiguredError') {
      return 'errors.StorageUnavailableError'
    }
  }
  return errorMessageKey(error)
}

function CoverPreview({ file }: { file: File }) {
  const { t } = useTranslation()
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const image = imageRef.current
    if (!image) return
    const url = URL.createObjectURL(file)
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <img
      ref={imageRef}
      className="aspect-video w-full rounded-md object-cover"
      alt={t('imageUpload.preview')}
    />
  )
}

export default function ImageUpload({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File>()
  const [error, setError] = useState<ReturnType<typeof errorMessageKey>>()
  const [uploading, setUploading] = useState(false)
  const inFlight = useRef(false)

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!selected || inFlight.current) return

    if (selected.size > maxImageBytes) {
      setError('errors.ImageTooLargeError')
      return
    }
    if (!imageTypes.includes(selected.type)) {
      setError('errors.InvalidImageError')
      return
    }

    setError(undefined)
    inFlight.current = true
    setUploading(true)
    try {
      await onUpload(selected)
      setFile(selected)
    } catch (error) {
      setError(uploadErrorKey(error))
    } finally {
      inFlight.current = false
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3" data-slot="image-upload">
      {file && <CoverPreview file={file} />}
      <FormField
        label={t('imageUpload.label')}
        hint={t('imageUpload.hint')}
        error={error ? t(error) : undefined}
      >
        {(control) => (
          <div className="relative">
            <input
              {...control}
              type="file"
              accept={imageTypes.join(',')}
              disabled={uploading}
              className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
              onChange={(event) => void selectFile(event)}
            />
            <span
              aria-hidden="true"
              className="inline-flex min-h-11 items-center rounded-md border border-ink bg-surface px-4 type-label peer-hover:bg-line-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-disabled:opacity-60"
            >
              {t('imageUpload.choose')}
            </span>
          </div>
        )}
      </FormField>
      <p role="status" className="type-small text-ink-2">
        {uploading ? t('common.loading') : file && !error && t('imageUpload.uploaded')}
      </p>
      <div role="alert" className="sr-only">
        {error && t(error)}
      </div>
    </div>
  )
}
