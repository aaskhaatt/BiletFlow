import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { errorCodeOf, errorMessageKey } from '@/api/error-codes'
import type { EventResponse, StaffResponse } from '@/api/generated/model'
import { useEventStaff, useStaffActions } from '@/api/hooks/organizer-operations'
import ConfirmDialog from '@/components/ConfirmDialog'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import InlineAlert from '@/components/InlineAlert'
import ResponsiveTable, { type TableColumn } from '@/components/ResponsiveTable'
import TextField from '@/components/TextField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { formatEventTime } from '@/lib/format'

export default function EventStaff({ event }: { event: EventResponse }) {
  const { t } = useTranslation()
  const staff = useEventStaff(event.id)
  const { assign, remove } = useStaffActions(event.id)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string>()
  const [notice, setNotice] = useState<'assigned' | 'removed'>()
  const sending = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const busy = assign.isPending || remove.isPending

  function changeOpen(value: boolean) {
    if (sending.current) return
    setOpen(value)
    if (value) {
      setEmail('')
      setEmailError(undefined)
      assign.reset()
    }
  }

  async function submit(form: FormEvent<HTMLFormElement>) {
    form.preventDefault()
    if (sending.current || busy) return
    const value = email.trim()
    if (!z.email().safeParse(value).success) {
      setEmailError(t('auth.invalidEmail'))
      input.current?.focus()
      return
    }
    sending.current = true
    setEmailError(undefined)
    setNotice(undefined)
    try {
      await assign.mutateAsync(value)
      setOpen(false)
      setNotice('assigned')
    } catch (error) {
      const code = errorCodeOf(error)
      if (
        code === 'UserNotFoundError' ||
        code === 'StaffAlreadyAssignedError' ||
        code === 'VALIDATION_ERROR'
      ) {
        setEmailError(t(errorMessageKey(error)))
        input.current?.focus()
      }
    } finally {
      sending.current = false
    }
  }

  const columns: TableColumn<StaffResponse>[] = [
    { id: 'email', header: t('checkout.email'), cell: (row) => row.email },
    {
      id: 'date',
      header: t('eventOperations.assignedAt'),
      cell: (row) => <time dateTime={row.created_at}>{formatEventTime(row.created_at)}</time>,
    },
    {
      id: 'remove',
      header: t('eventOperations.actions'),
      cell: (row) => (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm" disabled={busy}>
              {t('eventOperations.removeStaff')}
            </Button>
          }
          title={t('eventOperations.removeStaff')}
          description={t('eventOperations.removeDescription', { email: row.email })}
          confirmLabel={t('eventOperations.removeStaff')}
          onConfirm={() => {
            setNotice(undefined)
            remove.mutate(row.user_id, { onSuccess: () => setNotice('removed') })
          }}
        />
      ),
    },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-small text-ink-2">{t('eventOperations.staffDescription')}</p>
        <Dialog open={open} onOpenChange={changeOpen}>
          <DialogTrigger asChild>
            <Button type="button" disabled={busy}>
              {t('eventOperations.assignStaff')}
            </Button>
          </DialogTrigger>
          <DialogContent showCloseButton={!assign.isPending}>
            <DialogTitle>{t('eventOperations.assignStaff')}</DialogTitle>
            <DialogDescription>{t('eventOperations.staffDescription')}</DialogDescription>
            <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
              <TextField
                ref={input}
                type="email"
                autoComplete="off"
                label={t('checkout.email')}
                value={email}
                error={emailError}
                readOnly={assign.isPending}
                required
                onChange={(event) => {
                  setEmail(event.target.value)
                  setEmailError(undefined)
                  assign.reset()
                }}
              />
              {assign.isError && !emailError && (
                <InlineAlert tone="danger" role="alert">
                  {t(errorMessageKey(assign.error))}
                </InlineAlert>
              )}
              <Button type="submit" loading={assign.isPending}>
                {t('eventOperations.assignStaff')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {remove.isError && (
        <InlineAlert tone="danger" role="alert">
          {t(errorMessageKey(remove.error))}
        </InlineAlert>
      )}
      {notice && (
        <InlineAlert tone="ok" role="status">
          {t(`eventOperations.${notice}`)}
        </InlineAlert>
      )}
      {staff.isError ? (
        <ErrorState
          title={t('eventOperations.staffError')}
          description={t(errorMessageKey(staff.error))}
          onRetry={() => void staff.refetch()}
          retrying={staff.isFetching}
        />
      ) : !staff.data ? (
        <p role="status">{t('common.loading')}</p>
      ) : staff.data.length ? (
        <ResponsiveTable
          caption={t('eventOperations.staff')}
          rows={staff.data}
          columns={columns}
          rowKey={(row) => row.user_id}
        />
      ) : (
        <EmptyState title={t('eventOperations.noStaff')} />
      )}
    </>
  )
}
