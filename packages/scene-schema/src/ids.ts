/**
 * 稳定 id 工具。
 *
 * id 是场景包内条目的唯一主键（name 仅显示用）。
 * makeId 只做确定性的 slug 化：同一个名字永远得到同一个 id；
 * 冲突时的短 hash 后缀由调用方（导出器）自行追加。
 */

/** Blender 自动重命名后缀：".001" / ".002" / …（小数点 + 至少 3 位数字，结尾锚定） */
const BLENDER_DUPLICATION_SUFFIX_REGEX = /\.\d{3,}$/;

/**
 * 判断名字是否带 Blender 自动重命名后缀（如 "Cube.001"）。
 * 出现该后缀通常意味着 .blend 里存在同名对象/材质，应回 Blender 清理。
 */
export function hasBlenderDuplicationSuffix(name: string): boolean {
  return BLENDER_DUPLICATION_SUFFIX_REGEX.test(name);
}

/**
 * 由名字生成稳定 id（slug 化）：
 * - 转小写，Unicode 字母（含中文）原样保留
 * - 空白与下划线折叠为 "-"
 * - 其余非法字符直接去掉
 * - 折叠重复 "-"、去掉首尾 "-"
 * 结果为空时兜底 "unnamed"。
 */
export function makeId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'unnamed';
}
