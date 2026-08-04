import { loadGlb } from '@prism/renderer-core';
import { validateScenePackage } from '@prism/scene-schema';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import {
  activeCameraIdAtom,
  sceneDirtyAtom,
  sceneDocumentAtom,
  sceneGraphVersionAtom,
  sceneLoadingAtom,
  selectedNodeAtom,
  validationReportAtom,
} from '@/atoms/scene-document-atom';
import { getPrismRenderer } from '@/hooks/use-prism-renderer';
import { recentProjectsService } from '@/services/recent-projects-service';

/** 一次场景包加载的输入：json 文本 + GLB（url 或二进制） */
export interface LoadScenePackageInput {
  jsonText: string;
  glb: string | ArrayBuffer;
  /** 场景包内相对资源（HDRI 等）的解析基准 */
  baseUrl?: string;
}

/**
 * 场景包加载流程（唯一入口）：
 * 读 json → validateScenePackage → 有 error 只展示校验报告不加载 →
 * 否则 loadGlb + renderer.loadPackage → 写 sceneDocumentAtom + validationReportAtom。
 */
export function useScenePackage() {
  const setDoc = useSetAtom(sceneDocumentAtom);
  const setDirty = useSetAtom(sceneDirtyAtom);
  const setReport = useSetAtom(validationReportAtom);
  const setLoading = useSetAtom(sceneLoadingAtom);
  const setActiveCameraId = useSetAtom(activeCameraIdAtom);
  const setSelectedNode = useSetAtom(selectedNodeAtom);
  const bumpGraphVersion = useSetAtom(sceneGraphVersionAtom);

  const loadScenePackage = useCallback(
    async (input: LoadScenePackageInput): Promise<boolean> => {
      setLoading(true);
      try {
        let parsed: unknown;
        try {
          parsed = JSON.parse(input.jsonText);
        } catch {
          setReport({
            issues: [
              {
                path: '(root)',
                message: 'JSON 解析失败：文件不是合法的 JSON 文本',
                severity: 'error',
              },
            ],
            warnings: [],
          });
          return false;
        }

        const result = validateScenePackage(parsed);
        if (!result.ok || !result.data) {
          // 有 error 级问题：只展示校验报告，不加载（契约校验是协作核心卖点）
          setReport({ issues: result.issues, warnings: [] });
          return false;
        }

        const renderer = getPrismRenderer();
        if (!renderer) {
          setReport({
            issues: [
              {
                path: '(root)',
                message:
                  '渲染器尚未就绪（WebGPU 初始化未完成），无法加载场景包',
                severity: 'error',
              },
            ],
            warnings: [],
          });
          return false;
        }

        const pkg = result.data;
        const gltf = await loadGlb(input.glb, { baseUrl: input.baseUrl });
        const { warnings } = await renderer.loadPackage(pkg, gltf, {
          baseUrl: input.baseUrl,
        });

        setDoc(pkg);
        setDirty(false);
        setReport({ issues: result.issues, warnings });
        setSelectedNode(null);
        const activeCamera =
          pkg.cameras.find((camera) => camera.isDefault) ?? pkg.cameras[0];
        setActiveCameraId(activeCamera?.id ?? null);
        bumpGraphVersion((version) => version + 1);
        // 记入最近打开（fire-and-forget，失败不阻断加载）
        void recentProjectsService.save(pkg).catch(() => {});
        return true;
      } catch (error) {
        setReport({
          issues: [
            {
              path: '(root)',
              message: `加载失败：${error instanceof Error ? error.message : String(error)}`,
              severity: 'error',
            },
          ],
          warnings: [],
        });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [
      setDoc,
      setDirty,
      setReport,
      setLoading,
      setActiveCameraId,
      setSelectedNode,
      bumpGraphVersion,
    ],
  );

  /** 文件选择/拖放入口：需要 .prism.json + .glb 两个文件同时提供 */
  const loadFromFiles = useCallback(
    async (files: File[]): Promise<boolean> => {
      const jsonFile = files.find((file) => file.name.endsWith('.json'));
      const glbFile = files.find((file) => file.name.endsWith('.glb'));
      if (!jsonFile || !glbFile) {
        setReport({
          issues: [
            {
              path: '(root)',
              message:
                '需要同时提供场景包数据（.prism.json）与模型（.glb）两个文件',
              severity: 'error',
            },
          ],
          warnings: [],
        });
        return false;
      }
      const [jsonText, glb] = await Promise.all([
        jsonFile.text(),
        glbFile.arrayBuffer(),
      ]);
      return loadScenePackage({ jsonText, glb });
    },
    [loadScenePackage, setReport],
  );

  /** 内置示例：public/sample 下已通过契约校验的演示场景包 */
  const loadSample = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/sample/sample.prism.json');
      if (!response.ok) {
        throw new Error(`示例场景包获取失败（HTTP ${response.status}）`);
      }
      const jsonText = await response.text();
      return await loadScenePackage({
        jsonText,
        glb: '/sample/sample.glb',
        baseUrl: '/sample/',
      });
    } catch (error) {
      setReport({
        issues: [
          {
            path: '(root)',
            message: `加载示例失败：${error instanceof Error ? error.message : String(error)}`,
            severity: 'error',
          },
        ],
        warnings: [],
      });
      return false;
    }
  }, [loadScenePackage, setReport]);

  return { loadScenePackage, loadFromFiles, loadSample };
}
