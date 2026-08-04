import type { LightType } from '@prism/scene-schema';

/**
 * Blender 灯光功率（瓦特）→ three 光强的唯一换算层。
 * 本文件是全部"光能换算系数"的唯一合法所在地，其它模块不得自行换算。
 *
 * three r184（WebGPU）灯光为物理单位口径：
 * - DirectionalLight.intensity ≈ 辐照度（lux 量级，无量纲倍率）
 * - PointLight / SpotLight.intensity = 发光强度（坎德拉 cd）
 * - RectAreaLight.intensity = 亮度（尼特 nit = cd/m²）
 */

/**
 * 光视效能（流明/瓦特）：683 lm/W 是 555nm 单色光的最大光视效能，
 * 摄影/渲染行业按此约定把电功率折算为光通量（lm）。
 */
export const LUMINOUS_EFFICACY_LM_PER_WATT = 683;

/** 球面立体角（球面度）：点光源各向同性分布的全向立体角 */
export const FULL_SPHERE_SOLID_ANGLE_SR = 4 * Math.PI;

/**
 * 太阳灯换算系数：Blender sun 的 strength 单位是 W/m²（辐照度），
 * 与 three DirectionalLight.intensity 口径一致，默认 1:1 直通。
 */
export const SUN_WATT_TO_INTENSITY = 1;

/**
 * Blender 灯光功率 → three 光强。
 *
 * - sun：`watts × SUN_WATT_TO_INTENSITY`（辐照度直通）
 * - point / spot：`watts × 683 / (4π)`（电功率 → 光通量 lm → 各向同性发光强度 cd）
 * - area：`watts × 683 / (4π) / areaSquareMeters`（发光强度按发光面积归一为亮度 nit）
 *
 * @param type 灯光类型
 * @param energyWatts Blender 功率（瓦特）
 * @param intensityScale 强度倍率（契约字段，默认 1；编辑器调光只改它）
 * @param areaSquareMeters area 灯必填：发光面积（平方米，width × height）
 */
export function blenderLightToThreeIntensity(
  type: LightType,
  energyWatts: number,
  intensityScale = 1,
  areaSquareMeters?: number,
): number {
  const watts = energyWatts * intensityScale;
  switch (type) {
    case 'sun':
      return watts * SUN_WATT_TO_INTENSITY;
    case 'point':
    case 'spot':
      return (
        (watts * LUMINOUS_EFFICACY_LM_PER_WATT) / FULL_SPHERE_SOLID_ANGLE_SR
      );
    case 'area': {
      if (areaSquareMeters === undefined || areaSquareMeters <= 0) {
        throw new Error(
          'area 灯光换算需要有效的发光面积 areaSquareMeters（width × height，平方米）',
        );
      }
      return (
        (watts * LUMINOUS_EFFICACY_LM_PER_WATT) /
        FULL_SPHERE_SOLID_ANGLE_SR /
        areaSquareMeters
      );
    }
  }
}
