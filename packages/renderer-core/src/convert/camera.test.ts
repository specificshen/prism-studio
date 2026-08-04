import type { SceneCamera } from '@prism/scene-schema';
import { MathUtils, Matrix4, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  applyBlenderCamera,
  BLENDER_SENSOR_ASPECT,
  getBlenderCameraVerticalFov,
} from './camera.ts';

/** 测试辅助：构造最小合法契约相机 */
function makeSceneCamera(overrides: Partial<SceneCamera> = {}): SceneCamera {
  return {
    id: 'cam-test',
    name: 'Test Camera',
    transform: new Matrix4().toArray(),
    lensMm: 50,
    sensorWidthMm: 36,
    sensorFit: 'auto',
    clipNear: 0.1,
    clipFar: 1000,
    ...overrides,
  };
}

describe('getBlenderCameraVerticalFov', () => {
  it('horizontal：50mm 镜头 + 36mm 传感器 + 16:9 画幅', () => {
    const fov = getBlenderCameraVerticalFov(
      { lensMm: 50, sensorWidthMm: 36, sensorFit: 'horizontal' },
      16 / 9,
    );
    const expected = MathUtils.radToDeg(
      2 * Math.atan(36 / (2 * 50 * (16 / 9))),
    );
    expect(fov).toBeCloseTo(expected, 10);
    expect(fov).toBeCloseTo(22.896, 2);
  });

  it('vertical：垂直 FOV 由传感器高度（宽度 / 36:24 比例）决定，与画幅无关', () => {
    const fov = getBlenderCameraVerticalFov(
      { lensMm: 50, sensorWidthMm: 36, sensorFit: 'vertical' },
      16 / 9,
    );
    const sensorHeightMm = 36 / BLENDER_SENSOR_ASPECT;
    const expected = MathUtils.radToDeg(
      2 * Math.atan(sensorHeightMm / (2 * 50)),
    );
    expect(fov).toBeCloseTo(expected, 10);
    expect(fov).toBeCloseTo(26.991, 2);
  });

  it('auto：横向画幅走 horizontal，竖向画幅走 vertical', () => {
    const lens = { lensMm: 50, sensorWidthMm: 36, sensorFit: 'auto' as const };
    const wide = getBlenderCameraVerticalFov(lens, 16 / 9);
    const tall = getBlenderCameraVerticalFov(lens, 9 / 16);
    expect(wide).toBeCloseTo(
      getBlenderCameraVerticalFov({ ...lens, sensorFit: 'horizontal' }, 16 / 9),
      10,
    );
    expect(tall).toBeCloseTo(
      getBlenderCameraVerticalFov({ ...lens, sensorFit: 'vertical' }, 9 / 16),
      10,
    );
  });

  it('焦距越长 FOV 越小（单调性）', () => {
    const wide = getBlenderCameraVerticalFov(
      { lensMm: 24, sensorWidthMm: 36, sensorFit: 'horizontal' },
      16 / 9,
    );
    const tele = getBlenderCameraVerticalFov(
      { lensMm: 85, sensorWidthMm: 36, sensorFit: 'horizontal' },
      16 / 9,
    );
    expect(tele).toBeLessThan(wide);
  });
});

describe('applyBlenderCamera', () => {
  it('应用变换（Blender 平移换算到 Three 位置）、FOV 与裁剪面', () => {
    const cam = makeSceneCamera({
      transform: new Matrix4().makeTranslation(1, 2, 3).toArray(),
      clipNear: 0.5,
      clipFar: 800,
    });
    const camera = new PerspectiveCamera();
    applyBlenderCamera(camera, cam, 16 / 9);
    expect(camera.position.x).toBeCloseTo(1, 10);
    expect(camera.position.y).toBeCloseTo(3, 10);
    expect(camera.position.z).toBeCloseTo(-2, 10);
    expect(camera.fov).toBeCloseTo(
      getBlenderCameraVerticalFov(cam, 16 / 9),
      10,
    );
    expect(camera.near).toBe(0.5);
    expect(camera.far).toBe(800);
  });

  it('朝向：Blender 相机绕 X 转 −90° 后看向 Three 的 +Z', () => {
    // Blender 相机看向本地 -Z；Rx(−90°) 把 (0,0,-1) 转到 (0,-1,0)_B，
    // 换算到 Three 世界即 (0,0,1)。
    const cam = makeSceneCamera({
      transform: new Matrix4().makeRotationX(MathUtils.degToRad(-90)).toArray(),
    });
    const camera = new PerspectiveCamera();
    applyBlenderCamera(camera, cam, 1);
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    expect(forward.x).toBeCloseTo(0, 10);
    expect(forward.y).toBeCloseTo(0, 10);
    expect(forward.z).toBeCloseTo(1, 10);
  });
});
