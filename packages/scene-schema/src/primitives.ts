import { z } from 'zod';

/**
 * 跨模块复用的基础类型 schema。
 * 所有颜色、矩阵、匹配规则的口径在这里统一定义，业务模块不得各自为政。
 */

/** 颜色统一为 '#rrggbb' 六位十六进制字符串（大小写均可） */
export const COLOR_REGEX = /^#[0-9a-f]{6}$/i;

/** 颜色 schema：'#rrggbb' 字符串，例如 '#ff8800' */
export const colorSchema = z.string().regex(COLOR_REGEX, {
  error: '颜色格式不正确：应为 "#rrggbb" 六位十六进制字符串（例如 "#ff8800"）',
});

/**
 * 变换矩阵：16 个数字，列主序 4×4 矩阵，Blender 坐标系。
 * 坐标/轴向换算只允许发生在 renderer-core 的 convert 层，数据侧永远是 Blender 原样。
 */
export const transformSchema = z.array(z.number()).length(16, {
  error:
    'transform 必须是 16 个数字组成的数组（列主序 4×4 矩阵，Blender 坐标系）',
});

/** XYZ 欧拉角，单位为度（Blender UI 约定） */
export const eulerRotationSchema = z.tuple(
  [z.number(), z.number(), z.number()],
  {
    error: 'rotation 必须是 [x, y, z] 三个数字（欧拉角，单位为度）',
  },
);

/** 稳定 id：非空字符串即合法（slug 化由 makeId / 导出器负责） */
export const idSchema = z
  .string({
    error: 'id 应为字符串',
  })
  .min(1, { error: 'id 不能为空字符串' });

/**
 * 显式匹配规则：把契约条目绑定到 GLB 里的材质/对象名。
 * 禁止任何形式的名称关键词启发式，匹配关系必须显式落数据。
 */
export const matchRuleSchema = z.strictObject({
  /** GLB 中的原始名称列表；为空会触发 warning（不会匹配到任何东西） */
  names: z.array(z.string(), {
    error: 'match.names 应为字符串数组',
  }),
});

export type MatchRule = z.infer<typeof matchRuleSchema>;
