import { Input as BaseInput } from '@base-ui/react/input';
import type * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.ComponentProps<typeof BaseInput> {}

function Input({ className, type, ref, ...props }: InputProps) {
  return (
    <BaseInput
      type={type}
      className={cn(
        'flex h-8 w-full rounded-md border border-ed-border-strong bg-ed-bg px-2 text-xs text-ed-text-strong placeholder:text-ed-text-soft focus-visible:border-ed-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ed-primary/30 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

export { Input };
