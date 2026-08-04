import { z } from 'zod';

/**
 * 后期管线配置。
 * bloom / ao 在 v1 由 renderer-core 实现；ssgi / ssr 为 reserved 字段——
 * 契约先行落数据，v1 渲染器可忽略，但数据必须能合法携带。
 */

/** Bloom 泛光 */
export const bloomSchema = z.strictObject({
  enabled: z.boolean({ error: 'bloom.enabled 应为布尔值' }),
  /** 亮度阈值，超过才参与泛光 */
  threshold: z.number({ error: 'bloom.threshold 应为数字' }),
  /** 泛光强度 */
  strength: z.number({ error: 'bloom.strength 应为数字' }),
  /** 扩散半径（0~1，相对屏幕） */
  radius: z.number({ error: 'bloom.radius 应为数字' }),
});

/** 环境光遮蔽（GTAO） */
export const aoSchema = z.strictObject({
  enabled: z.boolean({ error: 'ao.enabled 应为布尔值' }),
  /** 遮蔽强度 */
  strength: z.number({ error: 'ao.strength 应为数字' }),
  /** 采样半径（米） */
  radius: z.number({ error: 'ao.radius 应为数字' }),
  /** 渲染分辨率缩放（1 为全分辨率，越小越省性能） */
  resolutionScale: z
    .number({ error: 'ao.resolutionScale 应为数字' })
    .positive({ error: 'ao.resolutionScale 应为正数' }),
});

/** 屏幕空间全局光照（reserved：v1 仅占位，渲染器可不实现） */
export const ssgiSchema = z.strictObject({
  enabled: z.boolean({ error: 'ssgi.enabled 应为布尔值' }),
  strength: z.number({ error: 'ssgi.strength 应为数字' }),
  radius: z.number({ error: 'ssgi.radius 应为数字' }),
});

/** 屏幕空间反射（reserved：v1 仅占位，渲染器可不实现） */
export const ssrSchema = z.strictObject({
  enabled: z.boolean({ error: 'ssr.enabled 应为布尔值' }),
  strength: z.number({ error: 'ssr.strength 应为数字' }),
  /** 采样质量档位 */
  quality: z.enum(['low', 'medium', 'high'], {
    error: 'ssr.quality 只支持 low / medium / high',
  }),
});

/** 后期配置：整节可缺省为空对象，各效果独立可选 */
export const postSchema = z.strictObject({
  bloom: bloomSchema.optional(),
  ao: aoSchema.optional(),
  ssgi: ssgiSchema.optional(),
  ssr: ssrSchema.optional(),
});

export type BloomConfig = z.infer<typeof bloomSchema>;
export type AoConfig = z.infer<typeof aoSchema>;
export type SsgiConfig = z.infer<typeof ssgiSchema>;
export type SsrConfig = z.infer<typeof ssrSchema>;
export type ScenePost = z.infer<typeof postSchema>;
