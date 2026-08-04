import { describe, expect, it } from 'vitest';
import { isExrUrl } from './apply-environment.ts';

/**
 * HDRI 加载器路由回归测试。
 * 协作方（ISV）的场景包会把 HDRI 内嵌为 data: URI，URI 上没有扩展名，
 * 只能靠内容魔数区分 EXR 与 Radiance HDR；选错加载器会解码失败。
 */

/** 构造 data: URI：把给定字节转 base64 前缀（去掉填充符，模拟连续 base64 流的头部） */
function makeDataUrl(bytes: number[]): string {
  const head = btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');
  return `data:application/octet-stream;base64,${head}AAAA`;
}

describe('isExrUrl', () => {
  it('扩展名路由：.exr 文件路径（含查询串、大小写）', () => {
    expect(isExrUrl('/assets/sky.exr')).toBe(true);
    expect(isExrUrl('/assets/sky.EXR?v=2')).toBe(true);
    expect(isExrUrl('/assets/sky.hdr')).toBe(false);
    expect(isExrUrl('sky.hdr')).toBe(false);
  });

  it('data: URI 嗅探：EXR 魔数 76 2F 31 01 → EXR 加载器', () => {
    // EXR 头：magic(4B) + version(4B)
    expect(isExrUrl(makeDataUrl([0x76, 0x2f, 0x31, 0x01, 0x02, 0, 0, 0]))).toBe(
      true,
    );
  });

  it('data: URI 嗅探：Radiance 头 "#?RADIANCE" → HDR 加载器', () => {
    const radianceHeader = [...'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n'].map(
      (char) => char.charCodeAt(0),
    );
    expect(isExrUrl(makeDataUrl(radianceHeader))).toBe(false);
  });

  it('畸形 data: URI 不误判为 EXR', () => {
    expect(isExrUrl('data:')).toBe(false);
    expect(isExrUrl('data:;base64,!!!')).toBe(false);
  });
});
