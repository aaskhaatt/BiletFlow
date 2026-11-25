import { cn } from 'cn'

export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('h-4 rounded-sm bg-line motion-safe:animate-pulse', className)}
      data-slot="skeleton"
    />
  )
}
