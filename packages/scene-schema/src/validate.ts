import type { z } from 'zod';
import { SCHEMA_FORMAT, SCHEMA_VERSION } from './constants.ts';
import { hasBlenderDuplicationSuffix } from './ids.ts';
import type { ScenePackage } from './package.ts';
import { scenePackageSchema } from './package.ts';

/** 单条校验问题：error 阻断交付，warning 提示风险 */
export interface ValidationIssue {
  /** 点分字段路径（数组下标为小数位，如 "lights.0.color"；根级问题为 "(root)"） */
  path: string;
  /** 人读消息（中文，面向包括非前端设计师在内的所有协作者） */
  message: string;
  severity: 'error' | 'warning';
}

/** 校验结果：ok = 没有任何 error；data 在结构校验通过时提供（即使有 error 级语义问题） */
export interface ValidateResult {
  ok: boolean;
  issues: ValidationIssue[];
  data?: ScenePackage;
}

/** 阴影贴图边长的推荐上限（像素），超过触发性能 warning */
export const MAX_RECOMMENDED_SHADOW_MAP_SIZE = 4096;

/**
 * 校验场景包：先查 format/version 身份，再做 zod 结构校验，最后跑跨字段语义规则。
 * 任何输入（包括非对象）都安全返回 ValidateResult，不抛异常。
 */
export function validateScenePackage(input: unknown): ValidateResult {
  // 1. format / version 前置检查：给出明确的版本提示，而不是笼统的 literal 不匹配
  const headerIssues = checkHeader(input);
  if (headerIssues.length > 0) {
    return { ok: false, issues: headerIssues };
  }

  // 2. zod 结构校验（strict：多余字段也算错误）
  const parsed = scenePackageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: translateIssue(issue),
        severity: 'error',
      })),
    };
  }

  // 3. 语义规则（结构合法之后才有意义）
  const data = parsed.data;
  const issues = runSemanticRules(data);
  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues,
    data,
  };
}

/** format / version 身份检查 */
function checkHeader(input: unknown): ValidationIssue[] {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return [
      {
        path: '(root)',
        message: '场景包必须是一个 JSON 对象',
        severity: 'error',
      },
    ];
  }
  const record = input as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  if (record.format !== SCHEMA_FORMAT) {
    issues.push({
      path: 'format',
      message: `format 缺失或不匹配：应为 "${SCHEMA_FORMAT}"，实际为 ${describeRaw(record.format)}。当前支持的契约为 ${SCHEMA_FORMAT} v${SCHEMA_VERSION}`,
      severity: 'error',
    });
  }
  if (record.version !== SCHEMA_VERSION) {
    issues.push({
      path: 'version',
      message: `version 缺失或不匹配：应为 ${SCHEMA_VERSION}，实际为 ${describeRaw(record.version)}。当前支持的版本为 ${SCHEMA_VERSION}（版本不匹配时请用对应版本的导出器重新导出）`,
      severity: 'error',
    });
  }
  return issues;
}

