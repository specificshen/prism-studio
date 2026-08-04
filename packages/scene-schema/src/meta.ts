import { z } from 'zod';

/**
 * 场景包元信息：名称、来源 .blend、导出时间、导出器版本。
 * 仅供追溯与展示，不参与渲染。
 */
export const metaSchema = z.strictObject({
  /** 场景名称（显示用，不做主键） */
  name: z
    .string({ error: 'meta.name 应为字符串' })
    .min(1, { error: 'meta.name 不能为空' }),
  /** 源 .blend 文件名/路径，便于回查 */
  sourceBlend: z.string().optional(),
  /** 导出时间，ISO 8601 日期时间字符串（允许 Z 或 ±hh:mm 时区偏移） */
  exportedAt: z.iso
    .datetime({
      offset: true,
      error:
        'meta.exportedAt 应为 ISO 8601 日期时间字符串（例如 "2026-01-01T08:00:00Z"）',
    })
    .optional(),
  /** 导出器标识与版本，例如 "prism-export 0.1.0" */
  exporterVersion: z.string().optional(),
});

export type SceneMeta = z.infer<typeof metaSchema>;
