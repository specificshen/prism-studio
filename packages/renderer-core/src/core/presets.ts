/**
 * EDITOR_DEFAULTS：数据驱动铁律允许的第二类视觉参数来源。
 * 当场景包数据缺省时，渲染核只能用这里显式声明的兜底预设；
 * 每条都必须注释说明它兜底的是什么场景。想调效果请先改场景包数据。
 */
export const EDITOR_DEFAULTS = {
  /**
   * 编辑器相机兜底：场景包没有任何相机（cameras 为空）时的初始视角。
   * 仅供编辑器浏览，不参与交付渲染。
   */
  camera: {
    /** 视点位（Three 世界，米） */
    position: [12, 9, 12] as [number, number, number],
    /** 注视点 */
    target: [0, 0, 0] as [number, number, number],
    /** 垂直 FOV（度）：接近人眼自然视角的通用编辑器视角 */
    fov: 50,
    /** 近裁剪面（米） */
    near: 0.1,
    /** 远裁剪面（米）：覆盖中型建筑场景的通用兜底 */
    far: 1000,
  },

  /**
   * 空场景兜底：编辑器启动后、加载任何场景包之前，
   * 让用户能看到一个非黑的编辑环境。
   */
  emptyScene: {
    /** 中性灰背景：不干扰后续材质判色的低饱和灰 */
    backgroundColor: '#3a3f45',
    /** 兜底太阳灯：仅保证模型可辨认，加载场景包后立即移除 */
    sun: {
      color: '#ffffff',
      /** 无数据时的通用直射光强度（lux 量级） */
      intensity: 3,
      position: [10, 18, 8] as [number, number, number],
    },
  },

  /**
   * 阴影贴图边长硬限制（像素）：数据在契约层已建议 2048/4096，
   * 这里 clamp 到 [1024, 4096] 是渲染核的最后防线——
   * 低于 1024 阴影不可用地糊，高于 4096 显存随边长平方增长。
   */
  shadow: {
    mapSizeClamp: [1024, 4096] as [number, number],
  },

  /** OrbitControls 编辑器交互手感参数：与场景数据无关的纯编辑器行为 */
  orbit: {
    enableDamping: true,
    dampingFactor: 0.08,
  },

  /** 渲染器实例化参数：编辑器交互质量与性能的平衡点 */
  renderer: {
    /** MSAA 抗锯齿：编辑器默认开启保证可读的材质边缘 */
    antialias: true,
    /** 像素比上限：防止高分屏无限制超采样拖垮低端设备 */
    maxPixelRatio: 2,
  },

  /** 环境相关兜底 */
  environment: {
    /**
     * SkyMesh 天穹盒子的缩放（three 官方示例口径）：
     * 需远大于场景包围盒且小于相机 far，属几何占位尺度而非视觉效果参数
     */
    skyDomeScale: 10000,
    /**
     * procedural-sky 天空 IBL 烘焙参数（PMREMGenerator.fromScene 兜底）：
     * 影响烘焙产物的分辨率/模糊度而非"效果风格"，故属编辑器兜底预设
     */
    skyIbl: {
      /** CubeUV 贴图边长（像素）：three fromScene 默认口径，天空为低频内容无需更高 */
      size: 256,
      /** 预模糊半径（弧度）：0 = 不模糊；太阳盘已隐藏，天空本身平滑无需去走样模糊 */
      sigma: 0,
      /**
       * 烘焙相机近裁剪面（米）：fromScene 默认 0.1；
       * 烘焙用天穹不缩放（盒面距相机 0.5 米），只需覆盖它
       */
      near: 0.1,
      /** 烘焙相机远裁剪面（米）：fromScene 默认 100，同理只需覆盖 0.5 米的烘焙天穹 */
      far: 100,
    },
  },

  /** 后期管线硬限制 */
  pipeline: {
    /**
     * GTAO 分辨率缩放 clamp：契约只保证正数，
     * 下限防止全屏糊掉，上限 1 禁止超采样（性能红线）
     */
    aoResolutionScaleClamp: [0.25, 1] as [number, number],
  },
} as const;
