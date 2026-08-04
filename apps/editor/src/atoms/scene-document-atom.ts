import type { ScenePackage, ValidationIssue } from '@prism/scene-schema';
import { atom } from 'jotai';
import type { Object3D } from 'three/webgpu';

/** 校验报告：契约 issues（error/warning）+ 渲染核运行时 warnings（材质/灯光未命中等） */
export interface SceneValidationReport {
  issues: ValidationIssue[];
  warnings: string[];
}

/** 渲染核状态：idle 未初始化 / ready 可用 / error 初始化失败 / unsupported 无 WebGPU */
export type RendererStatus = 'idle' | 'ready' | 'error' | 'unsupported';

/** 场景文档：编辑器内存中正在被编辑的场景数据（术语见根 AGENTS.md） */
export const sceneDocumentAtom = atom<ScenePackage | null>(null);

/** dirty 标记：面板 / TransformControls 回写后置 true，导出后清零 */
export const sceneDirtyAtom = atom<boolean>(false);

/** 校验报告：validateScenePackage() 的人读错误列表 + renderer warnings，驱动校验面板 */
export const validationReportAtom = atom<SceneValidationReport | null>(null);

/** 场景树当前选中的 three 节点（灯光或 GLB 对象），viewport 据此挂 gizmo */
export const selectedNodeAtom = atom<Object3D | null>(null);

/** 渲染核初始化状态（WebGPU 不支持时驱动全屏提示页） */
export const rendererStatusAtom = atom<RendererStatus>('idle');

/** 当前激活相机 id（场景包 cameras[].id），相机面板切换时更新 */
export const activeCameraIdAtom = atom<string | null>(null);

/** 场景图版本号：loadPackage / 灯光重建后 +1，scene-tree 据此重新遍历 renderer.scene */
export const sceneGraphVersionAtom = atom<number>(0);

/** 场景包加载中标记：顶栏按钮据此禁用/显示进度 */
export const sceneLoadingAtom = atom<boolean>(false);
