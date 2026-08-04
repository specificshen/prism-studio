import { useAtomValue } from 'jotai';
import {
  ClipboardList,
  Download,
  FolderOpen,
  LoaderCircle,
  Sparkles,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { sceneLoadingAtom } from '@/atoms/scene-document-atom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ValidationReportDialog } from '@/features/project/validation-report-dialog';
import { useSceneDocument } from '@/hooks/use-scene-document';
import { useScenePackage } from '@/hooks/use-scene-package';

/**
 * 顶栏：应用名 / 项目名（meta.name + dirty 标记）/
 * 打开场景包、加载示例、校验报告（badge 计数）、导出。
 */
export function TopBar() {
  const { doc, dirty, report, exportDocument } = useSceneDocument();
  const { loadFromFiles, loadSample } = useScenePackage();
  const loading = useAtomValue(sceneLoadingAtom);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const errorCount =
    report?.issues.filter((issue) => issue.severity === 'error').length ?? 0;
  const warningCount =
    (report?.issues.filter((issue) => issue.severity === 'warning').length ??
      0) + (report?.warnings.length ?? 0);

  const handleExport = () => {
    if (!doc) {
      return;
    }
    const serialized = exportDocument();
    if (!serialized) {
      return;
    }
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${doc.meta.name}.prism.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ed-border bg-ed-panel px-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ed-text-strong">
          棱镜 Prism Studio
        </span>
        <span className="text-xs text-ed-text-soft">
          {doc ? doc.meta.name : '未打开场景包'}
          {doc && dirty && <span className="ml-1 text-ed-warning">●</span>}
        </span>
      </div>

      <div className="flex-1" />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".json,.glb"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            void loadFromFiles(files);
          }
          // 允许连续选择同一批文件
          event.target.value = '';
        }}
      />

      <Button
        variant="secondary"
        size="sm"
        disabled={loading}
        onClick={() => fileInputRef.current?.click()}
      >
        {loading ? <LoaderCircle className="animate-spin" /> : <FolderOpen />}
        打开场景包
      </Button>

      <Button
        variant="secondary"
        size="sm"
        disabled={loading}
        onClick={() => void loadSample()}
      >
        <Sparkles />
        加载示例
      </Button>

      <Button
        variant="secondary"
        size="sm"
        disabled={!report}
        onClick={() => setReportOpen(true)}
      >
        <ClipboardList />
        校验报告
        {errorCount > 0 && <Badge variant="error">{errorCount}</Badge>}
        {warningCount > 0 && <Badge variant="warning">{warningCount}</Badge>}
      </Button>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="default"
              size="sm"
              disabled={!doc || loading}
              onClick={handleExport}
            />
          }
        >
          <Download />
          导出
          {dirty && <span className="text-ed-warning">●</span>}
        </TooltipTrigger>
        <TooltipContent>
          {dirty ? '有未导出的修改' : '导出规范的 .prism.json'}
        </TooltipContent>
      </Tooltip>

      <ValidationReportDialog open={reportOpen} onOpenChange={setReportOpen} />
    </header>
  );
}
