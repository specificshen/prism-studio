import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ed-primary/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-ed-primary text-white hover:bg-ed-primary-dark',
        destructive: 'bg-ed-error text-white hover:bg-ed-error/90',
        outline:
          'border border-ed-border-strong bg-transparent text-ed-text-strong hover:border-ed-primary hover:text-ed-primary',
        secondary:
          'bg-ed-elevated text-ed-text-strong hover:bg-ed-hover border border-ed-border',
        ghost: 'text-ed-text-sub hover:bg-ed-hover hover:text-ed-text-strong',
        link: 'text-ed-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-6 px-2 text-xs',
        lg: 'h-10 px-4',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<typeof BaseButton>,
    VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, ref, ...props }: ButtonProps) {
  return (
    <BaseButton
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
}

export { Button, buttonVariants };
