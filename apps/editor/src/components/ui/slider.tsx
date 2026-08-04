import { Slider as BaseSlider } from '@base-ui/react/slider';
import type * as React from 'react';

import { cn } from '@/lib/utils';

export interface SliderProps
  extends Omit<
    React.ComponentProps<typeof BaseSlider.Root<number>>,
    'value' | 'defaultValue' | 'onValueChange'
  > {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
}

function Slider({
  className,
  value,
  defaultValue,
  onValueChange,
  ref,
  ...props
}: SliderProps) {
  return (
    <BaseSlider.Root
      ref={ref}
      className={cn('relative flex w-full touch-none items-center', className)}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      {...props}
    >
      <BaseSlider.Control className="relative flex w-full items-center">
        <BaseSlider.Track className="h-1.5 w-full grow overflow-hidden rounded-full bg-ed-border">
          <BaseSlider.Indicator className="h-full bg-ed-primary" />
        </BaseSlider.Track>
        <BaseSlider.Thumb className="block size-4 rounded-full border border-ed-primary bg-ed-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ed-primary/30 disabled:pointer-events-none disabled:opacity-60" />
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}

export { Slider };
