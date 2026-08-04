#!/usr/bin/env node
/**
 * 从 zod schema 生成 JSON Schema（draft 2020-12），供 ISV 用任意工具离线校验场景包。
 *
 * 用法：pnpm --filter @prism/scene-schema build
 * 产物：packages/scene-schema/json-schema/prism-scene-v1.json（自动生成，请勿手改）
 *
 * 依赖 Node ≥ 22.18（直接 import ../src/index.ts，靠原生 type stripping 运行 TS）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { scenePackageSchema } from '../src/index.ts';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(packageRoot, 'json-schema');
const outputPath = join(outputDir, 'prism-scene-v1.json');

// io: 'input' —— ISV 校验的是"待提交的文件"，带默认值的字段（如 intensityScale）允许缺省；
// unrepresentable 保持默认 'throw'：任何无法表达为 JSON Schema 的定义都应让构建失败，而不是静默放行
const jsonSchema = z.toJSONSchema(scenePackageSchema, { io: 'input' });

const document = {
  $id: 'https://prism-studio.dev/schemas/prism-scene-v1.json',
  title: 'Prism Scene Package v1',
  description:
    'prism-studio 场景包契约（format: "prism-scene", version: 1）。由 packages/scene-schema 的 zod schema 自动生成，请勿手改。',
  ...jsonSchema,
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

// 回读验证：产物必须是可解析的 JSON 且顶层为 object schema
const parsed = JSON.parse(readFileSync(outputPath, 'utf8'));
if (parsed.type !== 'object' || !Array.isArray(parsed.required)) {
  throw new Error(`生成的 JSON Schema 结构异常：${outputPath}`);
}

console.log(`JSON Schema 生成成功：${outputPath}`);
