import { Switch as BaseSwitch } from '@base-ui/react/switch';
import type * as React from 'react';

import { cn } from '@/lib/utils';

export interface SwitchProps
  extends React.ComponentProps<typeof BaseSwitch.Root> {}

function Switch({ className, ref, ...props }: SwitchProps) {
  return (
    <BaseSwitch.Root
      ref={ref}
      className={cn(
        'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-ed-border-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ed-primary/30 disabled:cursor-not-allowed disabled:opacity-60 data-checked:bg-ed-primary',
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb className="pointer-events-none block size-4 rounded-full bg-white ring-0 transition-transform data-checked:translate-x-4 data-unchecked:translate-x-0" />
    </BaseSwitch.Root>
  );
}

export { Switch };
