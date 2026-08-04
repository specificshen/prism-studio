import { type ScenePackage, validateScenePackage } from '@prism/scene-schema';
import { ScenePackageValidationError } from '../core/errors.ts';

/**
 * 契约校验薄封装：任何输入（unknown）→ ScenePackage。
 * ok=false 时抛出携带人读 issues 的 ScenePackageValidationError，
 * 编辑器 catch 后在校验面板逐条展示给 ISV。
 */
export function parseScenePackage(input: unknown): ScenePackage {
  const result = validateScenePackage(input);
  if (!result.ok || !result.data) {
    throw new ScenePackageValidationError(result.issues);
  }
  return result.data;
}
