import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolveAssetUrl } from './resolve-url.ts';

export interface LoadGlbOptions {
  /** 相对 url 的解析基准（通常是场景包所在目录） */
  baseUrl?: string;
  /**
   * DRACO 解码器路径（如 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'）。
   * 缺省不接线 DRACO——只有压缩过的 GLB 才需要，避免无谓地下载解码器。
   */
  dracoDecoderPath?: string;
}

/**
 * GLTFLoader 封装：支持 url / ArrayBuffer 两种输入，按需接线 DRACOLoader。
 */
export async function loadGlb(
  source: string | ArrayBuffer,
  options: LoadGlbOptions = {},
): Promise<GLTF> {
  const loader = new GLTFLoader();
  let draco: DRACOLoader | null = null;
  if (options.dracoDecoderPath) {
    draco = new DRACOLoader().setDecoderPath(options.dracoDecoderPath);
    loader.setDRACOLoader(draco);
  }
  try {
    if (typeof source === 'string') {
      return await loader.loadAsync(resolveAssetUrl(source, options.baseUrl));
    }
    return await new Promise<GLTF>((resolve, reject) => {
      loader.parse(source, '', resolve, reject);
    });
  } finally {
    draco?.dispose();
  }
}
