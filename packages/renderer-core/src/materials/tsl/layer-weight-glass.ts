import type { GlassOverride } from '@prism/scene-schema';
import { float, mix, normalView, positionViewDirection, vec3 } from 'three/tsl';
import { Color, type MeshPhysicalMaterial, type Node } from 'three/webgpu';
import { dielectricFresnelNode, dielectricFresnelScalar } from './fresnel.ts';

/**
 * GLB 经典材质在 WebGPU 下由 StandardNodeLibrary.fromMaterial 转换为
 * MeshPhysicalNodeMaterial，转换会拷贝材质自有属性——提前挂在经典材质上的
 * colorNode / iorNode 会被一并带过去（three r185 验证过的机制）。
 */
type PhysicalNodeCarrier = MeshPhysicalMaterial & {
  colorNode?: Node | null;
  iorNode?: Node | null;
};

/**
 * Layer Weight 多层镀膜玻璃（移植自旧工程验证过的 TSL 菲涅尔复建，
 * 参数全部来自 glass.layers 数据）。
 *
 * 与旧实现的差异：旧配置把"层间混合比"（innerBlend/outerBlend）与层 IOR
 * 分开携带；契约的每层只有 ior + color，因此层间菲涅尔系数直接取该层
 * 自身的折射率作为边界 eta（物理含义：空气/镀膜边界的菲涅尔反射率）。
 * 单层时退化为恒等着色 + 按 IOR 推导的镜面反射率。
 */
export function installLayerWeightGlass(
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
