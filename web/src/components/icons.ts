import {
  Calendar as CalendarIcon,
  ChartColumn as ChartIcon,
  Check as CheckIcon,
  Clock as ClockIcon,
  Download as DownloadIcon,
  MapPin as PinIcon,
  MessageCircle as ChatIcon,
  QrCode as QrIcon,
  RotateCcw as RefundIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Tag as PromoIcon,
  Ticket as TicketIcon,
  TriangleAlert as WarningIcon,
  User as UserIcon,
  X as CloseIcon,
} from 'lucide-react'

// The icon set of the design (Figma frame "Иконки"): 24 px, stroke 2, round ends,
// color from the text around it. Lucide icons under the names used in Figma.
// Import icons from here, not from lucide-react, so the set changes in one place.
// Decorative by default (aria-hidden); give an icon aria-label when it stands alone.

export {
  CalendarIcon,
  ChartIcon,
  ChatIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  DownloadIcon,
  PinIcon,
  PromoIcon,
  QrIcon,
  RefundIcon,
  SearchIcon,
  SettingsIcon,
  TicketIcon,
  UserIcon,
  WarningIcon,
}

/** Every icon by its Figma name, in the order of the Figma frame. */
export const ICONS = {
  calendar: CalendarIcon,
  pin: PinIcon,
  ticket: TicketIcon,
  qr: QrIcon,
  search: SearchIcon,
  user: UserIcon,
  check: CheckIcon,
  close: CloseIcon,
  clock: ClockIcon,
  refund: RefundIcon,
  download: DownloadIcon,
  chat: ChatIcon,
  chart: ChartIcon,
  promo: PromoIcon,
  warning: WarningIcon,
  settings: SettingsIcon,
}

export type IconName = keyof typeof ICONS
