import { applyMaterials, threeMatrixToBlender } from '@prism/renderer-core';
import { type ScenePackage, serializeScenePackage } from '@prism/scene-schema';
import { useAtom } from 'jotai';
import { useCallback } from 'react';
import {
  DirectionalLight,
  type Object3D,
  PointLight,
  RectAreaLight,
  SpotLight,
} from 'three/webgpu';

import {
  activeCameraIdAtom,
  sceneDirtyAtom,
  sceneDocumentAtom,
  sceneGraphVersionAtom,
  selectedNodeAtom,
  validationReportAtom,
} from '@/atoms/scene-document-atom';
import { getPrismRenderer } from '@/hooks/use-prism-renderer';

/** 面板可编辑的场景文档分区 */
export type EditableSection =
  | 'environment'
  | 'lights'
  | 'cameras'
  | 'post'
  | 'materials'
  | 'renderer';

export interface UpdateSectionOptions {
  /**
   * 是否同步渲染核（默认 true）。
   * gizmo 回写灯光变换时传 false：three 对象已被 TransformControls 移动，
   * 再触发 updateLighting 会重建灯光节点、打断拖拽。
   */
  syncRenderer?: boolean;
}

/** 渲染核运行时告警按并集去重合并进校验报告（每次全量重放，集合天然稳定） */
function mergeWarnings(previous: string[], incoming: string[]): string[] {
  return [...new Set([...previous, ...incoming])];
}

/**
 * 场景文档领域 hook（唯一读写入口）：
 * - doc/dirty 读取；
 * - updateSection 统一编辑入口：改 atom → 调对应 renderer.update* → 置 dirty；
 * - 不在编辑器里写任何渲染参数，渲染更新一律走 renderer-core。
 */
export function useSceneDocument() {
  const [doc, setDoc] = useAtom(sceneDocumentAtom);
  const [dirty, setDirty] = useAtom(sceneDirtyAtom);
  const [activeCameraId, setActiveCameraId] = useAtom(activeCameraIdAtom);
  const [report, setReport] = useAtom(validationReportAtom);
  const [selectedNode, setSelectedNode] = useAtom(selectedNodeAtom);
  const bumpGraphVersion = useCallbackAtomBump();

  const updateSection = useCallback(
    <K extends EditableSection>(
      section: K,
      value: ScenePackage[K],
      options: UpdateSectionOptions = {},
    ) => {
      setDoc((previous) =>
        previous ? { ...previous, [section]: value } : previous,
      );
      setDirty(true);
      if (options.syncRenderer === false) {
        return;
      }
      const renderer = getPrismRenderer();
      if (!renderer) {
        return;
      }
      switch (section) {
        case 'environment':
          void renderer.updateEnvironment(value as ScenePackage['environment']);
          break;
        case 'lights': {
          // 阴影全局设置以渲染核持有的当前包为准（renderer 节可能刚被编辑过）
          const shadows = renderer.package?.renderer.shadows;
          if (!shadows) {
            break;
          }
          const { warnings } = renderer.updateLighting(
            value as ScenePackage['lights'],
            shadows,
          );
          setReport((previous) =>
            previous
              ? {
                  ...previous,
                  warnings: mergeWarnings(previous.warnings, warnings),
                }
              : previous,
          );
          // 灯光整组重建：旧节点已销毁，刷新场景树并摘下 gizmo
          setSelectedNode(null);
          bumpGraphVersion();
          break;
        }
        case 'post':
          renderer.updatePost(value as ScenePackage['post']);
          break;
        case 'renderer':
          renderer.updateRendererSection(value as ScenePackage['renderer']);
          break;
        case 'materials': {
          const { warnings } = applyMaterials(
            renderer.scene,
            value as ScenePackage['materials'],
          );
          setReport((previous) =>
            previous
              ? {
                  ...previous,
                  warnings: mergeWarnings(previous.warnings, warnings),
                }
              : previous,
          );
          break;
        }
        case 'cameras':
          // 镜头/裁剪面编辑后按当前激活相机重算 FOV 与裁剪
          if (activeCameraId) {
            renderer.updateCamera(activeCameraId);
          }
          break;
      }
    },
    [
      setDoc,
      setDirty,
      setReport,
      setSelectedNode,
      activeCameraId,
      bumpGraphVersion,
    ],
  );

  /** 相机面板切换激活相机：atom + 渲染核同步 */
  const selectCamera = useCallback(
    (cameraId: string) => {
      setActiveCameraId(cameraId);
      getPrismRenderer()?.updateCamera(cameraId);
    },
    [setActiveCameraId],
  );

  /**
   * gizmo 拖拽结束回写：three 世界矩阵 → Blender 矩阵（convert 层唯一逆换算），
   * 写回对应灯光的 transform 并置 dirty。GLB 对象节点无契约 transform 字段，
   * 匹配不到灯光时只保留 three 场景里的位移（不写文档）。
   */
  const writeGizmoTransform = useCallback(
    (target: Object3D) => {
      if (!doc) {
        return;
      }
      const index = doc.lights.findIndex(
        (light) =>
          light.name === target.name && lightTypeMatches(light.type, target),
      );
      if (index < 0) {
        return;
      }
      target.updateWorldMatrix(true, false);
      const transform = threeMatrixToBlender(target.matrixWorld);
      const nextLights = doc.lights.map((light, i) =>
        i === index ? { ...light, transform } : light,
      );
      updateSection('lights', nextLights, { syncRenderer: false });
    },
    [doc, updateSection],
  );

  /** 导出：规范落盘格式（2 空格缩进 + 浮点取整），成功后清 dirty */
  const exportDocument = useCallback((): string | null => {
    if (!doc) {
      return null;
    }
    const serialized = serializeScenePackage(doc);
    setDirty(false);
    return serialized;
  }, [doc, setDirty]);

  return {
    doc,
    dirty,
    report,
    selectedNode,
    setSelectedNode,
    activeCameraId,
    selectCamera,
    updateSection,
    writeGizmoTransform,
    exportDocument,
  };
}

/** 场景图版本号 +1（场景树刷新信号） */
function useCallbackAtomBump() {
  const [, setVersion] = useAtom(sceneGraphVersionAtom);
  return useCallback(() => {
    setVersion((version) => version + 1);
  }, [setVersion]);
}

/** 契约灯光类型 ↔ three 灯光实例类型（场景树/gizmo 回写时按名字+类型双匹配） */
function lightTypeMatches(
  type: ScenePackage['lights'][number]['type'],
  target: Object3D,
): boolean {
  switch (type) {
    case 'sun':
      return target instanceof DirectionalLight;
    case 'point':
      return target instanceof PointLight;
    case 'spot':
      return target instanceof SpotLight;
    case 'area':
      return target instanceof RectAreaLight;
  }
}
