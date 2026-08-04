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
  type Scene,
  type Texture,
  Vector3,
} from 'three/webgpu';
import { PrismUnsupportedError } from '../core/errors.ts';
import { EDITOR_DEFAULTS } from '../core/presets.ts';
import { resolveAssetUrl } from '../loaders/resolve-url.ts';

export interface ApplyEnvironmentOptions {
  /** HDRI 等相对 url 的解析基准 */
  baseUrl?: string;
}

/** 一次环境应用的产物句柄：更新/销毁时据此回收资源 */
export interface EnvironmentHandle {
  /** 加入场景的节点（SkyMesh 等） */
  nodes: Object3D[];
  /** 加载的贴图 */
  textures: Texture[];
  warnings: string[];
  /** 移除节点并释放贴图（场景字段由下一次 apply 覆盖） */
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
      return applyProceduralSky(scene, env);
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
): EnvironmentHandle {
  return {
    nodes,
    textures,
    warnings,
    dispose() {
      for (const node of nodes) {
        node.removeFromParent();
      }
      for (const texture of textures) {
        texture.dispose();
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
 * 程序化天空：r184 的 Sky addon 只支持 WebGLRenderer，WebGPU 下对应实现是
 * SkyMesh（TSL 节点材质天穹，同为 Preetham 模型），因此直接用 SkyMesh。
 * v1 只把它作为可视背景；场景照明仍全部来自 pkg.lights 数据
 * （不把天穹烘焙成 IBL——那属于未声明的隐式光源，违反数据驱动铁律）。
 */
function applyProceduralSky(
  scene: Scene,
  env: Extract<SceneEnvironment, { type: 'procedural-sky' }>,
): EnvironmentHandle {
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
  applyFog(scene, env.fog);
  return makeHandle([sky], [], []);
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
