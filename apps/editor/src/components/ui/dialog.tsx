import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const Dialog = BaseDialog.Root;
const DialogTrigger = BaseDialog.Trigger;
const DialogClose = BaseDialog.Close;

function DialogContent({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof BaseDialog.Popup>) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-100 bg-black/60 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <BaseDialog.Popup
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-100 grid w-full max-w-150 -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-ed-border bg-ed-elevated p-5 shadow-xl duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:scale-95 data-starting-style:scale-95',
          className,
        )}
        {...props}
      >
        {children}
        <BaseDialog.Close className="absolute right-4 top-4 rounded text-ed-text-soft opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ed-primary/30">
          <X className="size-4" />
          <span className="sr-only">关闭</span>
        </BaseDialog.Close>
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-1.5 text-left', className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof BaseDialog.Title>) {
  return (
    <BaseDialog.Title
      ref={ref}
      className={cn('text-sm font-medium text-ed-text-strong', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof BaseDialog.Description>) {
  return (
    <BaseDialog.Description
      ref={ref}
      className={cn('text-xs text-ed-text-sub', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