/** 结构合法后的语义规则：id 唯一性、性能风险、Blender 侧隐患 */
function runSemanticRules(pkg: ScenePackage): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 规则一：id 是场景内唯一主键，跨 cameras/lights/materials/objects 全局查重
  const idFirstSeenAt = new Map<string, string>();
  const checkUniqueId = (id: string, path: string): void => {
    const firstPath = idFirstSeenAt.get(id);
    if (firstPath !== undefined) {
      issues.push({
        path,
        message: `id "${id}" 重复：首次出现于 ${firstPath}，再次出现于 ${path}。id 是场景包内的唯一主键，重名会导致覆盖关系错乱，请修改其中一个`,
        severity: 'error',
      });
      return;
    }
    idFirstSeenAt.set(id, path);
  };
  pkg.cameras.forEach((camera, i) =>
    checkUniqueId(camera.id, `cameras.${i}.id`),
  );
  pkg.lights.forEach((light, i) => checkUniqueId(light.id, `lights.${i}.id`));
  pkg.materials.forEach((material, i) =>
    checkUniqueId(material.id, `materials.${i}.id`),
  );
  pkg.objects.forEach((object, i) =>
    checkUniqueId(object.id, `objects.${i}.id`),
  );

  // 规则二：阴影贴图边长超过 4096 → 性能 warning（显存随边长平方增长）
  const globalMapSize = pkg.renderer.shadows.mapSize;
  if (globalMapSize > MAX_RECOMMENDED_SHADOW_MAP_SIZE) {
    issues.push({
      path: 'renderer.shadows.mapSize',
      message: `阴影贴图 mapSize=${globalMapSize} 超过 ${MAX_RECOMMENDED_SHADOW_MAP_SIZE}：显存占用随边长平方增长，低端设备可能明显卡顿，建议降到 2048 或 4096`,
      severity: 'warning',
    });
  }
  pkg.lights.forEach((light, i) => {
    const mapSize = light.shadow?.mapSize;
    if (mapSize !== undefined && mapSize > MAX_RECOMMENDED_SHADOW_MAP_SIZE) {
      issues.push({
        path: `lights.${i}.shadow.mapSize`,
        message: `灯光 "${light.name}"（${light.id}）的 shadow.mapSize=${mapSize} 超过 ${MAX_RECOMMENDED_SHADOW_MAP_SIZE}：显存占用随边长平方增长，建议降到 2048 或 4096`,
        severity: 'warning',
      });
    }
  });

  // 规则三：match.names 为空 → 该条覆盖匹配不到任何 GLB 条目
  const checkEmptyMatch = (
    kind: string,
    index: number,
    name: string,
    id: string,
    names: string[],
  ): void => {
    if (names.length === 0) {
      issues.push({
        path: `${kind}.${index}.match.names`,
        message: `${kind === 'materials' ? '材质' : '对象'} "${name}"（${id}）的 match.names 为空数组：这条覆盖不会匹配到任何 GLB 条目。如果是有意占位可以忽略`,
        severity: 'warning',
      });
    }
  };
  pkg.materials.forEach((material, i) =>
    checkEmptyMatch(
      'materials',
      i,
      material.name,
      material.id,
      material.match.names,
    ),
  );
  pkg.objects.forEach((object, i) =>
    checkEmptyMatch('objects', i, object.name, object.id, object.match.names),
  );

  // 规则四：Blender 自动重命名后缀（.001 等）→ 提示回 Blender 清理重名
  const checkDuplicationSuffix = (value: string, path: string): void => {
    if (hasBlenderDuplicationSuffix(value)) {
      issues.push({
        path,
        message: `"${value}" 带有 Blender 自动重命名后缀（.001/.002 等）：通常说明 .blend 里存在同名条目，请回到 Blender 清理重名后重新导出，避免匹配关系错乱`,
        severity: 'warning',
      });
    }
  };
  const entries: Array<{
    section: string;
    index: number;
    id: string;
    name: string;
    matchNames?: string[];
  }> = [
    ...pkg.cameras.map((camera, i) => ({
      section: 'cameras',
      index: i,
      id: camera.id,
      name: camera.name,
    })),
    ...pkg.lights.map((light, i) => ({
      section: 'lights',
      index: i,
      id: light.id,
      name: light.name,
    })),
    ...pkg.materials.map((material, i) => ({
      section: 'materials',
      index: i,
      id: material.id,
      name: material.name,
      matchNames: material.match.names,
    })),
    ...pkg.objects.map((object, i) => ({
      section: 'objects',
      index: i,
      id: object.id,
      name: object.name,
      matchNames: object.match.names,
    })),
  ];
  for (const entry of entries) {
    checkDuplicationSuffix(entry.id, `${entry.section}.${entry.index}.id`);
    checkDuplicationSuffix(entry.name, `${entry.section}.${entry.index}.name`);
    entry.matchNames?.forEach((matchName, j) =>
      checkDuplicationSuffix(
        matchName,
        `${entry.section}.${entry.index}.match.names.${j}`,
      ),
    );
  }

  return issues;
}

/** zod issue path → 点分路径；根级用 "(root)" */
function formatIssuePath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return '(root)';
  }
  return path.map((segment) => String(segment)).join('.');
}

