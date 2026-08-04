import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ScenePackage } from './index.ts';
import { serializeScenePackage, validateScenePackage } from './index.ts';

const EXAMPLES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'examples',
);

function loadExample(fileName: string): any {
  return JSON.parse(readFileSync(join(EXAMPLES_DIR, fileName), 'utf8'));
}

/** 校验并返回 data，失败时直接抛错（测试辅助） */
function mustValidate(input: unknown): ScenePackage {
  const result = validateScenePackage(input);
  if (!result.ok || result.data === undefined) {
    throw new Error(`校验未通过：${JSON.stringify(result.issues, null, 2)}`);
  }
  return result.data;
}

describe('serializeScenePackage', () => {
  it('serialize → JSON.parse → validate 往返一致', () => {
    for (const fileName of ['minimal.scene.json', 'full.scene.json']) {
      const data = mustValidate(loadExample(fileName));
      const serialized = serializeScenePackage(data);
      const reparsed = mustValidate(JSON.parse(serialized));
      expect(reparsed).toEqual(data);
    }
  });

  it('浮点数取整到 5 位小数（消除二进制浮点噪声）', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.renderer.toneMapping.exposureStops = 0.10000000149011612;
    pkg.cameras[0].transform[0] = 0.6859199999999999;
    const data = mustValidate(pkg);

    const serialized = serializeScenePackage(data);
    expect(serialized).not.toContain('0.10000000149011612');
    expect(serialized).not.toContain('0.6859199999999999');

    const reparsed = JSON.parse(serialized);
    expect(reparsed.renderer.toneMapping.exposureStops).toBe(0.1);
    expect(reparsed.cameras[0].transform[0]).toBe(0.68592);
  });

  it('-0 归一化为 0', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.renderer.toneMapping.exposureStops = -0.000001;
    const data = mustValidate(pkg);
    const reparsed = JSON.parse(serializeScenePackage(data));
    expect(Object.is(reparsed.renderer.toneMapping.exposureStops, -0)).toBe(
      false,
    );
    expect(reparsed.renderer.toneMapping.exposureStops).toBe(0);
  });

  it('输出为 2 空格缩进 JSON，末尾带换行符', () => {
    const data = mustValidate(loadExample('minimal.scene.json'));
    const serialized = serializeScenePackage(data);
    expect(serialized.startsWith('{\n  "format"')).toBe(true);
    expect(serialized.endsWith('}\n')).toBe(true);
  });
});
