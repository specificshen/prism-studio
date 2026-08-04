import type { SceneCamera } from '@prism/scene-schema';
import {
  MathUtils,
  type PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import { blenderMatrixToThree } from './coordinates.ts';

/**
 * Blender 相机 → Three 相机换算。
 *
 * 数据侧只存物理相机参数（焦距 lensMm + 传感器宽度 sensorWidthMm + sensorFit），
 * FOV 一律在本层换算（单一换算层原则，数据里禁止直接存 FOV）。
 */

/**
 * Blender 标准传感器宽高比（36mm × 24mm）。
 * 契约只携带 sensorWidthMm；sensorFit 为 vertical（或 auto 且画幅竖向）时，
 * FOV 由传感器高度决定，高度按 Blender 默认传感器的固定比例换算。
 */
export const BLENDER_SENSOR_ASPECT = 36 / 24;

export interface BlenderCameraLens {
  /** 焦距（毫米） */
  lensMm: number;
  /** 传感器宽度（毫米） */
  sensorWidthMm: number;
  /** 传感器适配模式 */
  sensorFit: 'auto' | 'horizontal' | 'vertical';
}

/**
 * 计算 Blender 相机的垂直视场角（度数）。
 * 移植自旧工程验证过的实现（getBlenderCameraVerticalFov）：
 * - horizontal（或 auto 且画幅横向）：水平方向由传感器宽度决定，
 *   垂直 FOV = 2·atan(sensorW / (2·lens·aspect))
 * - vertical（或 auto 且画幅竖向）：垂直方向由传感器高度决定，
 *   垂直 FOV = 2·atan(sensorH / (2·lens))，sensorH = sensorW / BLENDER_SENSOR_ASPECT
 *
 * @param lens 物理相机参数
 * @param aspect 视口宽高比（width / height）
 */
export function getBlenderCameraVerticalFov(
  lens: BlenderCameraLens,
  aspect: number,
): number {
  const lensMm = Math.max(lens.lensMm, 1e-3);
  const sensorWidthMm = Math.max(lens.sensorWidthMm, 1e-3);
  const safeAspect = Math.max(aspect, 1e-3);
  const useVerticalSensor =
    lens.sensorFit === 'vertical' ||
    (lens.sensorFit === 'auto' && safeAspect < 1);
  const verticalTan = useVerticalSensor
    ? sensorWidthMm / BLENDER_SENSOR_ASPECT / (2 * lensMm)
    : sensorWidthMm / (2 * lensMm * safeAspect);
  return MathUtils.radToDeg(2 * Math.atan(verticalTan));
}

/**
 * 把契约相机应用到 THREE.PerspectiveCamera。
 * - transform（Blender 世界矩阵）经 convert 层换算后分解出位置与朝向
 *   （Blender 相机与 Three 相机同样看向本地 -Z、上方向为 +Y，可直接分解）
 * - fov 由物理参数换算，依赖视口 aspect
 * - near/far 直接取契约 clipNear/clipFar（米，数据侧已保证为正）
 */
export function applyBlenderCamera(
  camera: PerspectiveCamera,
  cam: SceneCamera,
  aspect: number,
): void {
  const worldThree = blenderMatrixToThree(cam.transform);
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  worldThree.decompose(position, quaternion, scale);

  camera.position.copy(position);
  camera.quaternion.copy(quaternion);
  camera.up.set(0, 1, 0).applyQuaternion(quaternion);
  camera.fov = getBlenderCameraVerticalFov(cam, aspect);
  camera.near = cam.clipNear;
  camera.far = cam.clipFar;
  camera.updateProjectionMatrix();
}
