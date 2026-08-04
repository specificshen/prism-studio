import type {
  FogConfig,
  HdriEnvironment,
  SceneEnvironment,
} from '@prism/scene-schema';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import {
  Color,
  EquirectangularReflectionMapping,
  Euler,
  Fog,
  MathUtils,
  type Object3D,
  PMREMGenerator,
  type RenderTarget,
  Scene,
  type Texture,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import { PrismUnsupportedError } from '../core/errors.ts';
import { EDITOR_DEFAULTS } from '../core/presets.ts';
import { resolveAssetUrl } from '../loaders/resolve-url.ts';

export interface ApplyEnvironmentOptions {
  /** HDRI 等相对 url 的解析基准 */
  baseUrl?: string;
  /**
   * procedural-sky 烘焙天空 IBL 所需的渲染器（须已完成 init()）。
   * 缺省时天空退化为仅可视背景并给出 warning。
   */
  renderer?: WebGPURenderer;
}

/** 一次环境应用的产物句柄：更新/销毁时据此回收资源 */
export interface EnvironmentHandle {
  /** 加入场景的节点（SkyMesh 等） */
  nodes: Object3D[];
  /** 加载的贴图 */
  textures: Texture[];
  /** 烘焙产物（PMREM RenderTarget 等） */
  renderTargets: RenderTarget[];
  warnings: string[];
  /** 移除节点并释放贴图/烘焙产物（场景字段由下一次 apply 覆盖） */
  dispose(): void;
}

/**
 * 按 pkg.environment 判别联合分发应用环境。
 * 每次调用先重置 scene 上的环境字段，保证增量更新不残留上一份状态。
 */
export async function applyEnvironment(
  scene: Scene,
  env: SceneEnvironment,
  options: ApplyEnvironmentOptions = {},
): Promise<EnvironmentHandle> {
  resetSceneEnvironment(scene);
  switch (env.type) {
    case 'hdri':
      return applyHdriEnvironment(scene, env, options);
    case 'procedural-sky':
      return applyProceduralSky(scene, env, options);
    case 'physical-atmosphere':
      // 契约标记 experimental：v1 明确不实现，显式抛错而不是静默出错误画面
      throw new PrismUnsupportedError(
        'physical-atmosphere 为 experimental，v1 未实现',
      );
  }
}

/** 重置 scene 上的环境字段（背景/环境贴图/强度/旋转/雾） */
function resetSceneEnvironment(scene: Scene): void {
  scene.environment = null;
  scene.background = null;
  scene.environmentIntensity = 1;
  scene.backgroundIntensity = 1;
  scene.environmentRotation.set(0, 0, 0);
  scene.backgroundRotation.set(0, 0, 0);
  scene.fog = null;
}

function makeHandle(
  nodes: Object3D[],
  textures: Texture[],
  warnings: string[],
  renderTargets: RenderTarget[] = [],
): EnvironmentHandle {
  return {
    nodes,
    textures,
    renderTargets,
    warnings,
    dispose() {
      for (const node of nodes) {
        node.removeFromParent();
      }
      for (const texture of textures) {
        texture.dispose();
      }
      for (const renderTarget of renderTargets) {
        renderTarget.dispose();
      }
    },
  };
}

/** 按扩展名选择 EXR / RGBE 加载器 */
async function loadHdrTexture(url: string): Promise<Texture> {
  const isExr = /\.exr($|\?)/i.test(url);
  const texture = isExr
    ? await new EXRLoader().loadAsync(url)
    : await new RGBELoader().loadAsync(url);
  texture.mapping = EquirectangularReflectionMapping;
  return texture;
}

/** HDRI 环境：环境贴图照明 + 可视背景（贴图或纯色）+ 可选雾 */
async function applyHdriEnvironment(
  scene: Scene,
  env: HdriEnvironment,
  options: ApplyEnvironmentOptions,
): Promise<EnvironmentHandle> {
  const warnings: string[] = [];
  const textures: Texture[] = [];

  const envTexture = await loadHdrTexture(
    resolveAssetUrl(env.url, options.baseUrl),
  );
  textures.push(envTexture);

  // 光照强度 = 背景强度 × 光照强度（两个数据字段解耦，相乘得到 IBL 总强度）
  scene.environment = envTexture;
  scene.environmentIntensity = env.strength * env.lightingStrength;
  scene.environmentRotation.copy(eulerDegToRad(env.rotation));

  // 可视背景：缺省与 texture 模式用贴图（可用独立背景图，否则复用环境图）；
  // color 模式换纯色
  const visibleBackground = env.visibleBackground;
  if (!visibleBackground || visibleBackground.type === 'texture') {
    let backgroundTexture = envTexture;
    if (visibleBackground?.type === 'texture' && visibleBackground.url) {
      backgroundTexture = await loadHdrTexture(
        resolveAssetUrl(visibleBackground.url, options.baseUrl),
      );
      textures.push(backgroundTexture);
    }
    scene.background = backgroundTexture;
    scene.backgroundIntensity = env.strength;
    scene.backgroundRotation.copy(eulerDegToRad(env.rotation));
  } else {
    if (!visibleBackground.color) {
      warnings.push(
        'visibleBackground.type 为 color 但未提供 color，背景保持透明',
      );
    } else {
      scene.background = new Color(visibleBackground.color);
    }
  }

  applyFog(scene, env.fog);
  return makeHandle([], textures, warnings);
}

/**
 * 程序化天空：r185 的 Sky addon 只支持 WebGLRenderer，WebGPU 下对应实现是
 * SkyMesh（TSL 节点材质天穹，同为 Preetham 模型），因此直接用 SkyMesh。
 *
 * 双角色（v1.1 起）：
 * - 可视背景：SkyMesh 挂进主场景（行为不变）；
 * - 天空光照（IBL）：把只含同款天穹的临时场景用 PMREMGenerator 烘成
 *   scene.environment，强度来自数据字段 lightingStrength——天空光是
 *   契约显式声明的光源，不违反数据驱动铁律。太阳圆盘不烘进 IBL
 *   （太阳照明照旧全部来自 pkg.lights，避免双份太阳能量）。
 */
function applyProceduralSky(
  scene: Scene,
  env: Extract<SceneEnvironment, { type: 'procedural-sky' }>,
  options: ApplyEnvironmentOptions,
): EnvironmentHandle {
  const warnings: string[] = [];
  const renderTargets: RenderTarget[] = [];

  const sky = new SkyMesh();
  sky.name = 'Prism Procedural Sky';
  sky.scale.setScalar(EDITOR_DEFAULTS.environment.skyDomeScale);
  sky.frustumCulled = false;
  sky.sunPosition.value.copy(
    sunDirection(env.sunElevationDeg, env.sunAzimuthDeg),
  );
  if (env.turbidity !== undefined) {
    sky.turbidity.value = env.turbidity;
  }
  scene.add(sky);

  if (options.renderer) {
    const renderTarget = bakeSkyEnvironment(options.renderer, env);
    renderTargets.push(renderTarget);
    scene.environment = renderTarget.texture;
    // IBL 强度来自数据（契约 v1.1 字段，缺省由 schema 补 1）
    scene.environmentIntensity = env.lightingStrength;
  } else {
    warnings.push(
      '未提供 renderer：procedural-sky 的天空光照（IBL）未烘焙，天空仅作为可视背景',
    );
  }

  applyFog(scene, env.fog);
  return makeHandle([sky], [], warnings, renderTargets);
}

/**
 * 天空 IBL 烘焙：临时场景只放一个与可视天穹同参数的 SkyMesh
 * （隐藏太阳圆盘，SkyMesh 官方推荐的环境贴图用法），用 PMREMGenerator.fromScene
 * 烘成 CubeUV RenderTarget。同步 API 要求 renderer 已 init（PrismRenderer.create
 * 已 await renderer.init()，r185 官方口径，旧工程 fromEquirectangular 同用法）。
 *
 * 资源管理：PMREMGenerator 内部材质在本函数内 dispose；返回的 RenderTarget
 * 由 EnvironmentHandle 登记，updateEnvironment 重跑 / renderer dispose 时回收；
 * 临时场景的天穹几何与材质烘完即弃。
 */
function bakeSkyEnvironment(
  renderer: WebGPURenderer,
  env: Extract<SceneEnvironment, { type: 'procedural-sky' }>,
): RenderTarget {
  const bakeScene = new Scene();
  const bakeSky = new SkyMesh();
  bakeSky.sunPosition.value.copy(
    sunDirection(env.sunElevationDeg, env.sunAzimuthDeg),
  );
  if (env.turbidity !== undefined) {
    bakeSky.turbidity.value = env.turbidity;
  }
  // 太阳盘不进 IBL：太阳能量由 pkg.lights 的太阳灯负责（数据声明），
  // 烘进 IBL 会双份计数；同时避免高频圆盘在低分辨率 CubeUV 上的走样
  bakeSky.showSunDisc.value = 0;
  bakeScene.add(bakeSky);

  const { size, sigma, near, far } = EDITOR_DEFAULTS.environment.skyIbl;
  const pmrem = new PMREMGenerator(renderer);
  try {
    return pmrem.fromScene(bakeScene, sigma, near, far, { size });
  } finally {
    pmrem.dispose();
    bakeSky.geometry.dispose();
    bakeSky.material.dispose();
  }
}

/**
 * 太阳方向约定（数据口径）：方位角 0° = 正北（Three 世界 -Z，与 glTF 前方一致），
 * 顺时针增大（90° = 正东 +X）；高度角为地平线以上仰角。
 */
export function sunDirection(
  elevationDeg: number,
  azimuthDeg: number,
): Vector3 {
  const elevation = MathUtils.degToRad(elevationDeg);
  const azimuth = MathUtils.degToRad(azimuthDeg);
  const cosElevation = Math.cos(elevation);
  return new Vector3(
    Math.sin(azimuth) * cosElevation,
    Math.sin(elevation),
    -Math.cos(azimuth) * cosElevation,
  );
}

/** 三种环境都可叠加的线性雾 */
function applyFog(scene: Scene, fog: FogConfig | undefined): void {
  if (!fog?.enabled) {
    return;
  }
  scene.fog = new Fog(fog.color, fog.near, fog.far);
}

/** 欧拉角（度，XYZ）→ Three Euler（弧度） */
function eulerDegToRad(rotationDeg: readonly [number, number, number]): Euler {
  return new Euler(
    MathUtils.degToRad(rotationDeg[0]),
    MathUtils.degToRad(rotationDeg[1]),
    MathUtils.degToRad(rotationDeg[2]),
    'XYZ',
  );
}
