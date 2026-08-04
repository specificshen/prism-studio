import type {
  GlassOverride,
  PbrOverride,
  SceneMaterial,
} from '@prism/scene-schema';
import { float, mix, normalView, positionViewDirection, vec3 } from 'three/tsl';
import {
  Color,
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Node,
  type Object3D,
} from 'three/webgpu';

/**
 * 材质覆盖：只按 match.names 精确匹配 GLB 材质名。
 * 铁律：禁止任何 name.includes / 正则 / 关键词启发式（AGENTS.md grep 自检）。
 */

/** 单个材质覆盖条目的命中报告（0 个或多个 names 都要报告） */
export interface MaterialMatchReport {
  id: string;
  name: string;
  /** 实际命中 GLB 材质的 names */
  matchedNames: string[];
  /** 未命中的 names */
  unmatchedNames: string[];
  /** 应用了覆盖的去重材质实例数 */
  appliedMaterials: number;
}

export interface ApplyMaterialsResult {
  warnings: string[];
  entries: MaterialMatchReport[];
}

/**
 * GLB 经典材质在 WebGPU 下由 StandardNodeLibrary.fromMaterial 转换为
 * MeshPhysicalNodeMaterial，转换会拷贝材质自有属性——提前挂在经典材质上的
 * colorNode / iorNode 会被一并带过去（three r184 验证过的机制）。
 */
type PhysicalNodeCarrier = MeshPhysicalMaterial & {
  colorNode?: Node | null;
  iorNode?: Node | null;
};

/**
 * 材质名 → 引用槽位索引（只索引，不改动材质）。
 * 只有被覆盖命中的材质才会升级为 MeshPhysicalMaterial（最小侵入）。
 */
interface MaterialSlot {
  mesh: Mesh;
  /** material 为数组时的下标，单材质为 null */
  slot: number | null;
}

function indexMaterialsByName(root: Object3D): Map<string, MaterialSlot[]> {
  const byName = new Map<string, MaterialSlot[]>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    if (Array.isArray(object.material)) {
      object.material.forEach((material, slot) => {
        const bucket = byName.get(material.name);
        if (bucket) {
          bucket.push({ mesh: object, slot });
        } else {
          byName.set(material.name, [{ mesh: object, slot }]);
        }
      });
    } else {
      const bucket = byName.get(object.material.name);
      const entry = { mesh: object, slot: null };
      if (bucket) {
        bucket.push(entry);
      } else {
        byName.set(object.material.name, [entry]);
      }
    }
  });
  return byName;
}

/**
 * 把槽位上的材质升级为 MeshPhysicalMaterial（契约覆盖需要物理材质口径）。
 * 直接 physical.copy(standardMaterial) 会访问源材质没有的物理专属字段而抛错
 * （r184 实测），故借用 MeshStandardMaterial.copy 只拷贝标准字段，
 * 物理字段保持默认值。同一源材质只升级一次并共享。
 */
function ensurePhysicalMaterial(
  slot: MaterialSlot,
  upgraded: Map<string, MeshPhysicalMaterial>,
): MeshPhysicalMaterial {
  const current: Material =
    slot.slot === null
      ? (slot.mesh.material as Material)
      : (slot.mesh.material as Material[])[slot.slot];
  if (current instanceof MeshPhysicalMaterial) {
    return current;
  }
  let physical = upgraded.get(current.uuid);
  if (!physical) {
    physical = new MeshPhysicalMaterial();
    (
      MeshStandardMaterial.prototype.copy as (
        this: MeshPhysicalMaterial,
        source: Material,
      ) => void
    ).call(physical, current);
    upgraded.set(current.uuid, physical);
  }
  if (slot.slot === null) {
    slot.mesh.material = physical;
  } else {
    (slot.mesh.material as Material[])[slot.slot] = physical;
  }
  return physical;
}

