import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'outline' | 'ghost'
type Size = 'default' | 'sm' | 'icon'

const variantClass: Record<Variant, string> = { default: '', outline: 'btn--ghost', ghost: 'btn--quiet' }
const sizeClass: Record<Size, string> = { default: '', sm: 'btn--sm', icon: 'btn--icon' }

export function Button({ className, variant = 'default', size = 'default', type = 'button', ...props }:
  ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={cn('btn', variantClass[variant], sizeClass[size], className)} {...props} />
}
