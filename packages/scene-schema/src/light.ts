import { z } from 'zod';
import { colorSchema, idSchema, transformSchema } from './primitives.ts';

/**
 * 灯光：单一物理单位 energyWatts × intensityScale（默认 1）。
 * 废除旧工程 energy/webIntensity 双单位并行的做法。
 */

export const lightTypeSchema = z.enum(['sun', 'point', 'spot', 'area'], {
  error: '灯光 type 只支持 sun / point / spot / area',
});

/** 单灯阴影覆盖；缺省的字段回落到 renderer.shadows 全局设置 */
export const lightShadowSchema = z.strictObject({
  /** 是否投射阴影 */
  castShadow: z.boolean({ error: 'shadow.castShadow 应为布尔值' }),
  mapSize: z
    .number()
    .int({ error: 'shadow.mapSize 应为整数' })
    .positive({ error: 'shadow.mapSize 应为正整数' })
    .optional(),
  bias: z.number().optional(),
  normalBias: z.number().optional(),
  radius: z.number().optional(),
});

/** 聚光灯参数（type 为 spot 时应携带） */
export const spotParamsSchema = z.strictObject({
  /** 聚光锥全角（度），对应 Blender spot_size */
  angleDeg: z
    .number({ error: 'spot.angleDeg 应为数字（度）' })
    .positive({ error: 'spot.angleDeg 应为正数（聚光锥全角，度）' }),
  /** 边缘柔化比例 0~1，对应 Blender spot_blend */
  blend: z
    .number()
    .min(0, { error: 'spot.blend 应在 0~1 之间' })
    .max(1, { error: 'spot.blend 应在 0~1 之间' })
    .optional(),
});

/** 面光参数（type 为 area 时应携带），矩形，单位为米 */
export const areaParamsSchema = z.strictObject({
  width: z
    .number({ error: 'area.width 应为数字（米）' })
    .positive({ error: 'area.width 应为正数（米）' }),
  height: z
    .number({ error: 'area.height 应为数字（米）' })
    .positive({ error: 'area.height 应为正数（米）' }),
});

export const lightSchema = z.strictObject({
  /** 稳定 id，场景内唯一主键 */
  id: idSchema,
  /** 显示名（通常即 Blender 灯光名） */
  name: z.string({ error: 'light.name 应为字符串' }),
  type: lightTypeSchema,
  /** 灯光颜色 */
  color: colorSchema,
  /**
   * 物理功率（瓦特）：point/spot/area 为 Blender light energy；
   * sun 为辐照度（W/m²），与 Blender sun strength 一致。
   */
  energyWatts: z
    .number({ error: 'energyWatts 应为数字（瓦特）' })
    .min(0, { error: 'energyWatts 不能为负数' }),
  /**
   * 强度倍率（无量纲，默认 1）：最终强度 = energyWatts × intensityScale。
   * 编辑器调光只改这个字段，不动物理值。
   */
  intensityScale: z.number({ error: 'intensityScale 应为数字' }).default(1),
  /** 灯光世界变换，列主序 4×4，Blender 坐标系 */
  transform: transformSchema,
  shadow: lightShadowSchema.optional(),
  spot: spotParamsSchema.optional(),
  area: areaParamsSchema.optional(),
});

export type LightType = z.infer<typeof lightTypeSchema>;
export type LightShadow = z.infer<typeof lightShadowSchema>;
export type SpotParams = z.infer<typeof spotParamsSchema>;
export type AreaParams = z.infer<typeof areaParamsSchema>;
export type SceneLight = z.infer<typeof lightSchema>;
