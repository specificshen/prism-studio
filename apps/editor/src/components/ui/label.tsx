import type * as React from 'react';

import { cn } from '@/lib/utils';

function Label({ className, ref, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      ref={ref}
      className={cn(
        'text-xs text-ed-text-sub select-none leading-none',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
