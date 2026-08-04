/**
 * 面板控件的取值范围与展示兜底（唯一集中处）。
 * 这些是 UI 交互约束（slider min/max/step），不是渲染口径——
 * 渲染参数永远来自场景包数据或 renderer-core 的 EDITOR_DEFAULTS。
 */

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

export const INSPECTOR_RANGES = {
  fog: {
    near: { min: 0, max: 500, step: 1 },
    far: { min: 1, max: 2000, step: 1 },
  },
  hdri: {
    strength: { min: 0, max: 4, step: 0.05 },
    lightingStrength: { min: 0, max: 4, step: 0.05 },
  },
  sky: {
    sunElevationDeg: { min: -10, max: 90, step: 0.5 },
    sunAzimuthDeg: { min: 0, max: 360, step: 1 },
    turbidity: { min: 1, max: 20, step: 0.1 },
  },
  light: {
    energyWatts: { min: 0, max: 2000, step: 1 },
    intensityScale: { min: 0, max: 10, step: 0.05 },
  },
  camera: {
    lensMm: { min: 8, max: 200, step: 1 },
    clipNear: { min: 0.01, max: 100, step: 0.01 },
    clipFar: { min: 1, max: 10000, step: 10 },
  },
  bloom: {
    threshold: { min: 0, max: 4, step: 0.01 },
    strength: { min: 0, max: 2, step: 0.01 },
    radius: { min: 0, max: 1, step: 0.01 },
  },
  ao: {
    strength: { min: 0, max: 2, step: 0.01 },
    radius: { min: 0.05, max: 5, step: 0.05 },
    resolutionScale: { min: 0.25, max: 1, step: 0.05 },
  },
  toneMapping: {
    exposureStops: { min: -5, max: 5, step: 0.1 },
  },
  pbr: {
    /** metalness / roughness / opacity / transmission 共用 0~1 */
    unit: { min: 0, max: 1, step: 0.01 },
    emissiveIntensity: { min: 0, max: 10, step: 0.05 },
    ior: { min: 1, max: 2.5, step: 0.01 },
  },
} as const satisfies Record<string, Record<string, SliderRange>>;

/**
 * 可选数据节的「新增」初始值：用户点「添加」时创建的数据起点，
 * 创建后即成为场景文档数据，随导出落盘。
 */
export const INSPECTOR_SECTION_DEFAULTS = {
  fog: { enabled: true, color: '#8a939e', near: 50, far: 300 },
  bloom: { enabled: true, threshold: 1, strength: 0.25, radius: 0.6 },
  ao: { enabled: true, strength: 1, radius: 0.5, resolutionScale: 1 },
} as const;

/**
 * 可选字段未覆盖时的展示值（仅控件显示用，不写回文档）：
 * 与 three.js 材质/天空参数缺省口径一致的通用中立值。
 */
export const INSPECTOR_DISPLAY_FALLBACKS = {
  turbidity: 4,
  pbr: {
    metalness: 0,
    roughness: 1,
    opacity: 1,
    transmission: 0,
    ior: 1.5,
    emissive: '#000000',
    emissiveIntensity: 1,
  },
} as const;