/** 按 match.names 精确匹配并应用材质覆盖 */
export function applyMaterials(
  root: Object3D,
  materials: SceneMaterial[],
): ApplyMaterialsResult {
  if (materials.length === 0) {
    return { warnings: [], entries: [] };
  }
  const byName = indexMaterialsByName(root);
  const upgraded = new Map<string, MeshPhysicalMaterial>();
  const warnings: string[] = [];
  const entries: MaterialMatchReport[] = [];

  for (const entry of materials) {
    const matched = new Set<MeshPhysicalMaterial>();
    const matchedNames: string[] = [];
    const unmatchedNames: string[] = [];

    for (const name of entry.match.names) {
      const slots = byName.get(name);
      if (slots && slots.length > 0) {
        matchedNames.push(name);
        for (const slot of slots) {
          matched.add(ensurePhysicalMaterial(slot, upgraded));
        }
      } else {
        unmatchedNames.push(name);
      }
    }

    if (unmatchedNames.length > 0) {
      warnings.push(
        `材质覆盖 "${entry.name}"（${entry.id}）的 match.names 未命中 GLB 材质：[${unmatchedNames.join(', ')}]`,
      );
    }
    if (matched.size === 0) {
      warnings.push(
        `材质覆盖 "${entry.name}"（${entry.id}）没有命中任何 GLB 材质，本条覆盖未生效`,
      );
    }

    for (const material of matched) {
      if (entry.pbr) {
        applyPbrOverride(material, entry.pbr);
      }
      if (entry.glass) {
        installLayerWeightGlass(material, entry.glass);
      }
      material.needsUpdate = true;
    }

    entries.push({
      id: entry.id,
      name: entry.name,
      matchedNames,
      unmatchedNames,
      appliedMaterials: matched.size,
    });
  }

  return { warnings, entries };
}

/** pbr 白名单字段 → MeshPhysicalMaterial 属性（缺省字段沿用 GLB 原值） */
function applyPbrOverride(
  material: MeshPhysicalMaterial,
  pbr: PbrOverride,
): void {
  if (pbr.baseColor !== undefined) {
    material.color.set(pbr.baseColor);
  }
  if (pbr.opacity !== undefined) {
    material.opacity = pbr.opacity;
  }
  if (pbr.metalness !== undefined) {
    material.metalness = pbr.metalness;
  }
  if (pbr.roughness !== undefined) {
    material.roughness = pbr.roughness;
  }
  if (pbr.ior !== undefined) {
    material.ior = pbr.ior;
  }
  if (pbr.transmission !== undefined) {
    material.transmission = pbr.transmission;
  }
  if (pbr.thickness !== undefined) {
    material.thickness = pbr.thickness;
  }
  if (pbr.clearcoat !== undefined) {
    material.clearcoat = pbr.clearcoat;
  }
  if (pbr.clearcoatRoughness !== undefined) {
    material.clearcoatRoughness = pbr.clearcoatRoughness;
  }
  if (pbr.emissive !== undefined) {
    material.emissive.set(pbr.emissive);
  }
  if (pbr.emissiveIntensity !== undefined) {
    material.emissiveIntensity = pbr.emissiveIntensity;
  }
  if (pbr.alphaMode !== undefined) {
    material.transparent = pbr.alphaMode === 'blend';
  }
}

/**
 * Layer Weight 多层镀膜玻璃（移植自旧工程验证过的 TSL 菲涅尔复建，
 * 参数全部来自 glass.layers 数据）。
 *
 * 与旧实现的差异：旧配置把"层间混合比"（innerBlend/outerBlend）与层 IOR
 * 分开携带；契约的每层只有 ior + color，因此层间菲涅尔系数直接取该层
 * 自身的折射率作为边界 eta（物理含义：空气/镀膜边界的菲涅尔反射率）。
 * 单层时退化为恒等着色 + 按 IOR 推导的镜面反射率。
 */
