import { Euler, MathUtils, Matrix4, Vector3 } from 'three/webgpu';

/**
 * Blender → Three 坐标换算（本包唯一允许做坐标换算的地方）。
 *
 * 背景：数据侧（.prism.json）永远保持 Blender 坐标系（Z-up、右手系）；
 * GLB 由 Blender 官方 glTF 导出器产出，几何与节点变换已被改写为 glTF 约定
 * （Y-up、右手系），因此 GLB 场景树不需要任何换算。需要换算的只有
 * .prism.json 里相机/灯光的世界矩阵与欧拉角。
 *
 * 基变换矩阵（Blender 的 glTF 导出映射 (x, y, z)_B → (x, z, −y)_T）：
 *
 *        ⎡ 1  0  0 ⎤
 *   C =  ⎢ 0  0  1 ⎥
 *        ⎣ 0 −1  0 ⎦
 *
 * det(C) = +1，是真旋转（不改变手性），且 C 正交，C⁻¹ = Cᵀ。
 *
 * 为什么是左乘 C·W_B 而不是共轭 C·W_B·Cᵀ：
 * 契约里的矩阵属于"语义局部系"对象——Blender 相机看向本地 -Z、上方向 +Y，
 * 灯光沿本地 -Z 照射；Three 的相机/灯光使用完全相同的局部系约定。
 * 局部坐标是语义量（"(0,0,-1) 永远表示正前方"），不参与坐标系换算，
 * 需要换的只有世界基。设世界向量换算 p_T = C·p_B，世界矩阵 W_B 把局部
 * 坐标映到 Blender 世界，则等价的 Three 矩阵 W_T 满足：
 *
 *   W_T·p = C·(W_B·p)   对任意局部坐标 p 成立   ⟹   W_T = C·W_B
 *
 * 共轭 C·W·Cᵀ 适用于"局部系也被一起换算"的情形——glTF 导出器对几何节点
 * 正是这么做的（节点矩阵共轭、顶点数据同样共轭），所以 GLB 到手即用。
 * 若对相机/灯光也共轭，等价于多转了一次局部系：Blender 里绕竖直轴 Z 转
 * 90° 的向下看的相机，共轭后会错误地变成水平看（本包测试覆盖该案例）。
 */

/** Blender → Three 的 4×4 齐次基变换矩阵（上文的 C） */
const BLENDER_TO_THREE_MATRIX = /* @__PURE__ */ new Matrix4().set(
  1,
  0,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  -1,
  0,
  0,
  0,
  0,
  0,
  1,
);

/** C 正交，逆即转置 */
const THREE_TO_BLENDER_MATRIX =
  /* @__PURE__ */ BLENDER_TO_THREE_MATRIX.clone().transpose();

/**
 * Blender 向量 → Three 向量：(x, y, z) → (x, z, −y)。
 * 适用于位置、方向等所有世界空间三维量。
 */
export function blenderVectorToThree(
  value: readonly [number, number, number],
): [number, number, number] {
  return [value[0], value[2], -value[1]];
}

/**
 * Blender 世界矩阵（16 个数，列主序，Blender 坐标系）→ THREE.Matrix4（Three 世界）。
 * 做左乘基变换 W_T = C·W_B（推导见文件头注释），适用于相机/灯光等
 * 语义局部系对象的契约变换。
 */
export function blenderMatrixToThree(m16: readonly number[]): Matrix4 {
  if (m16.length !== 16) {
    throw new Error(
      `blenderMatrixToThree 需要 16 个数字（列主序 4×4），实际收到 ${m16.length} 个`,
    );
  }
  const worldBlender = new Matrix4().fromArray(m16);
  return new Matrix4().multiplyMatrices(BLENDER_TO_THREE_MATRIX, worldBlender);
}

/**
 * Three 世界矩阵 → Blender 世界矩阵（列主序 16 数组），blenderMatrixToThree 的逆。
 * 编辑器把 gizmo 拖出的新变换写回场景文档时使用。
 */
export function threeMatrixToBlender(matrix: Matrix4): number[] {
  const worldBlender = new Matrix4().multiplyMatrices(
    THREE_TO_BLENDER_MATRIX,
    matrix,
  );
  return worldBlender.toArray();
}

/**
 * Blender 欧拉角（XYZ 顺序，单位为度）→ Three 欧拉角（XYZ 顺序，单位为弧度）。
 * 欧拉分量不能简单换序：先构造旋转矩阵 R_B，再做基变换 R_T = C·R_B，
 * 最后以相同顺序解出欧拉角。
 */
export function blenderRotationToThree(
  rotationDeg: readonly [number, number, number],
): Euler {
  const rotationBlender = new Matrix4().makeRotationFromEuler(
    new Euler(
      MathUtils.degToRad(rotationDeg[0]),
      MathUtils.degToRad(rotationDeg[1]),
      MathUtils.degToRad(rotationDeg[2]),
      'XYZ',
    ),
  );
  const rotationThree = new Matrix4().multiplyMatrices(
    BLENDER_TO_THREE_MATRIX,
    rotationBlender,
  );
  return new Euler().setFromRotationMatrix(rotationThree, 'XYZ');
}

/**
 * 从 Blender 世界矩阵提取前向：本地 -Z 轴（相机看向 / 灯光照射方向）
 * 在 Three 世界的单位向量。
 */
export function blenderMatrixForwardToThree(m16: readonly number[]): Vector3 {
  const matrix = blenderMatrixToThree(m16);
  // 列主序元素 8/9/10 为局部 Z 轴在世界中的方向，取反即 -Z 前向
  const e = matrix.elements;
  return new Vector3(-e[8], -e[9], -e[10]).normalize();
}
