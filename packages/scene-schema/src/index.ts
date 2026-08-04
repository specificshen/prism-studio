/**
 * @prism/scene-schema —— prism-studio 的场景包契约包。
 *
 * 甲方前端与 ISV 之间的唯一数据契约：
 * - zod strict schema 定义 + TS 类型
 * - validateScenePackage：人读（中文）校验报告
 * - serializeScenePackage：2 空格缩进 + 浮点 5 位取整的规范落盘格式
 * - makeId / hasBlenderDuplicationSuffix：稳定 id 与 Blender 重名检测
 *
 * 人读文档见仓库 docs/schema-v1.md。
 */

export type { AssetRef, SceneAssets } from './assets.ts';
export { assetRefSchema, assetsSchema } from './assets.ts';
export type { SceneCamera } from './camera.ts';
export { cameraSchema } from './camera.ts';
export { SCHEMA_FORMAT, SCHEMA_VERSION } from './constants.ts';
export type {
  FogConfig,
  HdriEnvironment,
  PhysicalAtmosphereEnvironment,
  ProceduralSkyEnvironment,
  SceneEnvironment,
  VisibleBackground,
} from './environment.ts';
export {
  environmentSchema,
  fogSchema,
  hdriEnvironmentSchema,
  physicalAtmosphereEnvironmentSchema,
  proceduralSkyEnvironmentSchema,
  visibleBackgroundSchema,
} from './environment.ts';
export { hasBlenderDuplicationSuffix, makeId } from './ids.ts';
export type {
  AreaParams,
  LightShadow,
  LightType,
  SceneLight,
  SpotParams,
} from './light.ts';
export {
  areaParamsSchema,
  lightSchema,
  lightShadowSchema,
  lightTypeSchema,
  spotParamsSchema,
} from './light.ts';
export type {
  GlassLayer,
  GlassOverride,
  PbrOverride,
  SceneMaterial,
} from './material.ts';
export {
  glassLayerSchema,
  glassSchema,
  materialSchema,
  pbrOverrideSchema,
} from './material.ts';
export type { SceneMeta } from './meta.ts';
export { metaSchema } from './meta.ts';
export type { SceneObject } from './object.ts';
export { objectSchema } from './object.ts';
export type { ScenePackage, SceneProbes } from './package.ts';
export { probesSchema, scenePackageSchema } from './package.ts';
export type {
  AoConfig,
  BloomConfig,
  ScenePost,
  SsgiConfig,
  SsrConfig,
} from './post.ts';
export {
  aoSchema,
  bloomSchema,
  postSchema,
  ssgiSchema,
  ssrSchema,
} from './post.ts';
export type { MatchRule } from './primitives.ts';
export {
  COLOR_REGEX,
  colorSchema,
  eulerRotationSchema,
  idSchema,
  matchRuleSchema,
  transformSchema,
} from './primitives.ts';
export type {
  ColorGrading,
  RendererShadows,
  SceneRenderer,
  ToneMapping,
  ToneMappingType,
} from './renderer.ts';
export {
  colorGradingSchema,
  rendererSchema,
  rendererShadowsSchema,
  toneMappingSchema,
  toneMappingTypeSchema,
} from './renderer.ts';
export {
  SERIALIZE_FLOAT_DECIMALS,
  serializeScenePackage,
} from './serialize.ts';
export type { ValidateResult, ValidationIssue } from './validate.ts';
export {
  MAX_RECOMMENDED_SHADOW_MAP_SIZE,
  validateScenePackage,
} from './validate.ts';
