import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const TooltipProvider = BaseTooltip.Provider;
const Tooltip = BaseTooltip.Root;
const TooltipTrigger = BaseTooltip.Trigger;

function TooltipContent({
  className,
  sideOffset = 6,
  ref,
  ...props
}: React.ComponentProps<typeof BaseTooltip.Popup> & { sideOffset?: number }) {
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner sideOffset={sideOffset} className="z-100">
        <BaseTooltip.Popup
          ref={ref}
          className={cn(
            'rounded-md border border-ed-border bg-ed-elevated px-2 py-1 text-xs text-ed-text-strong shadow-lg',
            className,
          )}
          {...props}
        />
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
