import type {
  ColorGrading,
  ScenePost,
  SceneRenderer,
} from '@prism/scene-schema';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import {
  luminance,
  mix,
  mrt,
  normalView,
  output,
  pass,
  saturation,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  MathUtils,
  NeutralToneMapping,
  type Node,
  type PassNode,
  type PerspectiveCamera,
  RenderPipeline,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import { EDITOR_DEFAULTS } from '../core/presets.ts';

/**
 * 后期管线：输出 pass →（可选 GTAO）→（可选 Bloom）→ 色彩分级 →
 * tone mapping / 色彩空间（RenderPipeline.outputColorTransform 统一处理）。
 *
 * 数据驱动：pass 按 post.*.enabled 装配，关了就不建（性能红线）；
 * 色彩分级参数在 renderer.colorGrading，tone mapping 在 renderer.toneMapping。
 * ssgi / ssr 是契约 reserved 字段，v1 不实现（enabled 时 console.info 提示一次）。
 */

/**
 * 色彩分级算子的定义常量（算子内部系数，非场景调参）：
 * - CONTRAST_PIVOT：18% 灰，摄影后期的标准中灰对比度锚点
 * - WHITE_BALANCE_SCALE：单位白平衡偏移对应的 R/B 通道增益系数
 * - HIGHLIGHT_GAIN / SHADOW_GAIN：分区调整的增益系数
 * 移植自旧工程验证过的分级实现，在此集中声明便于审计。
 */
const GRADING_CONTRAST_PIVOT = 0.18;
const GRADING_WHITE_BALANCE_SCALE = 0.12;
const GRADING_HIGHLIGHT_GAIN = 0.25;
const GRADING_SHADOW_GAIN = 0.18;

/** 高光的亮度分界（luminance 0.5 以上视为高光区）与过渡带宽 */
const GRADING_LUMA_MIDPOINT = 0.5;

export interface PostPipeline {
  /** 增量应用新的 post 配置（不整链重建，除非 AO 开关变化） */
  updatePost(post: ScenePost): void;
  /** 增量应用新的 renderer 配置（tone mapping / 色彩分级 / 阴影全局不变） */
  updateRendererSection(rendererSection: SceneRenderer): void;
  /** 渲染一帧（挂在 renderer.setAnimationLoop 里调用） */
  render(): void;
  dispose(): void;
}

const TONE_MAPPING_CONSTANTS = {
  AgX: AgXToneMapping,
  ACESFilmic: ACESFilmicToneMapping,
  Neutral: NeutralToneMapping,
} as const;

export function createPostPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  post: ScenePost,
  rendererSection: SceneRenderer,
): PostPipeline {
  const pipeline = new RenderPipeline(renderer);

  let currentPost = post;
  let currentRendererSection = rendererSection;
  /** AO 开启时需要 MRT（法线输出），与 AO 关闭时是两种 pass 结构 */
  let scenePass: PassNode | null = null;
  let aoBuilt = false;
  let ssgiNotified = false;
  let ssrNotified = false;

  const ensureScenePass = (needAo: boolean): PassNode => {
    if (scenePass && aoBuilt === needAo) {
      return scenePass;
    }
    scenePass?.dispose();
    scenePass = pass(scene, camera);
    if (needAo) {
      scenePass.setMRT(mrt({ output, normal: normalView }));
    }
    aoBuilt = needAo;
    return scenePass;
  };

  /** 按当前配置装配输出链（节点图拼装是廉价操作，不动场景材质） */
  const compose = (): void => {
    const aoConfig = currentPost.ao;
    const aoEnabled = aoConfig?.enabled === true;
    const activePass = ensureScenePass(aoEnabled);

    const sceneColor = activePass.getTextureNode('output');
    let chain: Node<'vec4'> = sceneColor;

    if (aoEnabled && aoConfig) {
      const gtao = ao(
        activePass.getTextureNode('depth'),
        activePass.getTextureNode('normal'),
        camera,
      );
      const [minScale, maxScale] =
        EDITOR_DEFAULTS.pipeline.aoResolutionScaleClamp;
      gtao.resolutionScale = MathUtils.clamp(
        aoConfig.resolutionScale,
        minScale,
        maxScale,
      );
      gtao.radius.value = aoConfig.radius;
      // GTAO 是随机采样：半分辨率结果直接合成会在亮部暴露对角噪纹，
      // 用紧凑十字四点滤波合成（旧工程验证过的去屏纹处理）
      const aoTexture = gtao.getTextureNode();
      const aoUv = uv();
      const aoTexel = vec2(1).div(gtao.resolution);
      const aoFiltered = aoTexture
        .sample(aoUv)
        .r.mul(4)
        .add(aoTexture.sample(aoUv.add(aoTexel.mul(vec2(1, 0)))).r)
        .add(aoTexture.sample(aoUv.add(aoTexel.mul(vec2(-1, 0)))).r)
        .add(aoTexture.sample(aoUv.add(aoTexel.mul(vec2(0, 1)))).r)
        .add(aoTexture.sample(aoUv.add(aoTexel.mul(vec2(0, -1)))).r)
        .div(8);
      const aoFactor = mix(1, aoFiltered, aoConfig.strength);
      chain = chain.mul(vec4(vec3(aoFactor), 1));
    }

    const bloomConfig = currentPost.bloom;
    if (bloomConfig?.enabled) {
      chain = chain.add(
        bloom(
          chain,
          bloomConfig.strength,
          bloomConfig.radius,
          bloomConfig.threshold,
        ),
      );
    }

    const grading = currentRendererSection.colorGrading;
    if (grading && !isGradingIdentity(grading)) {
      chain = applyColorGrading(chain, grading);
    }

    pipeline.outputNode = chain;
    pipeline.needsUpdate = true;
  };

  const applyToneMapping = (section: SceneRenderer): void => {
    renderer.toneMapping = TONE_MAPPING_CONSTANTS[section.toneMapping.type];
    // 曝光单位为档（stops）：+1 亮一倍，换算为线性倍率
    renderer.toneMappingExposure = 2 ** section.toneMapping.exposureStops;
  };

  const notifyReserved = (p: ScenePost): void => {
    if (p.ssgi?.enabled && !ssgiNotified) {
      console.info('[prism] ssgi 为 v1 保留字段，未实现');
      ssgiNotified = true;
    }
    if (p.ssr?.enabled && !ssrNotified) {
      console.info('[prism] ssr 为 v1 保留字段，未实现');
      ssrNotified = true;
    }
  };

  applyToneMapping(rendererSection);
  notifyReserved(post);
  compose();

  return {
    updatePost(next) {
      currentPost = next;
      notifyReserved(next);
      compose();
    },
    updateRendererSection(next) {
      currentRendererSection = next;
      applyToneMapping(next);
      compose();
    },
    render() {
      pipeline.render();
    },
    dispose() {
      scenePass?.dispose();
      scenePass = null;
      pipeline.dispose();
    },
  };
}

