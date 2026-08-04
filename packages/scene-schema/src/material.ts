import { z } from 'zod';
import { colorSchema, idSchema, matchRuleSchema } from './primitives.ts';

/**
 * 材质覆盖：通过 match.names 显式绑定 GLB 材质名。
 * GLB 里导出的 PBR 参数是基准，本表只做覆盖（override），
 * 缺省字段 = 沿用 GLB 原值。
 */

/** PBR 覆盖参数（对应 Principled BSDF / MeshPhysicalMaterial 口径） */
export const pbrOverrideSchema = z.strictObject({
  /** 基础色 */
  baseColor: colorSchema.optional(),
  /** 不透明度 0~1 */
  opacity: z
    .number()
    .min(0, { error: 'opacity 应在 0~1 之间' })
    .max(1, { error: 'opacity 应在 0~1 之间' })
    .optional(),
  /** 金属度 0~1 */
  metalness: z
    .number()
    .min(0, { error: 'metalness 应在 0~1 之间' })
    .max(1, { error: 'metalness 应在 0~1 之间' })
    .optional(),
  /** 粗糙度 0~1 */
  roughness: z
    .number()
    .min(0, { error: 'roughness 应在 0~1 之间' })
    .max(1, { error: 'roughness 应在 0~1 之间' })
    .optional(),
  /** 折射率（≥1），默认 1.5 */
  ior: z.number().min(1, { error: 'ior 折射率应 ≥ 1' }).optional(),
  /** 透射率 0~1 */
  transmission: z
    .number()
    .min(0, { error: 'transmission 应在 0~1 之间' })
    .max(1, { error: 'transmission 应在 0~1 之间' })
    .optional(),
  /** 体积厚度（米），配合 transmission 使用 */
  thickness: z.number().min(0, { error: 'thickness 不能为负数' }).optional(),
  /**
   * 色散强度（≥0），对应 material.dispersion（r167+）；
   * 仅在 transmission > 0 时可见（v1.1 新增，向后兼容）
   */
  dispersion: z.number().min(0, { error: 'dispersion 不能为负数' }).optional(),
  /** 体积衰减色（Beer 定律），配合 transmission/thickness 使用（v1.1 新增） */
  attenuationColor: colorSchema.optional(),
  /**
   * 体积衰减距离（米，>0），对应 material.attenuationDistance（v1.1 新增）
   */
  attenuationDistance: z
    .number()
    .positive({ error: 'attenuationDistance 应大于 0（米）' })
    .optional(),
  /** 清漆强度 0~1 */
  clearcoat: z
    .number()
    .min(0, { error: 'clearcoat 应在 0~1 之间' })
    .max(1, { error: 'clearcoat 应在 0~1 之间' })
    .optional(),
  /** 清漆粗糙度 0~1 */
  clearcoatRoughness: z
    .number()
    .min(0, { error: 'clearcoatRoughness 应在 0~1 之间' })
    .max(1, { error: 'clearcoatRoughness 应在 0~1 之间' })
    .optional(),
  /** 自发光颜色 */
  emissive: colorSchema.optional(),
  /** 自发光强度倍率 */
  emissiveIntensity: z
    .number()
    .min(0, { error: 'emissiveIntensity 不能为负数' })
    .optional(),
  /** 混合模式：opaque 不透明 / blend 透明混合 */
  alphaMode: z
    .enum(['opaque', 'blend'], { error: 'alphaMode 只支持 opaque / blend' })
    .optional(),
});

/** Layer Weight 玻璃的单层：折射率 + 着色 */
export const glassLayerSchema = z.strictObject({
  /** 该层折射率（≥1） */
  ior: z.number().min(1, { error: '玻璃层 ior 折射率应 ≥ 1' }),
  /** 该层着色 */
  color: colorSchema,
});

/**
 * 程序化玻璃（layer-weight 多层镀膜玻璃）。
 * 由 renderer-core 用 TSL 复建，参数全部来自数据。
 */
export const glassSchema = z.strictObject({
  type: z.literal('layer-weight'),
  /** 镀膜层列表，至少一层；顺序即层叠顺序 */
  layers: z
    .array(glassLayerSchema)
    .min(1, { error: 'glass.layers 至少需要一层' }),
});

export const materialSchema = z.strictObject({
  /** 稳定 id，场景内唯一主键 */
  id: idSchema,
  /** 显示名 */
  name: z.string({ error: 'material.name 应为字符串' }),
  /** 显式匹配 GLB 材质名 */
  match: matchRuleSchema,
  pbr: pbrOverrideSchema.optional(),
  glass: glassSchema.optional(),
});

export type PbrOverride = z.infer<typeof pbrOverrideSchema>;
export type GlassLayer = z.infer<typeof glassLayerSchema>;
export type GlassOverride = z.infer<typeof glassSchema>;
export type SceneMaterial = z.infer<typeof materialSchema>;
