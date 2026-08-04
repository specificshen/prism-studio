import type { Node } from 'three/webgpu';

/**
 * 精确电介质菲涅尔（s + p 偏振平均），节点版与标量版同一套数学：
 * 节点版用于 TSL 材质图，标量版用于 CPU 侧标定计算。
 * 供 layer-weight 玻璃等自定义 TSL 材质复用。
 */

/**
 * 精确电介质菲涅尔（s + p 偏振平均），TSL 节点版。
 * eta = 入射侧/出射侧相对折射率（≥1）。
 */
export function dielectricFresnelNode(
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
export function dielectricFresnelScalar(cosine: number, eta: number): number {
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
