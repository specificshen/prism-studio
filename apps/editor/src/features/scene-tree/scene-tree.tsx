import { useAtomValue } from 'jotai';
import { Box, Folder, Lightbulb, Sun } from 'lucide-react';
import { useMemo } from 'react';
import type { DirectionalLight, Light, SpotLight } from 'three/webgpu';
import { Mesh, type Object3D } from 'three/webgpu';

import {
  rendererStatusAtom,
  sceneGraphVersionAtom,
} from '@/atoms/scene-document-atom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getPrismRenderer } from '@/hooks/use-prism-renderer';
import { useSceneDocument } from '@/hooks/use-scene-document';
import { cn } from '@/lib/utils';

/** 场景树扁平条目：深度缩进 + three 节点引用 */
interface TreeEntry {
  object: Object3D;
  depth: number;
}

/**
 * 场景树：展示 renderer.scene 树（GLB 节点 + 灯光分组）。
 * 点击选中写 selectedNodeAtom，viewport 据此挂 TransformControls gizmo。
 */
export function SceneTree() {
  const graphVersion = useAtomValue(sceneGraphVersionAtom);
  const status = useAtomValue(rendererStatusAtom);
  const { doc, selectedNode, setSelectedNode } = useSceneDocument();

  // graphVersion 变化（loadPackage / 灯光重建）时重新遍历渲染核场景
  // biome-ignore lint/correctness/useExhaustiveDependencies: graphVersion 是场景树刷新信号，不参与计算但驱动重算
  const entries = useMemo(() => {
    const renderer = getPrismRenderer();
    if (!renderer || status !== 'ready' || !doc) {
      return [];
    }
    return buildTreeEntries(renderer.scene);
  }, [graphVersion, status, doc]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-ed-border px-3">
        <h2 className="text-xs font-medium text-ed-text-sub">场景树</h2>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-1">
          {entries.length === 0 ? (
            <p className="px-3 py-4 text-xs text-ed-text-soft">
              尚未加载场景包
            </p>
          ) : (
            entries.map((entry) => (
              <TreeNode
                key={entry.object.uuid}
                entry={entry}
                selected={entry.object === selectedNode}
                onSelect={() =>
                  setSelectedNode(
                    entry.object === selectedNode ? null : entry.object,
                  )
                }
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TreeNode({
  entry,
  selected,
  onSelect,
}: {
  entry: TreeEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const { object, depth } = entry;
  const Icon = iconFor(object);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs text-ed-text-sub hover:bg-ed-hover hover:text-ed-text-strong',
        selected &&
          'bg-ed-primary-weak text-ed-primary hover:bg-ed-primary-weak hover:text-ed-primary',
      )}
      style={{ paddingLeft: depth * 12 + 8 }}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{displayName(object)}</span>
    </button>
  );
}

/** 遍历 three 场景为扁平条目；跳过 gizmo helper、灯光 target 与匿名空节点 */
function buildTreeEntries(root: Object3D): TreeEntry[] {
  const lightTargets = collectLightTargets(root);
  const entries: TreeEntry[] = [];
  const walk = (parent: Object3D, depth: number) => {
    for (const child of parent.children) {
      if (child.type.startsWith('TransformControls')) {
        continue;
      }
      if (lightTargets.has(child)) {
        continue;
      }
      if (isAnonymousEmpty(child)) {
        // 匿名空节点不单独成行，但其子树按当前深度继续展示
        walk(child, depth);
        continue;
      }
      entries.push({ object: child, depth });
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return entries;
}

/** 灯光 target 是实现细节，不作为可编辑节点出现在树上 */
function collectLightTargets(root: Object3D): Set<Object3D> {
  const targets = new Set<Object3D>();
  root.traverse((object) => {
    if ((object as Light).isLight && 'target' in object) {
      targets.add((object as DirectionalLight | SpotLight).target);
    }
  });
  return targets;
}

/** 无名、非网格、非灯光的空节点（通常是 GLB 导出器的占位组） */
function isAnonymousEmpty(object: Object3D): boolean {
  return (
    object.name === '' &&
    !(object instanceof Mesh) &&
    !(object as Light).isLight
  );
}

function iconFor(object: Object3D) {
  if ((object as Light).isLight) {
    return object.type === 'DirectionalLight' ? Sun : Lightbulb;
  }
  if (object instanceof Mesh) {
    return Box;
  }
  return Folder;
}

/** 树节点显示名：渲染核的灯光分组给个中文名，其余用 three 节点名 */
function displayName(object: Object3D): string {
  if (object.name === 'prism-lights') {
    return '灯光';
  }
  return object.name || '(未命名)';
}
