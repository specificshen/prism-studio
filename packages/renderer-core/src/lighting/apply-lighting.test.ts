import type { RendererShadows, SceneLight } from '@prism/scene-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * applyLighting 回归测试。
 * 重点：WebGPU 下 RectAreaLight 需要用户侧注入 LTC 查找表
 * （RectAreaLightNode.setLTC），缺失时浏览器端所有含灯光材质编译失败、
 * 整场景渲染为黑（2026-08 南京数智城场景包事故）。
 */

const IDENTITY_TRANSFORM = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
] as const;

const sunLight: SceneLight = {
  id: 'sun',
  name: 'Sun',
  type: 'sun',
  color: '#ffffff',
  energyWatts: 3,
  intensityScale: 1,
  transform: [...IDENTITY_TRANSFORM],
};

const areaLight: SceneLight = {
  id: 'area',
  name: '面光',
  type: 'area',
  color: '#ffffff',
  energyWatts: 10,
  intensityScale: 1,
  transform: [...IDENTITY_TRANSFORM],
  area: { width: 2, height: 1 },
};

const shadows: RendererShadows = {
  mapSize: 2048,
  bias: -0.0002,
  normalBias: 0.02,
  radius: 1.5,
};

describe('applyLighting', () => {
  beforeEach(() => {
    // LTC 就绪标记是被测模块的模块级状态，每个用例重新加载模块保证独立
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('含 area 灯：注入一次 LTC 查找表，并创建 RectAreaLight', async () => {
    const { RectAreaLight, RectAreaLightNode, Scene } = await import(
      'three/webgpu'
    );
    const setLtc = vi.spyOn(RectAreaLightNode, 'setLTC');
    const { applyLighting } = await import('./apply-lighting.ts');

    const scene = new Scene();
    const result = applyLighting(scene, [areaLight], shadows);

    expect(setLtc).toHaveBeenCalledTimes(1);
    const rectLights = result.lightNodes[0].children.filter(
      (node) => node instanceof RectAreaLight,
    );
    expect(rectLights).toHaveLength(1);
    expect(rectLights[0].name).toBe('面光');
  });

  it('多次加载含 area 灯的场景：LTC 仍只注入一次', async () => {
    const { RectAreaLightNode, Scene } = await import('three/webgpu');
    const setLtc = vi.spyOn(RectAreaLightNode, 'setLTC');
    const { applyLighting } = await import('./apply-lighting.ts');

    applyLighting(new Scene(), [areaLight], shadows);
    applyLighting(new Scene(), [areaLight], shadows);

    expect(setLtc).toHaveBeenCalledTimes(1);
  });

  it('无 area 灯：不注入 LTC（避免常驻数据纹理）', async () => {
    const { RectAreaLightNode, Scene } = await import('three/webgpu');
    const setLtc = vi.spyOn(RectAreaLightNode, 'setLTC');
    const { applyLighting } = await import('./apply-lighting.ts');

    applyLighting(new Scene(), [sunLight], shadows);

    expect(setLtc).not.toHaveBeenCalled();
  });
});
