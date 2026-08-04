import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateScenePackage } from './index.ts';

const EXAMPLES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'examples',
);

/** 读取 examples 目录下的示例场景包 */
function loadExample(fileName: string): any {
  return JSON.parse(readFileSync(join(EXAMPLES_DIR, fileName), 'utf8'));
}

describe('validateScenePackage：示例文件', () => {
  it('minimal.scene.json 校验通过且无任何 issue', () => {
    const result = validateScenePackage(loadExample('minimal.scene.json'));
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('full.scene.json 校验通过且无任何 issue', () => {
    const result = validateScenePackage(loadExample('full.scene.json'));
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
  });
});

describe('validateScenePackage：format / version 身份检查', () => {
  it('缺 format / version 报错并提示当前支持的契约', () => {
    const result = validateScenePackage({});
    expect(result.ok).toBe(false);
    const paths = result.issues.map((issue) => issue.path);
    expect(paths).toContain('format');
    expect(paths).toContain('version');
    for (const issue of result.issues) {
      expect(issue.severity).toBe('error');
    }
    expect(
      result.issues.find((item) => item.path === 'format')?.message,
    ).toContain('prism-scene');
    expect(
      result.issues.find((item) => item.path === 'version')?.message,
    ).toContain('1');
  });

  it('错误 format 报错', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.format = 'legacy-scene';
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(false);
    const issue = result.issues.find((item) => item.path === 'format');
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain('legacy-scene');
    expect(issue?.message).toContain('prism-scene');
  });

  it('错误 version 报错并提示当前支持版本', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.version = 99;
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(false);
    const issue = result.issues.find((item) => item.path === 'version');
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain('99');
  });

  it('非对象输入返回可读错误而不是抛异常', () => {
    for (const input of [null, 'not-a-package', 42, []]) {
      const result = validateScenePackage(input);
      expect(result.ok).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('validateScenePackage：结构校验', () => {
  it('颜色非法报错（点分路径定位到字段）', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.lights[0].color = 'red';
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(false);
    const issue = result.issues.find((item) => item.path === 'lights.0.color');
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain('#rrggbb');
  });

  it('多余字段报错（strict 模式）', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.lights[0].webIntensity = 2;
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(false);
    const issue = result.issues.find((item) => item.path === 'lights.0');
    expect(issue?.message).toContain('多余字段');
    expect(issue?.message).toContain('webIntensity');
  });

  it('transform 不是 16 元素数组时报错', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.cameras[0].transform = [1, 0, 0, 0];
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(false);
    const issue = result.issues.find(
      (item) => item.path === 'cameras.0.transform',
    );
    expect(issue?.message).toContain('16');
  });

  it('缺必填字段报错', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.lights[0].energyWatts = undefined;
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(false);
    const issue = result.issues.find(
      (item) => item.path === 'lights.0.energyWatts',
    );
    expect(issue?.message).toContain('缺少必填字段');
  });
});

describe('validateScenePackage：v1.1 新增字段（向后兼容）', () => {
  it('procedural-sky 缺省 lightingStrength 补默认值 1', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.environment = {
      type: 'procedural-sky',
      sunElevationDeg: 35,
      sunAzimuthDeg: 120,
    };
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(true);
    expect(result.data?.environment).toMatchObject({ lightingStrength: 1 });
  });

  it('procedural-sky lightingStrength 合法值（含 0）通过', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.environment = {
      type: 'procedural-sky',
      sunElevationDeg: 35,
      sunAzimuthDeg: 120,
      lightingStrength: 0,
    };
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(true);
    expect(result.data?.environment).toMatchObject({ lightingStrength: 0 });
  });

  it('procedural-sky lightingStrength 为负数报错', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.environment = {
      type: 'procedural-sky',
      sunElevationDeg: 35,
      sunAzimuthDeg: 120,
      lightingStrength: -0.5,
    };
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(false);
    const issue = result.issues.find(
      (item) => item.path === 'environment.lightingStrength',
    );
    expect(issue?.severity).toBe('error');
  });

  it('pbr.dispersion / attenuationColor / attenuationDistance 合法值通过', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.materials[0].pbr = {
      transmission: 1,
      thickness: 0.01,
      dispersion: 0.05,
      attenuationColor: '#d8e8f0',
      attenuationDistance: 0.5,
    };
    const result = validateScenePackage(pkg);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('pbr.dispersion 为负数报错', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.materials[0].pbr = { dispersion: -0.1 };
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(false);
    const issue = result.issues.find(
      (item) => item.path === 'materials.0.pbr.dispersion',
    );
    expect(issue?.severity).toBe('error');
  });

  it('pbr.attenuationColor 非 #rrggbb 报错', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.materials[0].pbr = { attenuationColor: 'red' };
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(false);
    const issue = result.issues.find(
      (item) => item.path === 'materials.0.pbr.attenuationColor',
    );
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain('#rrggbb');
  });

  it('pbr.attenuationDistance 为 0 或负数报错', () => {
    for (const value of [0, -1]) {
      const pkg = loadExample('minimal.scene.json');
      pkg.materials[0].pbr = { attenuationDistance: value };
      const result = validateScenePackage(pkg);
      expect(result.ok).toBe(false);
      const issue = result.issues.find(
        (item) => item.path === 'materials.0.pbr.attenuationDistance',
      );
      expect(issue?.severity).toBe('error');
    }
  });
});

describe('validateScenePackage：语义规则', () => {
  it('id 重复报 error 并指出两处位置', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.lights[0].id = pkg.cameras[0].id;
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(false);
    const issue = result.issues.find((item) => item.path === 'lights.0.id');
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain('重复');
    expect(issue?.message).toContain('cameras.0.id');
  });

  it('shadow.mapSize 超过 4096 触发性能 warning（不阻断）', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.renderer.shadows.mapSize = 8192;
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(true);
    const issue = result.issues.find(
      (item) => item.path === 'renderer.shadows.mapSize',
    );
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toContain('4096');
  });

  it('灯光级 shadow.mapSize 超过 4096 同样触发 warning', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.lights[0].shadow = { castShadow: true, mapSize: 8192 };
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(true);
    const issue = result.issues.find(
      (item) => item.path === 'lights.0.shadow.mapSize',
    );
    expect(issue?.severity).toBe('warning');
  });

  it('match.names 为空数组触发 warning（不阻断）', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.materials[0].match.names = [];
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(true);
    const issue = result.issues.find(
      (item) => item.path === 'materials.0.match.names',
    );
    expect(issue?.severity).toBe('warning');
  });

  it('.001 后缀触发 warning（name / id / match.names 均覆盖）', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.materials[0].name = 'Ground.001';
    pkg.objects[0].id = 'ground.002';
    pkg.objects[0].match.names = ['Ground', 'Ground.003'];
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(true);
    const warnings = result.issues.filter(
      (item) => item.severity === 'warning',
    );
    expect(warnings.length).toBe(3);
    expect(warnings.map((item) => item.path)).toEqual([
      'materials.0.name',
      'objects.0.id',
      'objects.0.match.names.1',
    ]);
    for (const warning of warnings) {
      expect(warning.message).toContain('Blender');
    }
  });

  it('结构合法时即使存在 error 级语义问题也返回 data', () => {
    const pkg = loadExample('minimal.scene.json');
    pkg.lights[0].id = pkg.cameras[0].id;
    const result = validateScenePackage(pkg);
    expect(result.ok).toBe(false);
    expect(result.data).toBeDefined();
  });
});
