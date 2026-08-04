import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSceneDocument } from '@/hooks/use-scene-document';

export interface ValidationReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 校验报告面板（协作核心卖点）：
 * 契约 issues（error 阻断 / warning 提示）原文展示 + 渲染核运行时告警。
 */
export function ValidationReportDialog({
  open,
  onOpenChange,
}: ValidationReportDialogProps) {
  const { report } = useSceneDocument();
  const issues = report?.issues ?? [];
  const warnings = report?.warnings ?? [];
  const empty = issues.length === 0 && warnings.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col">
        <DialogHeader>
          <DialogTitle>校验报告</DialogTitle>
          <DialogDescription>
            契约校验问题（error 阻断交付，warning 提示风险）与渲染核运行时告警
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1">
          {empty ? (
            <div className="flex items-center gap-2 py-6 text-xs text-ed-success">
              <CircleCheck className="size-4" />
              暂无问题：场景包通过全部校验
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-1">
              {issues.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h4 className="text-xs font-medium text-ed-text-sub">
                    契约校验（{issues.length}）
                  </h4>
                  <ul className="flex flex-col gap-2">
                    {issues.map((issue, index) => (
                      <li
                        key={`${issue.path}-${index}`}
                        className="flex items-start gap-2 rounded-md border border-ed-border bg-ed-panel p-2"
                      >
                        {issue.severity === 'error' ? (
                          <CircleX className="mt-0.5 size-4 shrink-0 text-ed-error" />
                        ) : (
                          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-ed-warning" />
                        )}
                        <div className="min-w-0">
                          <p className="break-all font-mono text-xs text-ed-text-strong">
                            {issue.path}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-ed-text-sub">
                            {issue.message}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {warnings.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h4 className="text-xs font-medium text-ed-text-sub">
                    渲染核告警（{warnings.length}）
                  </h4>
                  <ul className="flex flex-col gap-2">
                    {warnings.map((warning) => (
                      <li
                        key={warning}
                        className="flex items-start gap-2 rounded-md border border-ed-border bg-ed-panel p-2"
                      >
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-ed-warning" />
                        <p className="text-xs leading-relaxed text-ed-text-sub">
                          {warning}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
