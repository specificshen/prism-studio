import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  PlaneGeometry,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';

/**
 * 阴影 bootstrap（移植自旧工程验证过的时序处理）。
 *
 * WebGPURenderer 只在"首帧同时存在投影者与接收者"时才为灯光创建 ShadowNode；
 * 若首帧没有任何投影者对，接收者材质会按无阴影编译并缓存，
 * 之后出现的模型就走不上阴影路径。因此建后期管线之前，
 * 先放一对临时投影/接收网格渲染一帧，把阴影路径编译出来，随后立即移除。
 *
 * 注意：这一对临时网格只存在于这一次同步渲染中，不进入任何正式帧，
 * 其尺寸/位置是引导编译的占位几何，不是视觉参数。
 */
export function bootstrapShadowWarmup(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
): void {
  const caster = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  caster.name = 'prism-shadow-bootstrap-caster';
  caster.position.set(0, 0.5, 0);
  caster.castShadow = true;
  caster.frustumCulled = false;

  const receiver = new Mesh(new PlaneGeometry(20, 20), new MeshBasicMaterial());
  receiver.name = 'prism-shadow-bootstrap-receiver';
  receiver.rotation.x = -Math.PI / 2;
  receiver.receiveShadow = true;
  receiver.frustumCulled = false;

  scene.add(caster, receiver);
  try {
    renderer.render(scene, camera);
  } finally {
    scene.remove(caster, receiver);
    caster.geometry.dispose();
    (caster.material as MeshBasicMaterial).dispose();
    receiver.geometry.dispose();
    (receiver.material as MeshBasicMaterial).dispose();
  }
}
