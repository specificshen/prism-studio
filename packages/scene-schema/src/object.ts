import { z } from 'zod';
import { idSchema, matchRuleSchema } from './primitives.ts';

/**
 * 对象级覆盖：可见性与阴影收发开关。
 * 缺省 = 沿用 GLB / 渲染器默认行为。
 */
export const objectSchema = z.strictObject({
  /** 稳定 id，场景内唯一主键 */
  id: idSchema,
  /** 显示名（通常即 Blender 对象名） */
  name: z.string({ error: 'object.name 应为字符串' }),
  /** 显式匹配 GLB 对象/网格名 */
  match: matchRuleSchema,
  /** 是否可见 */
  visible: z.boolean().optional(),
  /** 是否投射阴影 */
  castShadow: z.boolean().optional(),
  /** 是否接收阴影 */
  receiveShadow: z.boolean().optional(),
});

export type SceneObject = z.infer<typeof objectSchema>;
