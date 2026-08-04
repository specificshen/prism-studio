import { z } from 'zod';
import { colorSchema, eulerRotationSchema } from './primitives.ts';

/**
 * 环境配置：三种互斥类型，用 type 字段判别。
 * - hdri：外部 HDR/EXR 贴图（生产主流）
 * - procedural-sky：程序化天空（参数化太阳位置）
 * - physical-atmosphere：物理大气（experimental，按经纬度计算）
 */

/** 线性雾：三种环境都可携带 */
export const fogSchema = z.strictObject({
  enabled: z.boolean({ error: 'fog.enabled 应为布尔值' }),
  color: colorSchema,
  /** 雾起始距离（米） */
  near: z.number({ error: 'fog.near 应为数字（米）' }),
  /** 雾完全遮蔽距离（米） */
  far: z.number({ error: 'fog.far 应为数字（米）' }),
});

/** HDRI 可视背景：贴图原样显示，或换成纯色 */
export const visibleBackgroundSchema = z.strictObject({
  type: z.enum(['texture', 'color'], {
    error: 'visibleBackground.type 只支持 texture / color',
  }),
  /** type 为 texture 时使用的贴图地址 */
  url: z.string().optional(),
  /** type 为 color 时使用的颜色 */
  color: colorSchema.optional(),
});

/** HDRI 环境 */
export const hdriEnvironmentSchema = z.strictObject({
  type: z.literal('hdri'),
  /** HDR/EXR 贴图地址 */
  url: z
    .string({ error: 'environment.url 应为字符串' })
    .min(1, { error: 'hdri 环境的 url 不能为空' }),
  /** 背景可视强度倍率 */
  strength: z.number({ error: 'hdri 环境 strength 应为数字' }),
  /** 光照强度倍率（与背景强度解耦，可只照亮不改变背景观感） */
  lightingStrength: z.number({ error: 'hdri 环境 lightingStrength 应为数字' }),
  /** 贴图旋转，XYZ 欧拉角，单位为度 */
  rotation: eulerRotationSchema,
  visibleBackground: visibleBackgroundSchema.optional(),
  fog: fogSchema.optional(),
});

/** 程序化天空环境 */
export const proceduralSkyEnvironmentSchema = z.strictObject({
  type: z.literal('procedural-sky'),
  /** 太阳高度角（度），-10 ~ 90 的实用区间 */
  sunElevationDeg: z.number({ error: 'sunElevationDeg 应为数字（度）' }),
  /** 太阳方位角（度），0 为正北，顺时针 */
  sunAzimuthDeg: z.number({ error: 'sunAzimuthDeg 应为数字（度）' }),
  /** 大气浑浊度，越大越偏黄/灰 */
  turbidity: z.number().optional(),
  fog: fogSchema.optional(),
});

/** 物理大气环境（experimental：参数与实现可能随版本调整） */
export const physicalAtmosphereEnvironmentSchema = z.strictObject({
  type: z.literal('physical-atmosphere'),
  geo: z.strictObject({
    /** 地理纬度（度），-90 ~ 90 */
    latitudeDeg: z
      .number({ error: 'latitudeDeg 应为数字（度）' })
      .min(-90, { error: 'latitudeDeg 应在 -90 ~ 90 之间' })
      .max(90, { error: 'latitudeDeg 应在 -90 ~ 90 之间' }),
    /** 地理经度（度），-180 ~ 180 */
    longitudeDeg: z
      .number({ error: 'longitudeDeg 应为数字（度）' })
      .min(-180, { error: 'longitudeDeg 应在 -180 ~ 180 之间' })
      .max(180, { error: 'longitudeDeg 应在 -180 ~ 180 之间' }),
  }),
  fog: fogSchema.optional(),
});

/** 环境配置（type 判别联合） */
export const environmentSchema = z.discriminatedUnion('type', [
  hdriEnvironmentSchema,
  proceduralSkyEnvironmentSchema,
  physicalAtmosphereEnvironmentSchema,
]);

export type FogConfig = z.infer<typeof fogSchema>;
export type VisibleBackground = z.infer<typeof visibleBackgroundSchema>;
export type HdriEnvironment = z.infer<typeof hdriEnvironmentSchema>;
export type ProceduralSkyEnvironment = z.infer<
  typeof proceduralSkyEnvironmentSchema
>;
export type PhysicalAtmosphereEnvironment = z.infer<
  typeof physicalAtmosphereEnvironmentSchema
>;
export type SceneEnvironment = z.infer<typeof environmentSchema>;
