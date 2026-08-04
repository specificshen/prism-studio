import type { ScenePackage } from '@prism/scene-schema';
import type { Scene } from 'three/webgpu';
import type { PrismRenderer } from './prism-renderer.ts';

/**
 * 开发态调试挂载：window.__PRISM__。
 * 排查「这个参数从哪来」时先看这里——任何生效值都应能指回
 * schema 字段或 EDITOR_DEFAULTS 条目。
 */
export interface PrismDebugHandle {
  /** 渲染核实例 */
  renderer: PrismRenderer;
  /** 当前场景包（未加载时为 null） */
  readonly pkg: ScenePackage | null;
  /** Three 场景图 */
  readonly scene: Scene;
}

declare global {
  // eslint-disable-next-line no-var
  var __PRISM__: PrismDebugHandle | undefined;
}

/** 把调试句柄挂到 globalThis（重复挂载时覆盖为最新实例） */
export function installDebugHandle(renderer: PrismRenderer): PrismDebugHandle {
  const handle: PrismDebugHandle = {
    renderer,
    get pkg() {
      return renderer.package;
    },
    get scene() {
      return renderer.scene;
    },
  };
  globalThis.__PRISM__ = handle;
  return handle;
}

/** 移除调试句柄（仅当仍指向同一实例时） */
export function uninstallDebugHandle(handle: PrismDebugHandle): void {
  if (globalThis.__PRISM__ === handle) {
    globalThis.__PRISM__ = undefined;
  }
}
