import { cn } from 'cn'
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessageKey } from '@/api/error-codes'
import { isApiError } from '@/api/errors'
import { UploadIcon, WarningIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

const IMAGE_TYPES = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' } as const
const MAX_BYTES = 5 * 1024 * 1024

/** What went wrong with the file the organizer chose, in the words of the design. */
type Problem =
  | { kind: 'tooLarge'; file: File }
  | { kind: 'wrongType'; file: File }
  | { kind: 'server'; error: unknown }

function problemOfServerError(error: unknown, file: File): Problem {
  // The API checks the size and the content of the file itself: 413 too big, 415 not an image
  if (isApiError(error) && error.status === 413) return { kind: 'tooLarge', file }
  if (isApiError(error) && error.status === 415) return { kind: 'wrongType', file }
  return { kind: 'server', error }
}

function fileSize(bytes: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)
}

/** The picture: the file the organizer chose (from memory) or the saved cover (from its address). */
function Preview({ file, url }: { file: File | null; url: string | null | undefined }) {
  const { t } = useTranslation()
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const image = imageRef.current
    if (!image) return
    if (!file) {
      if (url) image.src = url
      return
    }
    const objectUrl = URL.createObjectURL(file)
    image.src = objectUrl
    return () => URL.revokeObjectURL(objectUrl)
  }, [file, url])

  return (
    <img
      ref={imageRef}
      alt={t('eventCover.preview')}
      className="aspect-video w-full rounded-md bg-line object-cover sm:w-80"
    />
  )
}

/**
 * "Обложка" of the event form (Figma G1): a drop zone while there is no cover, the
 * picture with "Заменить" and "Удалить" once there is one, and the problems
 * of a file (too big, not an image) written under the zone.
 *
 * `onChoose` gets a file that passed the size and type check and saves or keeps it;
 * it rejects with the API's error when the server refuses. `deferred` is for an event
 * that doesn't exist yet: the file is kept and sent when the event is saved.
 */
export default function CoverCard({
  imageUrl,
  deferred = false,
  onChoose,
  onRemove,
}: {
  imageUrl: string | null | undefined
  deferred?: boolean
  onChoose: (file: File) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const [chosen, setChosen] = useState<File | null>(null)
  const [problem, setProblem] = useState<Problem>()
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const hasCover = chosen !== null || Boolean(imageUrl)

  async function choose(file: File | undefined) {
    if (!file || busy) return
    if (file.size > MAX_BYTES) return setProblem({ kind: 'tooLarge', file })
    if (!Object.hasOwn(IMAGE_TYPES, file.type)) return setProblem({ kind: 'wrongType', file })

    setProblem(undefined)
    setBusy(true)
    try {
      await onChoose(file)
      setChosen(file)
    } catch (error) {
      setProblem(problemOfServerError(error, file))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy) return
    setProblem(undefined)
    setBusy(true)
    try {
      await onRemove()
      setChosen(null)
    } catch (error) {
      setProblem({ kind: 'server', error })
    } finally {
      setBusy(false)
    }
  }

  function message(): string | undefined {
    if (!problem) return undefined
    if (problem.kind === 'server') return t(errorMessageKey(problem.error))
    return t(problem.kind === 'tooLarge' ? 'eventCover.tooLarge' : 'eventCover.wrongType', {
      name: problem.file.name,
      size: t('eventCover.megabytes', {
        value: fileSize(problem.file.size, i18n.resolvedLanguage ?? 'ru'),
      }),
    })
  }

  const text = message()
  const open = () => input.current?.click()

  return (
    <section
      aria-labelledby="cover-title"
      className="space-y-4 rounded-lg border border-line bg-surface p-6"
      data-slot="cover-card"
    >
      <h2 id="cover-title" className="type-card-title">
        {t('eventCover.title')}
      </h2>
      <input
        ref={input}
        type="file"
        accept={Object.keys(IMAGE_TYPES).join(',')}
        aria-label={t('eventCover.choose')}
        className="sr-only"
        tabIndex={-1}
        disabled={busy}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          void choose(file)
        }}
      />

      {hasCover ? (
        <div className="flex flex-wrap items-start gap-5">
          <Preview file={chosen} url={imageUrl} />
          <div className="min-w-0 flex-1 space-y-3">
            {chosen ? (
              <>
                <p className="text-[0.9375rem] leading-[1.4] font-semibold wrap-anywhere">
                  {chosen.name}
                </p>
                <p className="type-small text-ink-muted">
                  {t(deferred ? 'eventCover.metaDeferred' : 'eventCover.metaUploaded', {
                    type: IMAGE_TYPES[chosen.type as keyof typeof IMAGE_TYPES] ?? chosen.type,
                    size: t('eventCover.megabytes', {
                      value: fileSize(chosen.size, i18n.resolvedLanguage ?? 'ru'),
                    }),
                  })}
                </p>
              </>
            ) : (
              <p className="text-[0.9375rem] leading-[1.4] font-semibold">
                {t('eventCover.saved')}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <Button type="button" variant="outline" size="sm" loading={busy} onClick={open}>
                {t('eventCover.replace')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                className="text-status-danger-fg hover:bg-status-danger-bg"
                onClick={() => void remove()}
              >
                {t('eventCover.remove')}
              </Button>
            </div>
            <p className="type-small text-ink-2">{t('eventCover.visibleIn')}</p>
          </div>
        </div>
      ) : (
        <div
          data-slot="cover-dropzone"
          data-state={problem ? 'error' : dragging ? 'over' : 'empty'}
          className={cn(
            'flex flex-col items-center gap-3 rounded-md border border-dashed px-4 py-8 text-center',
            problem
              ? 'border-status-danger-fg bg-status-danger-bg'
              : dragging
                ? 'border-brand bg-brand-soft'
                : 'border-line-field bg-line-soft',
          )}
          onDragOver={(event: DragEvent) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event: DragEvent) => {
            event.preventDefault()
            setDragging(false)
            void choose(event.dataTransfer.files[0])
          }}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-10 items-center justify-center rounded-full',
              problem ? 'bg-surface text-status-danger-fg' : 'bg-brand-soft text-brand',
            )}
          >
            <UploadIcon className="size-5" />
          </span>
          <p className="type-label font-semibold">
            {t(problem ? 'eventCover.dropAnother' : 'eventCover.drop')}
          </p>
          <Button type="button" variant="outline" size="sm" loading={busy} onClick={open}>
            {t('eventCover.choose')}
          </Button>
        </div>
      )}

      {text && (
        <p role="alert" className="type-small flex gap-1.5 text-status-danger-fg">
          <WarningIcon aria-hidden="true" className="mt-px size-4 shrink-0" />
          {text}
        </p>
      )}
      <p className="type-small text-ink-muted">{t('eventCover.hint')}</p>
    </section>
  )
}
