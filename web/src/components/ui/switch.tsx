'use client'

import { cn } from 'cn'
import { Switch as SwitchPrimitive } from 'radix-ui'
import * as React from 'react'

// A switch as in the Figma ticket-type dialog ("Переключатель"): 44 x 24 px, brand
// when on, grey when off, a white thumb. Put a label next to it (it is a button
// with role "switch"); give it aria-labelledby / aria-describedby.
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-line-field transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-surface shadow-sm transition-transform data-[state=checked]:translate-x-[1.25rem] data-[state=unchecked]:translate-x-0.5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
