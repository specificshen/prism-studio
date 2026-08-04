import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const Tabs = BaseTabs.Root;

function TabsList({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof BaseTabs.List>) {
  return (
    <BaseTabs.List
      ref={ref}
      className={cn(
        'flex items-center gap-1 border-b border-ed-border',
        className,
      )}
      {...props}
    />
  );
}

function TabsTab({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof BaseTabs.Tab>) {
  return (
    <BaseTabs.Tab
      ref={ref}
      className={cn(
        'inline-flex h-8 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-2 text-xs text-ed-text-sub transition-colors hover:text-ed-text-strong focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-selected:border-ed-primary data-selected:text-ed-text-strong',
        className,
      )}
      {...props}
    />
  );
}

function TabsPanel({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof BaseTabs.Panel>) {
  return (
    <BaseTabs.Panel
      ref={ref}
      className={cn('min-h-0 flex-1 focus-visible:outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsPanel, TabsTab };