/** 分级是否恒等（全 0）：恒等就不建分级节点（性能红线） */
function isGradingIdentity(grading: ColorGrading): boolean {
  return (
    grading.contrast === 0 &&
    grading.saturation === 0 &&
    grading.whiteBalance === 0 &&
    grading.highlights === 0 &&
    grading.shadows === 0
  );
}

/** 色彩分级：饱和度 → 对比度 → 白平衡 → 高光/阴影分区（移植旧工程算子） */
function applyColorGrading(
  input: Node<'vec4'>,
  grading: ColorGrading,
): Node<'vec4'> {
  let graded = saturation(input.rgb, grading.saturation + 1);
  graded = graded
    .sub(GRADING_CONTRAST_PIVOT)
    .mul(grading.contrast + 1)
    .add(GRADING_CONTRAST_PIVOT);

  // 白平衡：正值偏暖（加红减蓝），负值偏冷
  const temperatureScale = vec3(
    1 + grading.whiteBalance * GRADING_WHITE_BALANCE_SCALE,
    1,
    1 - grading.whiteBalance * GRADING_WHITE_BALANCE_SCALE,
  );
  graded = graded.mul(temperatureScale);

  const luma = luminance(graded);
  const highlightMask = luma.sub(GRADING_LUMA_MIDPOINT).mul(2).clamp(0, 1);
  const shadowMask = luma.mul(-2).add(1).clamp(0, 1);
  graded = graded
    .add(highlightMask.mul(grading.highlights * GRADING_HIGHLIGHT_GAIN))
    .add(shadowMask.mul(grading.shadows * GRADING_SHADOW_GAIN))
    .max(0);

  return vec4(graded, input.a);
}
