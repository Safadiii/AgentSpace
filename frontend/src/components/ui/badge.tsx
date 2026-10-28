import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Badge({ className, ...props }: ComponentProps<'span'> & { variant?: 'default' | 'secondary' }) {
  const { variant: _variant, ...rest } = props
  return <span className={cn('tag tag--plain', className)} {...rest} />
}
