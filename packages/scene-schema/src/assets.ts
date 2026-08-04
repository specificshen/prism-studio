import { z } from 'zod';

/**
 * 外部资源引用：url + 可选 sha256 完整性校验值。
 */

/** 单个资源引用 */
export const assetRefSchema = z.strictObject({
  /** 资源地址（相对场景包路径或 URL） */
  url: z
    .string({ error: '资源 url 应为字符串' })
    .min(1, { error: '资源 url 不能为空' }),
  /** 资源内容的 SHA-256（64 位十六进制），用于完整性校验与缓存 */
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, { error: 'sha256 应为 64 位十六进制字符串' })
    .optional(),
});

/** 场景包引用的外部资源清单 */
export const assetsSchema = z.strictObject({
  /** 几何模型（GLB），必填 */
  model: assetRefSchema,
  /** 环境贴图（EXR/HDR），environment.type 为 hdri 时通常应有 */
  environment: assetRefSchema.optional(),
});

export type AssetRef = z.infer<typeof assetRefSchema>;
export type SceneAssets = z.infer<typeof assetsSchema>;
