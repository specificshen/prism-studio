import type {
  RendererShadows,
  SceneCamera,
  SceneEnvironment,
  SceneLight,
  ScenePackage,
  ScenePost,
  SceneRenderer,
} from '@prism/scene-schema';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import {
  Box3,
  Color,
  DirectionalLight,
  type Material,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  PointLight,
  Scene,
  SpotLight,
  type Texture,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import {
  applyBlenderCamera,
  getBlenderCameraVerticalFov,
} from '../convert/camera.ts';
import {
  applyEnvironment,
  type EnvironmentHandle,
} from '../environment/apply-environment.ts';
import {
  applyLighting,
  type LightingResult,
} from '../lighting/apply-lighting.ts';
import { bootstrapShadowWarmup } from '../lighting/shadow-bootstrap.ts';
import { applyMaterials } from '../materials/apply-materials.ts';
import { applyObjects } from '../materials/apply-objects.ts';
import {
  createPostPipeline,
  type PostPipeline,
} from '../pipeline/post-pipeline.ts';
import {
  installDebugHandle,
  type PrismDebugHandle,
  uninstallDebugHandle,
} from './debug.ts';
import { WebGpuUnsupportedError } from './errors.ts';
import { EDITOR_DEFAULTS } from './presets.ts';

export interface LoadPackageOptions {
  /** 场景包内相对 url 的解析基准 */
  baseUrl?: string;
}

export interface LoadPackageResult {
  /** 材质/对象未命中等运行时告警（编辑器面板展示） */
  warnings: string[];
}

/**
 * PrismRenderer：Blender → Three.js WebGPU 场景渲染核。
 *
 * 用法：PrismRenderer.create(canvas) → loadPackage(pkg, gltf) →
 * 编辑器面板分区 update → dispose()。
 */
export class PrismRenderer {
  /** Three 场景（只读，调试用） */
  readonly scene: Scene;
  /** 主相机（只读，调试用） */
  readonly camera: PerspectiveCamera;
  /** three WebGPURenderer（只读，调试用） */
  readonly threeRenderer: WebGPURenderer;
  /** 当前场景包（未加载时为 null） */
  get package(): ScenePackage | null {
    return this.currentPackage;
  }

  private readonly canvas: HTMLCanvasElement;
  private readonly orbit: OrbitControls;
  private transformControls: TransformControls | null = null;
  private transformHelper: Object3D | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly debugHandle: PrismDebugHandle;

  private currentPackage: ScenePackage | null = null;
  private baseUrl: string | undefined;
  private modelRoot: Object3D | null = null;
  private modelBounds: Box3 | null = null;
  private environmentHandle: EnvironmentHandle | null = null;
  private lighting: LightingResult | null = null;
  private pipeline: PostPipeline | null = null;
  private activeSceneCamera: SceneCamera | null = null;
  /** 空场景兜底太阳灯（加载场景包后移除） */
  private defaultSun: DirectionalLight | null = null;
  private disposed = false;

  private constructor(canvas: HTMLCanvasElement, renderer: WebGPURenderer) {
    this.canvas = canvas;
    this.threeRenderer = renderer;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
      EDITOR_DEFAULTS.camera.fov,
      1,
      EDITOR_DEFAULTS.camera.near,
      EDITOR_DEFAULTS.camera.far,
    );
    this.applyEditorFallbackCamera();

    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = EDITOR_DEFAULTS.orbit.enableDamping;
    this.orbit.dampingFactor = EDITOR_DEFAULTS.orbit.dampingFactor;
    this.orbit.target.set(...EDITOR_DEFAULTS.camera.target);
    this.orbit.update();

    this.installEmptySceneDefaults();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
    this.resize();

    this.debugHandle = installDebugHandle(this);

    // 渲染循环：orbit 阻尼更新 +（有管线走管线，否则直渲）
    renderer.setAnimationLoop(() => {
      this.renderFrame();
    });
  }

  /** 创建渲染核：浏览器不支持 WebGPU 时抛 WebGpuUnsupportedError（中文提示） */
  static async create(canvas: HTMLCanvasElement): Promise<PrismRenderer> {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      throw new WebGpuUnsupportedError();
    }
    const renderer = new WebGPURenderer({
      canvas,
      antialias: EDITOR_DEFAULTS.renderer.antialias,
    });
    await renderer.init();
    const pixelRatio =
      typeof window === 'undefined'
        ? 1
        : Math.min(
            window.devicePixelRatio || 1,
            EDITOR_DEFAULTS.renderer.maxPixelRatio,
          );
    renderer.setPixelRatio(pixelRatio);
    return new PrismRenderer(canvas, renderer);
  }

  /**
   * 加载场景包：清旧场景（dispose 几何/材质）→ 加 GLB →
   * 环境/灯光/材质/对象 → 相机 → 阴影预热 → 后期管线。
   */
  async loadPackage(
    pkg: ScenePackage,
    gltf: GLTF,
    options: LoadPackageOptions = {},
  ): Promise<LoadPackageResult> {
    this.assertAlive();
    const warnings: string[] = [];
    this.clearContent();
    this.currentPackage = pkg;
    this.baseUrl = options.baseUrl;

    // 1. GLB 场景（几何已由导出器完成坐标换算，直接挂入）
    this.modelRoot = gltf.scene;
    this.scene.add(this.modelRoot);
    this.modelBounds = new Box3().setFromObject(this.modelRoot);

    // 2. 环境（HDRI 为异步加载）
    this.environmentHandle = await applyEnvironment(
      this.scene,
      pkg.environment,
      {
        baseUrl: options.baseUrl,
      },
    );
    warnings.push(...this.environmentHandle.warnings);

    // 3. 灯光（含阴影规则与太阳灯阴影相机贴合）
    this.lighting = applyLighting(
      this.scene,
      pkg.lights,
      pkg.renderer.shadows,
      {
        sceneBounds: this.modelBounds,
      },
    );
    warnings.push(...this.lighting.warnings);

    // 4. 材质与对象覆盖（match.names 精确匹配，未命中收集 warning）
    warnings.push(...applyMaterials(this.modelRoot, pkg.materials).warnings);
    warnings.push(...applyObjects(this.modelRoot, pkg.objects).warnings);

    // 5. 相机：isDefault 或第一个，无相机用 EDITOR_DEFAULTS 兜底视角
    const sceneCamera =
      pkg.cameras.find((camera) => camera.isDefault) ?? pkg.cameras[0];
    if (sceneCamera) {
      this.activeSceneCamera = sceneCamera;
      applyBlenderCamera(this.camera, sceneCamera, this.camera.aspect);
    } else {
      this.activeSceneCamera = null;
      this.applyEditorFallbackCamera();
    }
    this.updateOrbitTarget();

    // 6. 阴影总开关 + 预热（先编译出阴影路径，再建后期管线，时序见 bootstrap 注释）
    this.threeRenderer.shadowMap.enabled = this.lighting.hasShadowCaster;
    if (this.lighting.hasShadowCaster) {
      bootstrapShadowWarmup(this.threeRenderer, this.scene, this.camera);
    }

    // 7. 后期管线（tone mapping 在管线内随 renderer 节应用）
    this.pipeline = createPostPipeline(
      this.threeRenderer,
      this.scene,
      this.camera,
      pkg.post,
      pkg.renderer,
    );

    return { warnings };
  }

  /** 分区更新：环境（HDRI 重新加载，fog/天空即时生效） */
  async updateEnvironment(environment: SceneEnvironment): Promise<void> {
    this.assertAlive();
    if (this.currentPackage) {
      this.currentPackage.environment = environment;
    }
    this.environmentHandle?.dispose();
    this.environmentHandle = await applyEnvironment(this.scene, environment, {
      baseUrl: this.baseUrl,
    });
  }

  /** 分区更新：灯光（整组重建，阴影开关变化时重新预热） */
  updateLighting(
    lights: SceneLight[],
    shadows: RendererShadows,
  ): { warnings: string[] } {
    this.assertAlive();
    if (this.currentPackage) {
      this.currentPackage.lights = lights;
      this.currentPackage.renderer.shadows = shadows;
    }
    this.removeLightingNodes();
    this.lighting = applyLighting(this.scene, lights, shadows, {
      sceneBounds: this.modelBounds ?? undefined,
    });
    this.threeRenderer.shadowMap.enabled = this.lighting.hasShadowCaster;
    if (this.lighting.hasShadowCaster) {
      bootstrapShadowWarmup(this.threeRenderer, this.scene, this.camera);
    }
    return { warnings: this.lighting.warnings };
  }

  /** 分区更新：后期（增量装配输出链，不整链重建） */
  updatePost(post: ScenePost): void {
    this.assertAlive();
    if (this.currentPackage) {
      this.currentPackage.post = post;
    }
    this.pipeline?.updatePost(post);
  }

  /** 分区更新：renderer 节（tone mapping / 色彩分级） */
  updateRendererSection(rendererSection: SceneRenderer): void {
    this.assertAlive();
    if (this.currentPackage) {
      this.currentPackage.renderer = rendererSection;
    }
    this.pipeline?.updateRendererSection(rendererSection);
  }

  /** 切换相机：按 id 从当前场景包取，返回是否切换成功 */
  updateCamera(cameraId: string): boolean {
    this.assertAlive();
    const sceneCamera = this.currentPackage?.cameras.find(
      (camera) => camera.id === cameraId,
    );
    if (!sceneCamera) {
      return false;
    }
    this.activeSceneCamera = sceneCamera;
    applyBlenderCamera(this.camera, sceneCamera, this.camera.aspect);
    this.updateOrbitTarget();
    return true;
  }

  /** 开关 OrbitControls（TransformControls 拖动时自动禁用，也可手动调） */
  setOrbitEnabled(enabled: boolean): void {
    this.orbit.enabled = enabled;
  }

  /** 挂/摘对象变换 gizmo（拖动期间自动禁 orbit） */
  setObjectTransformGizmo(target: Object3D | null): void {
    this.assertAlive();
    if (target) {
      if (!this.transformControls) {
        this.transformControls = new TransformControls(
          this.camera,
          this.canvas,
        );
        this.transformControls.addEventListener('dragging-changed', (event) => {
          this.orbit.enabled = !event.value;
        });
      }
      this.transformControls.attach(target);
      if (!this.transformHelper) {
        this.transformHelper = this.transformControls.getHelper();
      }
      this.scene.add(this.transformHelper);
    } else {
      this.transformControls?.detach();
      this.transformHelper?.removeFromParent();
    }
  }

  /** 视口尺寸同步（ResizeObserver 自动调用，也可手动调） */
  resize(): void {
    if (this.disposed) {
      return;
    }
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    if (width === 0 || height === 0) {
      return;
    }
    this.threeRenderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    if (this.activeSceneCamera) {
      // Blender 相机 FOV 依赖画幅（sensorFit 逻辑），resize 时按当前 aspect 重算
      this.camera.fov = getBlenderCameraVerticalFov(
        this.activeSceneCamera,
        this.camera.aspect,
      );
    }
    this.camera.updateProjectionMatrix();
  }

  /** 视觉回归截图：渲染一帧后导出 PNG Blob */
  async captureFrame(): Promise<Blob> {
    this.assertAlive();
    this.renderFrame();
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('captureFrame 失败：canvas.toBlob 返回 null'));
        }
      }, 'image/png');
    });
  }

  /** 完整释放：循环、控件、管线、场景资源、渲染器、调试句柄 */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.threeRenderer.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.transformControls?.detach();
    this.transformControls?.dispose();
    this.transformControls = null;
    this.transformHelper?.removeFromParent();
    this.transformHelper = null;
    this.orbit.dispose();
    this.clearContent();
    this.removeEmptySceneDefaults();
    this.threeRenderer.dispose();
    uninstallDebugHandle(this.debugHandle);
  }

  // ---------------------------------------------------------------- private

  private renderFrame(): void {
    if (this.disposed) {
      return;
    }
    this.orbit.update();
    if (this.pipeline) {
      this.pipeline.render();
    } else {
      this.threeRenderer.render(this.scene, this.camera);
    }
  }

  /** 编辑器兜底视角（无相机数据时） */
  private applyEditorFallbackCamera(): void {
    this.camera.position.set(...EDITOR_DEFAULTS.camera.position);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(...EDITOR_DEFAULTS.camera.target);
    this.camera.fov = EDITOR_DEFAULTS.camera.fov;
    this.camera.near = EDITOR_DEFAULTS.camera.near;
    this.camera.far = EDITOR_DEFAULTS.camera.far;
    this.camera.updateProjectionMatrix();
  }

  /** orbit 注视点：沿相机前向取到场景包围盒中心的距离，保持 Blender 取景 */
  private updateOrbitTarget(): void {
    const forward = new Vector3(0, 0, -1).applyQuaternion(
      this.camera.quaternion,
    );
    const pivot =
      this.modelBounds && !this.modelBounds.isEmpty()
        ? this.modelBounds.getCenter(new Vector3())
        : new Vector3(...EDITOR_DEFAULTS.camera.target);
    const distance = Math.max(pivot.distanceTo(this.camera.position), 1e-3);
    this.orbit.target
      .copy(this.camera.position)
      .addScaledVector(forward, distance);
    this.orbit.update();
  }

  /** 空场景兜底：中性灰背景 + 默认太阳灯（加载场景包后移除） */
  private installEmptySceneDefaults(): void {
    this.scene.background = new Color(
      EDITOR_DEFAULTS.emptyScene.backgroundColor,
    );
    this.defaultSun = new DirectionalLight(
      EDITOR_DEFAULTS.emptyScene.sun.color,
      EDITOR_DEFAULTS.emptyScene.sun.intensity,
    );
    this.defaultSun.position.set(...EDITOR_DEFAULTS.emptyScene.sun.position);
    this.scene.add(this.defaultSun);
  }

  private removeEmptySceneDefaults(): void {
    if (this.defaultSun) {
      this.defaultSun.removeFromParent();
      this.defaultSun = null;
    }
    if (this.scene.background instanceof Color) {
      this.scene.background = null;
    }
  }

  /** 清空已加载内容（管线/环境/灯光/模型），保留编辑器兜底状态 */
  private clearContent(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
    this.environmentHandle?.dispose();
    this.environmentHandle = null;
    this.removeLightingNodes();
    if (this.modelRoot) {
      this.modelRoot.removeFromParent();
      disposeSceneGraph(this.modelRoot);
      this.modelRoot = null;
    }
    this.modelBounds = null;
    this.activeSceneCamera = null;
    this.removeEmptySceneDefaults();
  }

  private removeLightingNodes(): void {
    if (!this.lighting) {
      return;
    }
    for (const node of this.lighting.lightNodes) {
      node.traverse((object) => {
        if (
          object instanceof DirectionalLight ||
          object instanceof PointLight ||
          object instanceof SpotLight
        ) {
          object.shadow.map?.dispose();
        }
      });
      node.removeFromParent();
    }
    this.lighting = null;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error('PrismRenderer 已 dispose，不能继续使用');
    }
  }
}

/** 递归释放场景图中的几何体、材质与贴图 */
function disposeSceneGraph(root: Object3D): void {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      const meshMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of meshMaterials) {
        materials.add(material);
      }
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value && (value as Texture).isTexture) {
        textures.add(value as Texture);
      }
    }
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
  }
}
