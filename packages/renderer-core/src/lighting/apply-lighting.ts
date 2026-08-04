import type { RendererShadows, SceneLight } from '@prism/scene-schema';
import {
  type Box3,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Object3D,
  PointLight,
  Quaternion,
  RectAreaLight,
  type Scene,
  Sphere,
  SpotLight,
  Vector3,
} from 'three/webgpu';
import { blenderMatrixToThree } from '../convert/coordinates.ts';
import { blenderLightToThreeIntensity } from '../convert/light-energy.ts';
import { EDITOR_DEFAULTS } from '../core/presets.ts';

export interface ApplyLightingOptions {
  /** 场景包围盒（通常取 GLB 场景的 Box3），用于太阳灯阴影相机贴合 */
  sceneBounds?: Box3;
}

export interface LightingResult {
  /** 加入场景的节点（每盏灯一个挂点，target 挂在同组内） */
  lightNodes: Object3D[];
  /** 第一盏太阳灯（供编辑器面板与环境模块使用） */
  sunLight?: DirectionalLight;
  /** 是否存在开启阴影的灯 */
  hasShadowCaster: boolean;
  warnings: string[];
}

/**
 * 按 pkg.lights 建 three 灯光。
 * 变换走 convert 层（Blender 矩阵 → Three 世界），强度走 light-energy 单一换算层。
 */
export function applyLighting(
  scene: Scene,
  lights: SceneLight[],
  shadows: RendererShadows,
  options: ApplyLightingOptions = {},
): LightingResult {
  const warnings: string[] = [];
  const group = new Group();
  group.name = 'prism-lights';

  // 主阴影灯解析：数据指定 primaryLightId，缺省取第一盏 sun
  const primaryLightId =
    shadows.primaryLightId ?? lights.find((light) => light.type === 'sun')?.id;

  let sunLight: DirectionalLight | undefined;
  let hasShadowCaster = false;

  for (const light of lights) {
    const node = buildLight(light, shadows, primaryLightId, options, warnings);
    if (!node) {
      continue;
    }
    group.add(node.object);
    if (node.target) {
      group.add(node.target);
    }
    if (node.object.castShadow) {
      hasShadowCaster = true;
    }
    if (!sunLight && node.object instanceof DirectionalLight) {
      sunLight = node.object;
    }
  }

  scene.add(group);
  return { lightNodes: [group], sunLight, hasShadowCaster, warnings };
}

interface BuiltLight {
  object: DirectionalLight | PointLight | SpotLight | RectAreaLight;
  target?: Object3D;
}

/** 按契约构造单盏灯；数据不完整（spot/area 缺参数）时收集 warning 并跳过 */
function buildLight(
  light: SceneLight,
  shadows: RendererShadows,
  primaryLightId: string | undefined,
  options: ApplyLightingOptions,
  warnings: string[],
): BuiltLight | null {
  const worldThree = blenderMatrixToThree(light.transform);
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  worldThree.decompose(position, quaternion, scale);

  const color = new Color(light.color);

  switch (light.type) {
    case 'sun': {
      const sun = new DirectionalLight(
        color,
        blenderLightToThreeIntensity(
          'sun',
          light.energyWatts,
          light.intensityScale,
        ),
      );
      sun.name = light.name;
      sun.position.copy(position);
      const target = lightTargetFromMatrix(worldThree, position);
      sun.target = target as DirectionalLight['target'];
      applyShadow(sun, light, shadows, primaryLightId, options);
      return { object: sun, target };
    }
    case 'point': {
      const point = new PointLight(
        color,
        blenderLightToThreeIntensity(
          'point',
          light.energyWatts,
          light.intensityScale,
        ),
      );
      point.name = light.name;
      point.position.copy(position);
      applyShadow(point, light, shadows, primaryLightId, options);
      return { object: point };
    }
    case 'spot': {
      if (!light.spot) {
        warnings.push(
          `灯光 "${light.name}"（${light.id}）类型为 spot 但缺少 spot 参数，已跳过该灯`,
        );
        return null;
      }
      const spot = new SpotLight(
        color,
        blenderLightToThreeIntensity(
          'spot',
          light.energyWatts,
          light.intensityScale,
        ),
      );
      spot.name = light.name;
      spot.position.copy(position);
      // 契约 angleDeg 为聚光锥全角，three 的 angle 是半角
      spot.angle = MathUtils.degToRad(light.spot.angleDeg / 2);
      spot.penumbra = light.spot.blend ?? 0;
      const target = lightTargetFromMatrix(worldThree, position);
      spot.target = target as SpotLight['target'];
      applyShadow(spot, light, shadows, primaryLightId, options);
      return { object: spot, target };
    }
    case 'area': {
      if (!light.area) {
        warnings.push(
          `灯光 "${light.name}"（${light.id}）类型为 area 但缺少 area 参数，已跳过该灯`,
        );
        return null;
      }
      const area = new RectAreaLight(
        color,
        blenderLightToThreeIntensity(
          'area',
          light.energyWatts,
          light.intensityScale,
          light.area.width * light.area.height,
        ),
        light.area.width,
        light.area.height,
      );
      area.name = light.name;
      area.position.copy(position);
      // RectAreaLight 沿本地 -Z 发光，与 Blender area 一致，直接应用朝向
      area.quaternion.copy(quaternion);
      // RectAreaLight 不支持阴影，不参与投影
      return { object: area };
    }
  }
}

