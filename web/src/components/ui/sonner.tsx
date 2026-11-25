import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type * as React from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

// shadcn/ui Toaster (sonner) in BiletFlow tokens. Light theme only, like the rest
// of the app. Show a toast from anywhere with toast('...') from "sonner".
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5 text-status-ok-fg" />,
        info: <InfoIcon className="size-5 text-status-info-fg" />,
        warning: <TriangleAlertIcon className="size-5 text-status-warn-fg" />,
        error: <OctagonXIcon className="size-5 text-status-danger-fg" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--bf-bg-surface)',
          '--normal-text': 'var(--bf-text-ink)',
          '--normal-border': 'var(--bf-line-default)',
          '--border-radius': 'var(--bf-radius-control)',
          '--font-family': 'var(--font-sans)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast type-body min-h-11',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
