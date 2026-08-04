import type { GlassOverride } from '@prism/scene-schema';
import type { MeshPhysicalMaterial } from 'three/webgpu';
import { installLayerWeightGlass } from './layer-weight-glass.ts';

/**
 * 自定义 TSL 材质注册表：每种契约声明的玻璃类型对应一个 installer。
 * 新增自定义 TSL 材质（schema 判别联合新成员）在此注册即可被
 * apply-materials 接线，不必再改匹配逻辑。
 * 开发流程见 .agents/skills/tsl-material-authoring。
 */

/** 自定义 TSL 玻璃 installer 统一签名：把 glass 数据安装到物理材质上 */
export type TslGlassInstaller = (
  material: MeshPhysicalMaterial,
  config: GlassOverride,
) => void;

const glassInstallers: Record<GlassOverride['type'], TslGlassInstaller> = {
  'layer-weight': installLayerWeightGlass,
};

/**
 * 按 glass.type 分发安装。未知类型给中文 warning 而不抛错：
 * 契约可能先于渲染核演进，渲染核静默容错并显式提示，不出错误画面。
 */
export function installGlass(
  material: MeshPhysicalMaterial,
  glass: GlassOverride,
): void {
  const installer: TslGlassInstaller | undefined = glassInstallers[glass.type];
  if (!installer) {
    console.warn(
      `未知的玻璃类型 "${glass.type}"：渲染核没有对应的 TSL installer，本条 glass 覆盖未生效`,
    );
    return;
  }
  installer(material, glass);
}
