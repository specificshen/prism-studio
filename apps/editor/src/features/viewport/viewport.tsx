import { useAtomValue } from 'jotai';
import { FileDown, LoaderCircle, MonitorX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  rendererStatusAtom,
  sceneLoadingAtom,
} from '@/atoms/scene-document-atom';
import { getPrismRenderer, usePrismRenderer } from '@/hooks/use-prism-renderer';
import { useSceneDocument } from '@/hooks/use-scene-document';
import { useScenePackage } from '@/hooks/use-scene-package';

/**
 * 3D 视口：canvas + PrismRenderer 挂载点。
 * - WebGPU 不支持 → 全屏中文提示页
 * - 拖放 .prism.json + .glb 文件加载
 * - scene-tree 选中节点 → setObjectTransformGizmo；拖拽结束回写灯光变换
 */
export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const status = useAtomValue(rendererStatusAtom);
  const loading = useAtomValue(sceneLoadingAtom);
  const [dragActive, setDragActive] = useState(false);
  const { init, destroy } = usePrismRenderer();
  const { loadFromFiles } = useScenePackage();
  const { doc, selectedNode, writeGizmoTransform } = useSceneDocument();

  // 渲染核生命周期跟随 canvas 挂载
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    void init(canvas);
    return () => destroy();
  }, [init, destroy]);

  // gizmo 跟随场景树选中节点（灯光/GLB 对象）
  useEffect(() => {
    const renderer = getPrismRenderer();
    if (!renderer || status !== 'ready') {
      return;
    }
    renderer.setObjectTransformGizmo(selectedNode);
    return () => {
      try {
        renderer.setObjectTransformGizmo(null);
      } catch {
        // 渲染核可能已先一步 dispose，摘 gizmo 失败可忽略
      }
    };
  }, [selectedNode, status]);

  // gizmo 拖拽结束（pointerup）→ 变换写回场景文档；切换选中时兜底回写
  useEffect(() => {
    if (!selectedNode) {
      return;
    }
    const snapshot = Array.from(selectedNode.matrixWorld.elements);
    const flush = () => {
      const elements = selectedNode.matrixWorld.elements;
      const changed = elements.some(
        (value, index) => Math.abs(value - snapshot[index]) > 1e-9,
      );
      if (changed) {
        writeGizmoTransform(selectedNode);
        snapshot.splice(0, snapshot.length, ...elements);
      }
    };
    window.addEventListener('pointerup', flush);
    return () => {
      window.removeEventListener('pointerup', flush);
      flush();
    };
  }, [selectedNode, writeGizmoTransform]);

  return (
    <div
      className="relative size-full overflow-hidden"
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length > 0) {
          void loadFromFiles(files);
        }
      }}
    >
      <canvas ref={canvasRef} className="block size-full" />

      {!doc && status === 'ready' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 rounded-lg border border-ed-border bg-ed-panel/80 px-6 py-5 text-center">
            <FileDown className="size-6 text-ed-text-soft" />
            <p className="text-xs text-ed-text-sub">
              拖入 .prism.json + .glb 文件，或点击顶栏「加载示例」
            </p>
          </div>
        </div>
      )}

      {dragActive && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-ed-primary bg-ed-primary-weak">
          <p className="text-sm text-ed-primary">
            松开以加载场景包（.prism.json + .glb）
          </p>
        </div>
      )}

      {loading && (
        <div className="absolute right-3 top-3 flex items-center gap-2 rounded-md border border-ed-border bg-ed-elevated px-3 py-1.5 text-xs text-ed-text-sub">
          <LoaderCircle className="size-3.5 animate-spin" />
          场景包加载中…
        </div>
      )}

      {status === 'unsupported' && <WebGpuUnsupportedScreen />}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-ed-bg">
          <p className="text-sm text-ed-error">
            渲染器初始化失败，请刷新页面重试
          </p>
        </div>
      )}
    </div>
  );
}

/** WebGPU 不支持时的全屏中文提示页 */
function WebGpuUnsupportedScreen() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ed-bg">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <MonitorX className="size-10 text-ed-text-soft" />
        <h2 className="text-base font-medium text-ed-text-strong">
          当前浏览器不支持 WebGPU
        </h2>
        <p className="text-xs leading-relaxed text-ed-text-sub">
          请使用最新版 Chrome/Edge 并开启 WebGPU 后重新打开本页 （Safari 需 26+
          并手动开启 WebGPU）。
        </p>
      </div>
    </div>
  );
}
