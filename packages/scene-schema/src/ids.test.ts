import { describe, expect, it } from 'vitest';
import { hasBlenderDuplicationSuffix, makeId } from './index.ts';

describe('makeId', () => {
  it('常规英文名字转小写 slug', () => {
    expect(makeId('Camera')).toBe('camera');
    expect(makeId('Sun Light')).toBe('sun-light');
  });

  it('Unicode 字母（中文）原样保留', () => {
    expect(makeId('幕墙 Glass A')).toBe('幕墙-glass-a');
    expect(makeId('主相机')).toBe('主相机');
  });

  it('空白与下划线折叠为连字符', () => {
    expect(makeId('Accent_Spot  01')).toBe('accent-spot-01');
  });

  it('非法字符直接去掉并折叠连字符', () => {
    expect(makeId('Light#01 (副本)')).toBe('light01-副本');
  });

  it('Blender 重命名后缀的点被去掉（Cube.001 → cube001）', () => {
    expect(makeId('Cube.001')).toBe('cube001');
  });

  it('结果为空时兜底 unnamed', () => {
    expect(makeId('')).toBe('unnamed');
    expect(makeId('  ___  ')).toBe('unnamed');
  });

  it('同一个名字永远得到同一个 id（确定性）', () => {
    expect(makeId('CurtainWall_Glass')).toBe(makeId('CurtainWall_Glass'));
  });
});

describe('hasBlenderDuplicationSuffix', () => {
  it('识别 .001 / .002 / .1000 等结尾', () => {
    expect(hasBlenderDuplicationSuffix('Cube.001')).toBe(true);
    expect(hasBlenderDuplicationSuffix('Ground.002')).toBe(true);
    expect(hasBlenderDuplicationSuffix('Light.1000')).toBe(true);
  });

  it('不误判普通名字', () => {
    expect(hasBlenderDuplicationSuffix('cube001')).toBe(false);
    expect(hasBlenderDuplicationSuffix('Cube.01')).toBe(false);
    expect(hasBlenderDuplicationSuffix('Glass.A')).toBe(false);
    expect(hasBlenderDuplicationSuffix('Cube.001.extra')).toBe(false);
  });
});
