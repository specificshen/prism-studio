import { describe, expect, it } from 'vitest';
import {
  blenderLightToThreeIntensity,
  FULL_SPHERE_SOLID_ANGLE_SR,
  LUMINOUS_EFFICACY_LM_PER_WATT,
  SUN_WATT_TO_INTENSITY,
} from './light-energy.ts';

describe('blenderLightToThreeIntensity', () => {
  it('sun：瓦特 × SUN_WATT_TO_INTENSITY 直通', () => {
    expect(blenderLightToThreeIntensity('sun', 1000)).toBe(
      1000 * SUN_WATT_TO_INTENSITY,
    );
    expect(blenderLightToThreeIntensity('sun', 3)).toBe(
      3 * SUN_WATT_TO_INTENSITY,
    );
  });

  it('point/spot：瓦特 × 683 lm/W ÷ 4π → 坎德拉', () => {
    const expected =
      (100 * LUMINOUS_EFFICACY_LM_PER_WATT) / FULL_SPHERE_SOLID_ANGLE_SR;
    expect(blenderLightToThreeIntensity('point', 100)).toBeCloseTo(
      expected,
      10,
    );
    expect(blenderLightToThreeIntensity('spot', 100)).toBeCloseTo(expected, 10);
  });

  it('area：在坎德拉基础上按发光面积归一（尼特）', () => {
    const base =
      (100 * LUMINOUS_EFFICACY_LM_PER_WATT) / FULL_SPHERE_SOLID_ANGLE_SR;
    expect(blenderLightToThreeIntensity('area', 100, 1, 4)).toBeCloseTo(
      base / 4,
      10,
    );
    // 面积翻倍 → 亮度减半
    expect(blenderLightToThreeIntensity('area', 100, 1, 4)).toBeCloseTo(
      blenderLightToThreeIntensity('area', 100, 1, 2) / 2,
      10,
    );
  });

  it('area 缺少发光面积时抛错', () => {
    expect(() => blenderLightToThreeIntensity('area', 100)).toThrow();
    expect(() => blenderLightToThreeIntensity('area', 100, 1, 0)).toThrow();
    expect(() => blenderLightToThreeIntensity('area', 100, 1, -2)).toThrow();
  });

  it('单调性：功率越大光强越大', () => {
    expect(blenderLightToThreeIntensity('point', 200)).toBeGreaterThan(
      blenderLightToThreeIntensity('point', 100),
    );
    expect(blenderLightToThreeIntensity('sun', 4)).toBeGreaterThan(
      blenderLightToThreeIntensity('sun', 2),
    );
    expect(blenderLightToThreeIntensity('area', 200, 1, 2)).toBeGreaterThan(
      blenderLightToThreeIntensity('area', 100, 1, 2),
    );
  });

  it('intensityScale 乘法性：f(w, s) = s × f(w, 1)，且 scale 可复合', () => {
    for (const type of ['sun', 'point', 'spot'] as const) {
      expect(blenderLightToThreeIntensity(type, 100, 2.5)).toBeCloseTo(
        blenderLightToThreeIntensity(type, 100, 1) * 2.5,
        10,
      );
      // 复合：scale 2.5 = scale 5 × scale 0.5
      expect(blenderLightToThreeIntensity(type, 100, 2.5)).toBeCloseTo(
        blenderLightToThreeIntensity(type, 100, 5 * 0.5),
        10,
      );
    }
    expect(blenderLightToThreeIntensity('area', 100, 3, 2)).toBeCloseTo(
      blenderLightToThreeIntensity('area', 100, 1, 2) * 3,
      10,
    );
  });

  it('功率加倍光强加倍（线性）', () => {
    expect(blenderLightToThreeIntensity('point', 200)).toBeCloseTo(
      blenderLightToThreeIntensity('point', 100) * 2,
      10,
    );
  });

  it('零瓦特 → 零光强', () => {
    expect(blenderLightToThreeIntensity('sun', 0)).toBe(0);
    expect(blenderLightToThreeIntensity('point', 0)).toBe(0);
    expect(blenderLightToThreeIntensity('area', 0, 1, 1)).toBe(0);
  });
});
