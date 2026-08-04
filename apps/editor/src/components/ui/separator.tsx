import { Separator as BaseSeparator } from '@base-ui/react/separator';
import type * as React from 'react';

import { cn } from '@/lib/utils';

function Separator({
  className,
  orientation = 'horizontal',
  ref,
  ...props
}: React.ComponentProps<typeof BaseSeparator>) {
  return (
    <BaseSeparator
      ref={ref}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-ed-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
