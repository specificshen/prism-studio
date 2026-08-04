import type { ReactNode } from 'react';

export interface PanelSectionProps {
  title: string;
  children: ReactNode;
  /** 标题行右侧的操作位（如「添加」按钮） */
  action?: ReactNode;
}

/** 面板分区：标题行 + 内容，分区之间用底部分隔线 */
export function PanelSection({ title, children, action }: PanelSectionProps) {
  return (
    <section className="flex flex-col gap-3 border-b border-ed-border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-ed-text-strong">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
