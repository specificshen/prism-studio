import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import type * as React from 'react';

import { cn } from '@/lib/utils';

export interface ScrollAreaProps
  extends React.ComponentProps<typeof BaseScrollArea.Root> {
  viewportClassName?: string;
}

function ScrollArea({
  className,
  viewportClassName,
  children,
  ref,
  ...props
}: ScrollAreaProps) {
  return (
    <BaseScrollArea.Root
      ref={ref}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <BaseScrollArea.Viewport
        className={cn('size-full outline-none', viewportClassName)}
      >
        {children}
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar
        orientation="vertical"
        className="flex w-1.5 touch-none select-none p-px"
      >
        <BaseScrollArea.Thumb className="flex-1 rounded-full bg-ed-border-strong" />
      </BaseScrollArea.Scrollbar>
      <BaseScrollArea.Corner />
    </BaseScrollArea.Root>
  );
}

export { ScrollArea };
