import type { SceneObject } from '@prism/scene-schema';
import type { Object3D } from 'three/webgpu';

/**
 * 对象级覆盖：visible / castShadow / receiveShadow。
 * 与材质同一条铁律：只按 match.names 精确匹配 GLB 节点名，禁止名称启发式。
 */

/** 单个对象覆盖条目的命中报告（0 个或多个 names 都要报告） */
export interface ObjectMatchReport {
  id: string;
  name: string;
  /** 实际命中 GLB 节点的 names */
  matchedNames: string[];
  /** 未命中的 names */
  unmatchedNames: string[];
  /** 应用了覆盖的节点数（同名节点可能有多个） */
  appliedNodes: number;
}

export interface ApplyObjectsResult {
  warnings: string[];
  entries: ObjectMatchReport[];
}

/** 按 match.names 精确匹配并应用对象覆盖 */
export function applyObjects(
  root: Object3D,
  objects: SceneObject[],
): ApplyObjectsResult {
  if (objects.length === 0) {
    return { warnings: [], entries: [] };
  }
  const byName = new Map<string, Object3D[]>();
  root.traverse((object) => {
    if (!object.name) {
      return;
    }
    const bucket = byName.get(object.name);
    if (bucket) {
      bucket.push(object);
    } else {
      byName.set(object.name, [object]);
    }
  });

  const warnings: string[] = [];
  const entries: ObjectMatchReport[] = [];

  for (const entry of objects) {
    const matchedNodes: Object3D[] = [];
    const matchedNames: string[] = [];
    const unmatchedNames: string[] = [];

    for (const name of entry.match.names) {
      const bucket = byName.get(name);
      if (bucket && bucket.length > 0) {
        matchedNames.push(name);
        matchedNodes.push(...bucket);
      } else {
        unmatchedNames.push(name);
      }
    }

    if (unmatchedNames.length > 0) {
      warnings.push(
        `对象覆盖 "${entry.name}"（${entry.id}）的 match.names 未命中 GLB 节点：[${unmatchedNames.join(', ')}]`,
      );
    }
    if (matchedNodes.length === 0) {
      warnings.push(
        `对象覆盖 "${entry.name}"（${entry.id}）没有命中任何 GLB 节点，本条覆盖未生效`,
      );
    }

    for (const node of matchedNodes) {
      if (entry.visible !== undefined) {
        node.visible = entry.visible;
      }
      if (entry.castShadow !== undefined) {
        node.castShadow = entry.castShadow;
      }
      if (entry.receiveShadow !== undefined) {
        node.receiveShadow = entry.receiveShadow;
      }
    }

    entries.push({
      id: entry.id,
      name: entry.name,
      matchedNames,
      unmatchedNames,
      appliedNodes: matchedNodes.length,
    });
  }

  return { warnings, entries };
}