function installLayerWeightGlass(
  material: MeshPhysicalMaterial,
  glass: GlassOverride,
): void {
  const layers = glass.layers;
  const layerColors = layers.map((layer) => new Color(layer.color));
  const toLinearVec3 = (color: Color) => vec3(color.r, color.g, color.b);

  // 视角余弦：法线与视线方向的点积
  const dotNV = normalView.dot(positionViewDirection);
  // 每层的菲涅尔系数（以该层 IOR 为边界 eta）
  const factors = layers.map((layer) =>
    dielectricFresnelNode(dotNV, layer.ior),
  );

  // 颜色图：从最内层向外逐层混合，mix(a, b, t) = a(1−t) + b·t
  let graphColor: Node<'vec3'> = toLinearVec3(layerColors[layers.length - 1]);
  for (let i = layers.length - 2; i >= 0; i--) {
    graphColor = mix(toLinearVec3(layerColors[i]), graphColor, factors[i]);
  }

  // 法向入射标定：让正视角的合成色等于 GLB 基础色，保留项目既有的曝光匹配，
  // 只恢复 Blender 的角度响应（旧工程同口径）
  const channelOf = (color: Color, channel: number) =>
    channel === 0 ? color.r : channel === 1 ? color.g : color.b;
  const normalGraph = [0, 1, 2].map((channel) => {
    let acc = channelOf(layerColors[layers.length - 1], channel);
    for (let i = layers.length - 2; i >= 0; i--) {
      const factor = dielectricFresnelScalar(1, layers[i].ior);
      acc = channelOf(layerColors[i], channel) * (1 - factor) + acc * factor;
    }
    return Math.max(acc, 1e-6);
  });
  const calibration = vec3(
    material.color.r / normalGraph[0],
    material.color.g / normalGraph[1],
    material.color.b / normalGraph[2],
  );
  const carrier = material as PhysicalNodeCarrier;
  carrier.colorNode = graphColor.mul(calibration);

  // 有效镜面反射率：各层 R0 按同样的菲涅尔系数混合，再反解出等效 IOR
  const r0Of = (ior: number) =>
    ((Math.max(ior, 1) - 1) / (Math.max(ior, 1) + 1)) ** 2;
  let effectiveR0: Node<'float'> = float(r0Of(layers[layers.length - 1].ior));
  for (let i = layers.length - 2; i >= 0; i--) {
    effectiveR0 = mix(r0Of(layers[i].ior), effectiveR0, factors[i]);
  }
  const sqrtR0 = effectiveR0.clamp(0, 0.98).sqrt();
  carrier.iorNode = sqrtR0.add(1).div(sqrtR0.oneMinus().max(0.01));

  material.userData.prismLayerWeightGlass = { layers };
  material.needsUpdate = true;
}

/**
 * 精确电介质菲涅尔（s + p 偏振平均），TSL 节点版。
 * eta = 入射侧/出射侧相对折射率（≥1）。
 */
function dielectricFresnelNode(
  cosine: Node<'float'>,
  eta: number,
): Node<'float'> {
  const safeEta = Math.max(eta, 1e-5);
  const cosI = cosine.abs().clamp(0, 1);
  const cosT = cosI
    .pow(2)
    .oneMinus()
    .div(safeEta * safeEta)
    .oneMinus()
    .max(0)
    .sqrt();
  const rs = cosI
    .mul(safeEta)
    .sub(cosT)
    .div(cosI.mul(safeEta).add(cosT))
    .pow(2);
  const rp = cosI
    .sub(cosT.mul(safeEta))
    .div(cosI.add(cosT.mul(safeEta)))
    .pow(2);
  return rs.add(rp).mul(0.5);
}

/** 精确电介质菲涅尔，标量版（法向入射标定用） */
function dielectricFresnelScalar(cosine: number, eta: number): number {
  const cosI = Math.min(Math.max(Math.abs(cosine), 0), 1);
  const safeEta = Math.max(eta, 1e-5);
  const cosT = Math.sqrt(
    Math.max(1 - (1 - cosI * cosI) / (safeEta * safeEta), 0),
  );
  const rsDenominator = Math.max(safeEta * cosI + cosT, 1e-6);
  const rpDenominator = Math.max(cosI + safeEta * cosT, 1e-6);
  const rs = ((safeEta * cosI - cosT) / rsDenominator) ** 2;
  const rp = ((cosI - safeEta * cosT) / rpDenominator) ** 2;
  return (rs + rp) * 0.5;
}
