import type { ScenePackage } from '@prism/scene-schema';
import localforage from 'localforage';

/** 最近打开的场景包文档存储 key（带契约版本，格式演进时自然隔离） */
const STORAGE_KEY = 'prism_recentProjects_v1';
/** 最多保留的最近记录数 */
const MAX_RECENT = 10;

/**
 * 最近项目 service：唯一允许碰 localforage 的层（组件不直接读写存储）。
 * 按 meta.name 去重，最新在前。
 */
export const recentProjectsService = {
  key: STORAGE_KEY,

  async getAll(): Promise<ScenePackage[]> {
    const stored = await localforage.getItem<ScenePackage[]>(STORAGE_KEY);
    return stored ?? [];
  },

  async save(pkg: ScenePackage): Promise<void> {
    const all = await recentProjectsService.getAll();
    const next = [
      pkg,
      ...all.filter((item) => item.meta.name !== pkg.meta.name),
    ].slice(0, MAX_RECENT);
    await localforage.setItem(STORAGE_KEY, next);
  },
};
