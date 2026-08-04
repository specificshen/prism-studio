/**
 * @prism/renderer-core —— prism-studio 的 Three.js WebGPU 渲染核（纯 TS，无 React）。
 *
 * 数据驱动铁律：视觉参数只有两个合法来源——场景包数据（@prism/scene-schema）
 * 与 core/presets.ts 里显式声明的 EDITOR_DEFAULTS。
 */

export type { BlenderCameraLens } from './convert/camera.ts';
// convert（唯一坐标/单位换算层）
export {
  applyBlenderCamera,
  BLENDER_SENSOR_ASPECT,
  getBlenderCameraVerticalFov,
} from './convert/camera.ts';
export {
  blenderMatrixForwardToThree,
  blenderMatrixToThree,
  blenderRotationToThree,
  blenderVectorToThree,
  threeMatrixToBlender,
} from './convert/coordinates.ts';
export {
  blenderLightToThreeIntensity,
  FULL_SPHERE_SOLID_ANGLE_SR,
  LUMINOUS_EFFICACY_LM_PER_WATT,
  SUN_WATT_TO_INTENSITY,
} from './convert/light-energy.ts';
export type { PrismDebugHandle } from './core/debug.ts';
// core
export { installDebugHandle, uninstallDebugHandle } from './core/debug.ts';
export {
  PrismUnsupportedError,
  ScenePackageValidationError,
  WebGpuUnsupportedError,
} from './core/errors.ts';
export { EDITOR_DEFAULTS } from './core/presets.ts';
export type {
  LoadPackageOptions,
  LoadPackageResult,
} from './core/prism-renderer.ts';
export { PrismRenderer } from './core/prism-renderer.ts';
export type {
  ApplyEnvironmentOptions,
  EnvironmentHandle,
} from './environment/apply-environment.ts';
// environment
export {
  applyEnvironment,
  sunDirection,
} from './environment/apply-environment.ts';
export type {
  ApplyLightingOptions,
  LightingResult,
} from './lighting/apply-lighting.ts';
// lighting
export { applyLighting } from './lighting/apply-lighting.ts';
export { bootstrapShadowWarmup } from './lighting/shadow-bootstrap.ts';
export type { LoadGlbOptions } from './loaders/load-glb.ts';
// loaders
export { loadGlb } from './loaders/load-glb.ts';
export { resolveAssetUrl } from './loaders/resolve-url.ts';
export { parseScenePackage } from './loaders/validate.ts';
export type {
  ApplyMaterialsResult,
  MaterialMatchReport,
} from './materials/apply-materials.ts';
// materials
export { applyMaterials } from './materials/apply-materials.ts';
export type {
  ApplyObjectsResult,
  ObjectMatchReport,
} from './materials/apply-objects.ts';
export { applyObjects } from './materials/apply-objects.ts';
export type { PostPipeline } from './pipeline/post-pipeline.ts';
// pipeline
export { createPostPipeline } from './pipeline/post-pipeline.ts';
