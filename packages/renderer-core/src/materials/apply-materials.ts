import type { PbrOverride, SceneMaterial } from '@prism/scene-schema';
import {
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
} from 'three/webgpu';
import { installGlass } from './tsl/registry.ts';

/**
 * 材质覆盖：只按 match.names 精确匹配 GLB 材质名。
 * 铁律：禁止任何 name.includes / 正则 / 关键词启发式（AGENTS.md grep 自检）。
 * 自定义 TSL 材质（玻璃等）的 installer 在 ./tsl/ 下按类型注册分发。
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
 * （r185 实测），故借用 MeshStandardMaterial.copy 只拷贝标准字段，
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
      // 顺序固定：先 pbr 后 glass。玻璃 installer 写节点槽位（colorNode/iorNode），
      // 其法向入射标定以 pbr 覆盖后的 material.color 为基准；且节点槽位在
      // MeshPhysicalNodeMaterial 里优先于 pbr 写的经典标量槽——两者不互相覆盖。
      if (entry.pbr) {
        applyPbrOverride(material, entry.pbr);
      }
      if (entry.glass) {
        installGlass(material, entry.glass);
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
  // 体积/色散三字段（v1.1）：r185 WebGPU 下生效路径已验证——
  // StandardNodeLibrary.fromMaterial 枚举拷贝经典材质自有属性到
  // MeshPhysicalNodeMaterial，其 setup 用 materialDispersion /
  // materialAttenuation*（MaterialReferenceNode 每帧读 material 同名属性）。
  // 注意色散仅在 transmission > 0 时参与着色（PhysicalLightingModel 的
  // getIBLVolumeRefraction），attenuation 同理需 transmission/thickness。
  if (pbr.dispersion !== undefined) {
    material.dispersion = pbr.dispersion;
  }
  if (pbr.attenuationColor !== undefined) {
    material.attenuationColor.set(pbr.attenuationColor);
  }
  if (pbr.attenuationDistance !== undefined) {
    material.attenuationDistance = pbr.attenuationDistance;
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
