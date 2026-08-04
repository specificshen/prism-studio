import { z } from 'zod';
import { idSchema, transformSchema } from './primitives.ts';

/**
 * 相机：物理相机参数（焦距 + 传感器），FOV 由 renderer-core 换算，
 * 禁止在数据里直接存 FOV（单一换算层原则）。
 */
export const cameraSchema = z.strictObject({
  /** 稳定 id，场景内唯一主键 */
  id: idSchema,
  /** 显示名（通常即 Blender 相机名） */
  name: z.string({ error: 'camera.name 应为字符串' }),
  /** 相机世界变换，列主序 4×4，Blender 坐标系 */
  transform: transformSchema,
  /** 焦距（毫米） */
  lensMm: z
    .number({ error: 'lensMm 应为数字（毫米）' })
    .positive({ error: 'lensMm 应为正数（焦距，毫米）' }),
  /** 传感器宽度（毫米），Blender 默认 36 */
  sensorWidthMm: z
    .number({ error: 'sensorWidthMm 应为数字（毫米）' })
    .positive({ error: 'sensorWidthMm 应为正数（传感器宽度，毫米）' }),
  /** 传感器适配模式，与 Blender 相机设置一致 */
  sensorFit: z.enum(['auto', 'horizontal', 'vertical'], {
    error: 'sensorFit 只支持 auto / horizontal / vertical',
  }),
  /** 近裁剪面（米） */
  clipNear: z
    .number({ error: 'clipNear 应为数字（米）' })
    .positive({ error: 'clipNear 应为正数（米）' }),
  /** 远裁剪面（米） */
  clipFar: z
    .number({ error: 'clipFar 应为数字（米）' })
    .positive({ error: 'clipFar 应为正数（米）' }),
  /** 是否为默认相机；全场至多一个，缺省时由编辑器取第一个 */
  isDefault: z.boolean().optional(),
});

export type SceneCamera = z.infer<typeof cameraSchema>;