/** 原始值简述（用于 header 检查消息） */
function describeRaw(value: unknown): string {
  if (value === undefined) {
    return '缺失（undefined）';
  }
  return JSON.stringify(value) ?? '无法序列化的值';
}

/** zod 期望类型的中文名 */
function translateExpected(expected: string): string {
  const map: Record<string, string> = {
    string: '字符串',
    number: '数字',
    int: '整数',
    boolean: '布尔值',
    array: '数组',
    object: '对象',
    tuple: '定长数组',
    date: '日期',
    nan: 'NaN',
    null: 'null',
    undefined: 'undefined',
  };
  return map[expected] ?? expected;
}

/** 实际输入值的简述（截断长字符串） */
function describeInput(input: unknown): string {
  if (typeof input === 'string') {
    const truncated = input.length > 50 ? `${input.slice(0, 50)}…` : input;
    return `字符串 "${truncated}"`;
  }
  if (typeof input === 'number') {
    return `数字 ${input}`;
  }
  if (typeof input === 'boolean') {
    return `布尔值 ${input}`;
  }
  if (input === null) {
    return 'null';
  }
  if (Array.isArray(input)) {
    return `数组（${input.length} 个元素）`;
  }
  if (typeof input === 'object') {
    return '对象';
  }
  return typeof input;
}

/**
 * zod issue → 中文人读消息。
 * 带自定义 error 的字段（颜色、枚举等）message 本身已是中文，直接使用；
 * 其余按 issue code 统一翻译。
 */
function translateIssue(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type': {
      if (issue.input === undefined) {
        return `缺少必填字段（应为${translateExpected(issue.expected)}）`;
      }
      return `类型错误：应为${translateExpected(issue.expected)}，实际为${describeInput(issue.input)}`;
    }
    case 'too_small': {
      if (issue.origin === 'string') {
        const actual =
          typeof issue.input === 'string'
            ? `，实际 ${issue.input.length} 个`
            : '';
        return `字符串长度不足：至少 ${issue.minimum} 个字符${actual}`;
      }
      if (issue.origin === 'array') {
        const actual = Array.isArray(issue.input)
          ? `，实际 ${issue.input.length} 个`
          : '';
        if (issue.exact) {
          return `数组长度不对：必须恰好 ${issue.minimum} 个元素${actual}`;
        }
        return `数组元素不足：至少 ${issue.minimum} 个${actual}`;
      }
      return `数值不合法：应大于${issue.inclusive ? '等于' : ''} ${issue.minimum}`;
    }
    case 'too_big': {
      if (issue.origin === 'string') {
        return `字符串过长：最多 ${issue.maximum} 个字符`;
      }
      if (issue.origin === 'array') {
        const actual = Array.isArray(issue.input)
          ? `，实际 ${issue.input.length} 个`
          : '';
        if (issue.exact) {
          return `数组长度不对：必须恰好 ${issue.maximum} 个元素${actual}`;
        }
        return `数组元素过多：最多 ${issue.maximum} 个${actual}`;
      }
      return `数值不合法：应小于${issue.inclusive ? '等于' : ''} ${issue.maximum}`;
    }
    case 'invalid_value': {
      const values = issue.values
        .map((value) => JSON.stringify(value))
        .join(' / ');
      return `取值不合法：只允许 ${values}`;
    }
    case 'invalid_format': {
      // 契约里的 format 检查（颜色正则、日期时间等）都声明了中文 error，直接使用
      return issue.message;
    }
    case 'unrecognized_keys': {
      const keys = issue.keys.map((key) => `"${key}"`).join('、');
      return `存在契约未声明的多余字段：${keys}（本契约为 strict 模式，请检查字段名拼写或移除该字段）`;
    }
    case 'invalid_union': {
      return '结构不匹配任何允许的变体，请检查 type 判别字段及各变体字段';
    }
    case 'not_multiple_of': {
      return `数值必须是 ${issue.divisor} 的整数倍`;
    }
    case 'custom': {
      return issue.message;
    }
    default: {
      return issue.message;
    }
  }
}
