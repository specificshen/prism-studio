import { PrismRenderer, WebGpuUnsupportedError } from '@prism/renderer-core';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { rendererStatusAtom } from '@/atoms/scene-document-atom';

/**
 * PrismRenderer 单例持有者。
 * 渲染核实例本身不是可序列化 UI 状态，不进 atom；组件经 getPrismRenderer() 取用，
 * 就绪/失败状态走 rendererStatusAtom。
 */
let rendererSingleton: PrismRenderer | null = null;
/** 初始化代数：StrictMode 双挂载/快速卸载时作废过期的 create 结果 */
let initGeneration = 0;

export function getPrismRenderer(): PrismRenderer | null {
  return rendererSingleton;
}

/**
 * viewport 挂载侧 hook：init(canvas) 建渲染核，destroy() 释放。
 * WebGPU 不可用时把 rendererStatusAtom 置为 'unsupported'（驱动全屏中文提示页）。
 */
export function usePrismRenderer() {
  const setStatus = useSetAtom(rendererStatusAtom);

  const init = useCallback(
    async (canvas: HTMLCanvasElement) => {
      const generation = ++initGeneration;
      if (rendererSingleton) {
        setStatus('ready');
        return;
      }
      try {
        const renderer = await PrismRenderer.create(canvas);
        if (generation !== initGeneration) {
          // 等待期间组件已卸载/重挂载：这个实例立即释放，避免双 WebGPU 上下文
          renderer.dispose();
          return;
        }
        rendererSingleton = renderer;
        setStatus('ready');
      } catch (error) {
        if (generation !== initGeneration) {
          return;
        }
        if (error instanceof WebGpuUnsupportedError) {
          setStatus('unsupported');
        } else {
          console.error('PrismRenderer 初始化失败', error);
          setStatus('error');
        }
      }
    },
    [setStatus],
  );

  const destroy = useCallback(() => {
    initGeneration += 1;
    rendererSingleton?.dispose();
    rendererSingleton = null;
    setStatus('idle');
  }, [setStatus]);

  return { init, destroy };
}
