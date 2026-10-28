import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Separator({ className, ...props }: ComponentProps<'hr'>) {
  return <hr className={cn('separator', className)} aria-hidden="true" {...props} />
}
