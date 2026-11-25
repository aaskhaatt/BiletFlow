import type { ru } from '@/i18n/locales/ru'

type MessageTree<T> = { [K in keyof T]: T[K] extends string ? string : MessageTree<T[K]> }

/** The shape every language must have: the same keys as Russian, any text. */
export type Messages = MessageTree<typeof ru>
