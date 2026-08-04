import { z } from 'zod';

/**
 * 渲染器配置：色调映射、色彩分级、阴影全局设置。
 * 这些参数旧工程里全硬编码在前端，v1 起全部进数据。
 */

/** 色调映射类型（与 three.js 对应实现一一映射） */
export const toneMappingTypeSchema = z.enum(['AgX', 'ACESFilmic', 'Neutral'], {
  error: 'toneMapping.type 只支持 AgX / ACESFilmic / Neutral',
});

export const toneMappingSchema = z.strictObject({
  type: toneMappingTypeSchema,
  /** 曝光，单位为档（stops），0 表示不调整；+1 亮一倍 */
  exposureStops: z.number({
    error: 'toneMapping.exposureStops 应为数字（曝光档数）',
  }),
});

/**
 * 色彩分级：全部字段默认 0（不调整）。
 * 省略整个 colorGrading 等价于全 0。
 */
export const colorGradingSchema = z.strictObject({
  /** 对比度调整，0 为不调整 */
  contrast: z.number().default(0),
  /** 饱和度调整，0 为不调整 */
  saturation: z.number().default(0),
  /** 白平衡偏移（负冷正暖），0 为不调整 */
  whiteBalance: z.number().default(0),
  /** 高光调整，0 为不调整 */
  highlights: z.number().default(0),
  /** 阴影调整，0 为不调整 */
  shadows: z.number().default(0),
});

/** 阴影全局设置 */
export const rendererShadowsSchema = z.strictObject({
  /**
   * 主阴影贴图边长（像素，正方形）。
   * 超过 4096 会触发性能 warning（显存随边长平方增长）。
   */
  mapSize: z
    .number({ error: 'shadows.mapSize 应为数字（阴影贴图边长，像素）' })
    .int({ error: 'shadows.mapSize 应为整数' })
    .positive({ error: 'shadows.mapSize 应为正整数（建议 2048 或 4096）' }),
  /** 深度偏移，用于消除阴影痤疮（shadow acne） */
  bias: z.number({ error: 'shadows.bias 应为数字' }),
  /** 法线偏移，用于消除表面漏光/条纹 */
  normalBias: z.number({ error: 'shadows.normalBias 应为数字' }),
  /** PCF 软化半径（像素级），越大阴影越柔 */
  radius: z
    .number({ error: 'shadows.radius 应为数字' })
    .min(0, { error: 'shadows.radius 不能为负数' }),
  /** 产生主阴影的灯光 id（通常为主太阳灯）；缺省时由 renderer-core 取第一盏投影灯 */
  primaryLightId: z.string().optional(),
});

export const rendererSchema = z.strictObject({
  toneMapping: toneMappingSchema,
  colorGrading: colorGradingSchema.optional(),
  shadows: rendererShadowsSchema,
});

export type ToneMappingType = z.infer<typeof toneMappingTypeSchema>;
export type ToneMapping = z.infer<typeof toneMappingSchema>;
export type ColorGrading = z.infer<typeof colorGradingSchema>;
export type RendererShadows = z.infer<typeof rendererShadowsSchema>;
export type SceneRenderer = z.infer<typeof rendererSchema>;
