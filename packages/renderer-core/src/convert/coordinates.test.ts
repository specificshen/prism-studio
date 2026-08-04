import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  blenderMatrixForwardToThree,
  blenderMatrixToThree,
  blenderRotationToThree,
  blenderVectorToThree,
  threeMatrixToBlender,
} from './coordinates.ts';

/** 测试辅助：由弧度欧拉角（XYZ）构造四元数 */
function quaternionFromEuler(x: number, y: number, z: number): Quaternion {
  return new Quaternion().setFromEuler(new Euler(x, y, z, 'XYZ'));
}

/** 测试辅助：Blender 世界向量按 (x,y,z) → (x,z,−y) 换算 */
function convertWorldVector(v: Vector3): Vector3 {
  return new Vector3(
    ...blenderVectorToThree(v.toArray() as [number, number, number]),
  );
}

describe('blenderVectorToThree', () => {
  it('按 (x,y,z) → (x,z,−y) 换算', () => {
    expect(blenderVectorToThree([1, 2, 3])).toEqual([1, 3, -2]);
    expect(blenderVectorToThree([-1.5, 0.25, 8])).toEqual([-1.5, 8, -0.25]);
  });
});

describe('blenderMatrixToThree', () => {
  it('提取平移：Blender (1,2,3) → Three (1,3,−2)', () => {
    const blender = new Matrix4().makeTranslation(1, 2, 3);
    const three = blenderMatrixToThree(blender.toArray());
    const position = new Vector3().setFromMatrixPosition(three);
    expect(position.x).toBeCloseTo(1, 10);
    expect(position.y).toBeCloseTo(3, 10);
    expect(position.z).toBeCloseTo(-2, 10);
  });

  it('语义局部系不变式：W_T·p = C·(W_B·p)（旋转+平移复合）', () => {
    // 局部坐标 p 是语义量（如相机前方 5 米 (0,0,-5)），不参与换算；
    // 换算后的矩阵作用在 p 上，必须等于 Blender 侧结果的世界向量换算
    const blender = new Matrix4().compose(
      new Vector3(1, 2, 3),
      quaternionFromEuler(0.3, -0.5, 1.2),
      new Vector3(1, 1, 1),
    );
    const three = blenderMatrixToThree(blender.toArray());
    const local = new Vector3(0, 0, -5);
    const viaThree = local.clone().applyMatrix4(three);
    const viaBlender = convertWorldVector(local.clone().applyMatrix4(blender));
    expect(viaThree.x).toBeCloseTo(viaBlender.x, 10);
    expect(viaThree.y).toBeCloseTo(viaBlender.y, 10);
    expect(viaThree.z).toBeCloseTo(viaBlender.z, 10);
  });

  it('绕 Blender 竖直轴 Z 转 +90° 的向下看相机，Three 侧仍然向下看', () => {
    // 反共轭案例：若错误地做共轭 C·W·Cᵀ，前向会变成水平的 (-1,0,0)
    const blender = new Matrix4().makeRotationZ(Math.PI / 2);
    const forward = blenderMatrixForwardToThree(blender.toArray());
    expect(forward.x).toBeCloseTo(0, 10);
    expect(forward.y).toBeCloseTo(-1, 10);
    expect(forward.z).toBeCloseTo(0, 10);
  });

  it('threeMatrixToBlender 是 blenderMatrixToThree 的逆（往返）', () => {
    const blender = new Matrix4().compose(
      new Vector3(-2, 5, 0.5),
      quaternionFromEuler(0.7, 0.2, -1.1),
      new Vector3(1, 1, 1),
    );
    const roundTrip = threeMatrixToBlender(
      blenderMatrixToThree(blender.toArray()),
    );
    const a = blender.toArray();
    for (let i = 0; i < 16; i++) {
      expect(roundTrip[i]).toBeCloseTo(a[i], 10);
    }
  });

  it('拒绝非 16 长度输入', () => {
    expect(() => blenderMatrixToThree([1, 2, 3])).toThrow();
  });
});

describe('blenderRotationToThree', () => {
  it('绕 Blender X +90° → Three 恒等（C 本身即 Rx(−90°)，恰好抵消）', () => {
    const euler = blenderRotationToThree([90, 0, 0]);
    expect(euler.x).toBeCloseTo(0, 10);
    expect(euler.y).toBeCloseTo(0, 10);
    expect(euler.z).toBeCloseTo(0, 10);
  });

  it('绕 Blender Z +90° → Three 欧拉 (−90°, 0, +90°)', () => {
    // 物理含义：向下看的相机绕竖直轴转 90°，Three 侧依旧向下看、上方向转到 -X
    const euler = blenderRotationToThree([0, 0, 90]);
    expect(euler.x).toBeCloseTo(MathUtils.degToRad(-90), 10);
    expect(euler.y).toBeCloseTo(0, 10);
    expect(euler.z).toBeCloseTo(MathUtils.degToRad(90), 10);
  });

  it('任意欧拉角与矩阵换算路径一致', () => {
    const deg: [number, number, number] = [25, -40, 130];
    const euler = blenderRotationToThree(deg);
    const local = new Vector3(0.3, -0.6, 0.8);
    const viaEuler = local.clone().applyEuler(euler);
    const blenderMatrix = new Matrix4().makeRotationFromEuler(
      new Euler(
        MathUtils.degToRad(deg[0]),
        MathUtils.degToRad(deg[1]),
        MathUtils.degToRad(deg[2]),
        'XYZ',
      ),
    );
    const viaMatrix = convertWorldVector(
      local.clone().applyMatrix4(blenderMatrix),
    );
    expect(viaEuler.x).toBeCloseTo(viaMatrix.x, 10);
    expect(viaEuler.y).toBeCloseTo(viaMatrix.y, 10);
    expect(viaEuler.z).toBeCloseTo(viaMatrix.z, 10);
  });
});

describe('blenderMatrixForwardToThree', () => {
  it('单位矩阵的 -Z 前向 → Three (0,-1,0)（Blender 默认相机/灯光竖直向下）', () => {
    const forward = blenderMatrixForwardToThree(new Matrix4().toArray());
    expect(forward.x).toBeCloseTo(0, 10);
    expect(forward.y).toBeCloseTo(-1, 10);
    expect(forward.z).toBeCloseTo(0, 10);
  });

  it('绕 Blender X 转 180° 后前向 → Three (0,1,0)', () => {
    const blender = new Matrix4().makeRotationX(Math.PI);
    const forward = blenderMatrixForwardToThree(blender.toArray());
    expect(forward.x).toBeCloseTo(0, 10);
    expect(forward.y).toBeCloseTo(1, 10);
    expect(forward.z).toBeCloseTo(0, 10);
  });
});
