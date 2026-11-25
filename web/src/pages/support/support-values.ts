import type { TFunction } from 'i18next'
import { SupportStatusUpdateStatus } from '@/api/generated/model'

export const supportStatuses = Object.values(SupportStatusUpdateStatus)
export type SupportStatus = SupportStatusUpdateStatus

export const attendeeCategories = [
  'ticket_delivery',
  'payment',
  'refund',
  'seating',
  'event_information',
  'check_in',
  'account',
  'technical',
] as const
export const platformCategories = ['account', 'activation', 'payment', 'technical'] as const
const categories = [...attendeeCategories, ...platformCategories]

export function supportCategoryText(t: TFunction, category: string) {
  const known = categories.find((value) => value === category)
  return known ? t(`supportCases.categories.${known}`) : t('supportCases.otherCategory')
}

export const MAX_SUBJECT = 200
export const MAX_MESSAGE = 5000

export type CaseContext = { key: 'ticket_id' | 'order_id' | 'event_id'; id: number }

export function readCaseContext(search: URLSearchParams): CaseContext | undefined {
  for (const key of ['ticket_id', 'order_id', 'event_id'] as const) {
    const value = search.get(key)
    if (value && /^[1-9]\d*$/.test(value)) {
      const id = Number(value)
      if (Number.isSafeInteger(id)) return { key, id }
    }
  }
}
