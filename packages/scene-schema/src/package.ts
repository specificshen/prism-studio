import { z } from 'zod';
import { assetsSchema } from './assets.ts';
import { cameraSchema } from './camera.ts';
import { SCHEMA_FORMAT, SCHEMA_VERSION } from './constants.ts';
import { environmentSchema } from './environment.ts';
import { lightSchema } from './light.ts';
import { materialSchema } from './material.ts';
import { metaSchema } from './meta.ts';
import { objectSchema } from './object.ts';
import { postSchema } from './post.ts';
import { rendererSchema } from './renderer.ts';

/**
 * 反射探针：v1 仅保留位置声明，字段结构后续版本再定。
 * 允许携带任意条目共存，渲染器 v1 可忽略。
 */
export const probesSchema = z.strictObject({
  reflection: z.array(z.unknown()).optional(),
  planar: z.array(z.unknown()).optional(),
});

/**
 * 场景包顶层契约（format: "prism-scene", version: 1）。
 *
 * 数据口径铁律：
 * - 坐标系永远是 Blender 坐标系（coordinateSystem 固定 "blender"）
 * - 单位永远是公制物理单位（units 固定 "metric"）
 * - 任何坐标/单位/FOV 换算只允许发生在 renderer-core 的 convert 层
 */
export const scenePackageSchema = z.strictObject({
  /** 格式标识，固定 "prism-scene" */
  format: z.literal(SCHEMA_FORMAT),
  /** 契约版本，当前为 1 */
  version: z.literal(SCHEMA_VERSION),
  meta: metaSchema,
  /** 数据坐标系，v1 固定 "blender" */
  coordinateSystem: z.literal('blender', {
    error:
      'coordinateSystem 只支持 "blender"（换算只允许发生在 renderer-core）',
  }),
  /** 数据单位制，v1 固定 "metric" */
  units: z.literal('metric', {
    error: 'units 只支持 "metric"',
  }),
  assets: assetsSchema,
  renderer: rendererSchema,
  post: postSchema,
  environment: environmentSchema,
  cameras: z.array(cameraSchema, { error: 'cameras 应为数组' }),
  lights: z.array(lightSchema, { error: 'lights 应为数组' }),
  materials: z.array(materialSchema, { error: 'materials 应为数组' }),
  objects: z.array(objectSchema, { error: 'objects 应为数组' }),
  probes: probesSchema.optional(),
});

export type SceneProbes = z.infer<typeof probesSchema>;
export type ScenePackage = z.infer<typeof scenePackageSchema>;
