import type { ScenePackage } from './package.ts';

/**
 * 场景包序列化。
 *
 * 铁律：所有浮点数取整到 5 位小数。
 * 二进制浮点表示会带进 0.10000000149011612 这类噪声（旧工程教训），
 * 落盘文件必须干净，便于 diff、评审与版本管理。
 */

/** 取整精度：5 位小数 */
export const SERIALIZE_FLOAT_DECIMALS = 5;

const ROUND_FACTOR = 10 ** SERIALIZE_FLOAT_DECIMALS;

/** 单个浮点数取整到 5 位小数；-0 归一化为 0 */
function roundFloat(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const rounded = Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
  return rounded === 0 ? 0 : rounded;
}

/**
 * 序列化为 2 空格缩进的 JSON 文本（末尾带换行符）。
 * 输入应已通过 validateScenePackage 校验。
 */
export function serializeScenePackage(pkg: ScenePackage): string {
  const json = JSON.stringify(
    pkg,
    (_key, value: unknown) =>
      typeof value === 'number' ? roundFloat(value) : value,
    2,
  );
  return `${json}\n`;
}
