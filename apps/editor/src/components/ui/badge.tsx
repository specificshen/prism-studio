import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-ed-border bg-ed-elevated text-ed-text-sub',
        primary: 'border-ed-primary/40 bg-ed-primary-weak text-ed-primary',
        error: 'border-ed-error/40 bg-ed-error/10 text-ed-error',
        warning: 'border-ed-warning/40 bg-ed-warning/10 text-ed-warning',
        success: 'border-ed-success/40 bg-ed-success/10 text-ed-success',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
