import type { ComponentProps, Ref } from 'react'
import { Dialog as Primitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Dialog = Primitive.Root
export const DialogTrigger = Primitive.Trigger
export const DialogClose = Primitive.Close
export const DialogPortal = Primitive.Portal

type Cls = { className?: string }

export function DialogOverlay({ className, ...props }: Omit<Primitive.Backdrop.Props, 'className'> & Cls) {
  return <Primitive.Backdrop className={cn('ui-overlay', className)} {...props} />
}

type Variant = 'default' | 'wide' | 'sheet'

export function DialogContent({ className, children, variant = 'default', showCloseButton = true, popupRef, ...props }:
  Omit<Primitive.Popup.Props, 'className'> & Cls & { variant?: Variant; showCloseButton?: boolean; popupRef?: Ref<HTMLDivElement> }) {
  return (
    <Primitive.Portal>
      <DialogOverlay />
      <Primitive.Popup ref={popupRef} className={cn('ui-dialog glass', variant === 'wide' && 'ui-dialog--wide', variant === 'sheet' && 'ui-dialog--sheet', className)} {...props}>
        {children}
        {showCloseButton && (
          <Primitive.Close className="ui-close" aria-label="Close"><X size={16} aria-hidden="true" /></Primitive.Close>
        )}
      </Primitive.Popup>
    </Primitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('ui-header', className)} {...props} />
}
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('ui-footer', className)} {...props} />
}
export function DialogTitle({ className, ...props }: Omit<Primitive.Title.Props, 'className'> & Cls) {
  return <Primitive.Title className={cn('ui-title', className)} {...props} />
}
export function DialogDescription({ className, ...props }: Omit<Primitive.Description.Props, 'className'> & Cls) {
  return <Primitive.Description className={cn('ui-desc', className)} {...props} />
}
