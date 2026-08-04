import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<
    React.ComponentProps<typeof BaseSelect.Root<string>>,
    'children' | 'items' | 'className' | 'onValueChange'
  > {
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  /** base-ui 原始签名会带 null（清空场景），编辑器面板不开放清空，这里收窄为 string */
  onValueChange?: (value: string) => void;
}

function Select({
  className,
  options,
  placeholder = '请选择',
  onValueChange,
  ...props
}: SelectProps) {
  return (
    <BaseSelect.Root<string>
      {...props}
      items={options.map((option) => ({
        value: option.value,
        label: option.label,
      }))}
      onValueChange={(value) => {
        if (value != null) {
          onValueChange?.(value);
        }
      }}
    >
      <BaseSelect.Trigger
        className={cn(
          'flex h-8 w-full items-center justify-between rounded-md border border-ed-border-strong bg-ed-bg px-2 text-xs text-ed-text-strong focus:border-ed-primary focus:outline-none focus:ring-2 focus:ring-ed-primary/30 disabled:cursor-not-allowed disabled:opacity-60 data-popup-open:border-ed-primary',
          className,
        )}
      >
        <BaseSelect.Value placeholder={placeholder}>
          {(value) => {
            const label =
              value == null || value === ''
                ? null
                : (options.find((option) => option.value === value)?.label ??
                  String(value));
            return label ? (
              <span className="text-ed-text-strong">{label}</span>
            ) : (
              <span className="text-ed-text-soft">{placeholder}</span>
            );
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon className="size-4 text-ed-text-soft">
          <ChevronDown className="size-4" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          align="start"
          alignItemWithTrigger={false}
          className="z-100"
          side="bottom"
          sideOffset={4}
        >
          <BaseSelect.Popup className="max-h-60 w-(--anchor-width) max-w-(--anchor-width) overflow-hidden rounded-md border border-ed-border bg-ed-elevated p-1 text-ed-text-strong shadow-lg data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:scale-95 data-starting-style:scale-95">
            <BaseSelect.List className="max-h-60 overflow-auto">
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="relative flex min-h-8 w-full cursor-default select-none items-center rounded py-1.5 pl-8 pr-2 text-xs outline-none hover:bg-ed-hover data-disabled:pointer-events-none data-disabled:opacity-60 data-selected:bg-ed-primary-weak data-selected:text-ed-primary"
                >
                  <span className="absolute left-2 flex size-3.5 items-center justify-center">
                    <BaseSelect.ItemIndicator>
                      <Check className="size-4" />
                    </BaseSelect.ItemIndicator>
                  </span>
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

export { Select };