/** 由矩阵 -Z 前向推导 target 位置（Blender 灯光沿本地 -Z 照射） */
function lightTargetFromMatrix(
  worldThree: ReturnType<typeof blenderMatrixToThree>,
  position: Vector3,
): Object3D {
  const e = worldThree.elements;
  const forward = new Vector3(-e[8], -e[9], -e[10]).normalize();
  const target = new Object3D();
  target.position.copy(position).add(forward);
  return target;
}

type ShadowCastingLight = DirectionalLight | PointLight | SpotLight;

/** 阴影规则：light.shadow 覆盖 > 全局 renderer.shadows；非主灯默认不投影 */
function applyShadow(
  threeLight: ShadowCastingLight,
  light: SceneLight,
  shadows: RendererShadows,
  primaryLightId: string | undefined,
  options: ApplyLightingOptions,
): void {
  const castShadow = light.shadow?.castShadow ?? light.id === primaryLightId;
  threeLight.castShadow = castShadow;
  if (!castShadow) {
    return;
  }

  const [minMapSize, maxMapSize] = EDITOR_DEFAULTS.shadow.mapSizeClamp;
  const mapSize = MathUtils.clamp(
    light.shadow?.mapSize ?? shadows.mapSize,
    minMapSize,
    maxMapSize,
  );
  threeLight.shadow.mapSize.set(mapSize, mapSize);
  threeLight.shadow.bias = light.shadow?.bias ?? shadows.bias;
  threeLight.shadow.normalBias = light.shadow?.normalBias ?? shadows.normalBias;
  threeLight.shadow.radius = light.shadow?.radius ?? shadows.radius;

  // 太阳灯阴影正交相机贴合场景包围球（不写死范围，由几何数据推导）
  if (threeLight instanceof DirectionalLight && options.sceneBounds) {
    fitDirectionalShadowCamera(threeLight, options.sceneBounds);
  }
}

/** 太阳灯阴影正交相机按场景包围球分级 */
function fitDirectionalShadowCamera(
  light: DirectionalLight,
  bounds: Box3,
): void {
  const sphere = bounds.getBoundingSphere(new Sphere());
  const radius = Math.max(sphere.radius, 1e-3);
  const camera = light.shadow.camera;
  camera.left = -radius;
  camera.right = radius;
  camera.top = radius;
  camera.bottom = -radius;
  const distance = Math.max(light.position.distanceTo(sphere.center), 1e-3);
  camera.near = Math.max(distance - radius, 1e-3);
  camera.far = distance + radius;
  camera.updateProjectionMatrix();
}
