import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import { CamerasPanel } from '@/features/inspector/cameras-panel';
import { EnvironmentPanel } from '@/features/inspector/environment-panel';
import { LightsPanel } from '@/features/inspector/lights-panel';
import { MaterialsPanel } from '@/features/inspector/materials-panel';
import { PostPanel } from '@/features/inspector/post-panel';
import { useSceneDocument } from '@/hooks/use-scene-document';

const INSPECTOR_TABS = [
  { value: 'environment', label: '环境', Panel: EnvironmentPanel },
  { value: 'lights', label: '灯光', Panel: LightsPanel },
  { value: 'cameras', label: '相机', Panel: CamerasPanel },
  { value: 'post', label: '后期', Panel: PostPanel },
  { value: 'materials', label: '材质', Panel: MaterialsPanel },
] as const;

/** 右侧 inspector：环境/灯光/相机/后期/材质 五个数据节面板 */
export function Inspector() {
  const { doc } = useSceneDocument();

  if (!doc) {
    return (
      <div className="p-4 text-xs leading-relaxed text-ed-text-soft">
        尚未加载场景包：从顶栏「打开场景包」/「加载示例」，或把 .prism.json +
        .glb 拖进视口。
      </div>
    );
  }

  return (
    <Tabs defaultValue="environment" className="flex h-full flex-col">
      <TabsList className="shrink-0 px-2">
        {INSPECTOR_TABS.map((tab) => (
          <TabsTab key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTab>
        ))}
      </TabsList>
      <div className="min-h-0 flex-1">
        {INSPECTOR_TABS.map(({ value, Panel }) => (
          <TabsPanel key={value} value={value} keepMounted className="h-full">
            <ScrollArea className="h-full">
              <Panel />
            </ScrollArea>
          </TabsPanel>
        ))}
      </div>
    </Tabs>
  );
}
