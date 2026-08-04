import { TooltipProvider } from '@/components/ui/tooltip';
import { Inspector } from '@/features/inspector/inspector';
import { TopBar } from '@/features/project/top-bar';
import { SceneTree } from '@/features/scene-tree/scene-tree';
import { Viewport } from '@/features/viewport/viewport';

/** 三栏布局：顶栏 48px / 左场景树 240px / 中视口 / 右 inspector 320px */
export default function App() {
  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-ed-bg text-ed-text-strong">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-60 shrink-0 flex-col border-r border-ed-border bg-ed-panel">
            <SceneTree />
          </aside>
          <main className="min-w-0 flex-1">
            <Viewport />
          </main>
          <aside className="flex w-80 shrink-0 flex-col border-l border-ed-border bg-ed-panel">
            <Inspector />
          </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}
