---
name: prism-patterns
description: prism-studio 工程约定唯一真相源。处理本仓库任何代码时优先加载：技术栈、monorepo 分层职责、目录结构、编辑器 atoms/services/domain hooks 数据流、文件命名与导出规范、React 19/import 规范、数据驱动铁律下的禁止事项。
user-invocable: true
---

# prism-studio 工程模式

本 Skill 是 prism-studio（Blender → Three.js WebGPU 场景交付协作平台）的工程约定唯一真相源，后续业务工程可直接复制这里的分层、命名与导出方式。

契约演进流程见 `scene-schema-evolution`；渲染核架构与数据驱动铁律代码对比见 `three-webgpu-renderer`；Blender 侧导出工作流见 `blender-export-pipeline`；乙方设计师 Blender 侧自然语言协作模板见 `designer-blender-vibe-coding`。

## 技术栈

- pnpm workspace monorepo
- Rsbuild 2 + React 19 + TypeScript（strict）
- Tailwind CSS v4 + shadcn/ui + @base-ui/react
- Jotai（原子状态）+ localforage（本地持久化）
- Biome（lint + format + import 排序）+ Vitest
- three@0.185（WebGPU/TSL 节点材质）
- zod 4（契约定义、校验、构建期生成 JSON Schema）

## monorepo 目录结构

```
prism-studio/
├── packages/
│   ├── scene-schema/      # @prism/scene-schema 契约包（纯 TS + zod，无 three 依赖）
│   └── renderer-core/     # @prism/renderer-core 渲染核（纯 TS + three，无 React）
├── apps/
│   └── editor/            # @prism/editor Prism Studio 编辑器（Rsbuild + React）
├── tools/
│   ├── blender/           # Blender 导出器 prism_export.py
│   ├── visual-regression/ # Cycles 参考图 + 像素对比
│   └── make-sample-scene.mjs  # 演示场景生成（无需 Blender 冒烟）
└── docs/                  # schema-v1.md / data-contract.md / collaboration.md
```

## 分层职责（依赖方向单向）

| 包 | 职责 | 允许依赖 | 禁止依赖 |
|---|---|---|---|
| `@prism/scene-schema` | 契约：zod schema、validate、id/单位工具、JSON Schema 生成 | zod 4 | three、react |
| `@prism/renderer-core` | 渲染：convert 坐标换算、loaders、lighting/environment/materials/pipeline、presets | three@0.185、`@prism/scene-schema` | react、localforage |
| `@prism/editor` | 编辑器：布局、面板、校验报告、导入导出、交互 | 上述两者 + React/Jotai/localforage | 绕过 renderer-core 直接堆 three 原语 |

规则：

- 依赖方向只有 `scene-schema ← renderer-core ← editor`，禁止反向、禁止环。
- scene-schema 必须保持纯 TS + zod：设计师的外部工具（Python 侧）也要消费它生成的 JSON Schema。
- renderer-core 不碰 React；编辑器通过 `PrismRenderer` 类实例（`mount` / `loadPackage` / 分区 `update*` / `dispose`）驱动它。

## 编辑器内数据流：atoms + services + domain hooks 三板斧

编辑器状态统一三层模式（与 echo-space 同源），领域换成场景文档。

### 1. services 层（持久化）

- 一个领域一个 service 文件：`scene-package-service.ts`（最近打开的场景包）等。
- 内部用 localforage 封装；组件永不直接读写 localStorage。

```ts
// services/scene-package-service.ts
import type { ScenePackage } from '@prism/scene-schema';
import { getItem, setItem } from './storage';

const STORAGE_KEY = 'prism_recentPackages_v1';

export const scenePackageService = {
  key: STORAGE_KEY,
  async getRecent() {
    return getItem<ScenePackage[]>(STORAGE_KEY, []);
  },
  async saveRecent(value: ScenePackage[]) {
    await setItem(STORAGE_KEY, value);
  },
};
```

### 2. atoms 层（内存状态）

- primitive atoms，不直接持久化，不放 seed 数据。

```ts
// atoms/scene-document-atoms.ts
import { atom } from 'jotai';
import type { ScenePackage, ValidationIssue } from '@prism/scene-schema';

// 场景文档：编辑器内存中正在被编辑的场景数据（术语见根 AGENTS.md）
export const sceneDocumentAtom = atom<ScenePackage | null>(null);
// dirty 标记：面板 / TransformControls 回写后置 true，导出后清零
export const sceneDirtyAtom = atom<boolean>(false);
// 校验报告：validateScenePackage() 的人读错误列表，驱动校验面板
export const validationReportAtom = atom<ValidationIssue[]>([]);
```

### 3. domain hooks 层（唯一入口）

- 每个领域一个 hook：`use-scene-document.ts`、`use-validation-report.ts`。
- 页面/面板只通过 domain hooks 读写数据，**不要直接 `useAtom(sceneDocumentAtom)`**。

```ts
// hooks/use-scene-document.ts
import { useAtom } from 'jotai';
import type { ScenePackage } from '@prism/scene-schema';
import { sceneDirtyAtom, sceneDocumentAtom } from '@/atoms/scene-document-atoms';

export function useSceneDocument() {
  const [doc, setDoc] = useAtom(sceneDocumentAtom);
  const [dirty, setDirty] = useAtom(sceneDirtyAtom);

  function updateLighting(next: ScenePackage['lights']) {
    // 面板与 TransformControls 的统一回写入口：改文档 + 打 dirty
    setDoc((prev) => (prev ? { ...prev, lights: next } : prev));
    setDirty(true);
  }

  return { doc, dirty, updateLighting /*, updateEnvironment, updatePost ... */ };
}
```

### 4. 与渲染核的同步

- domain hooks 改完场景文档后，调 `PrismRenderer` 对应分区更新（`updateEnvironment` / `updateLighting` / `updatePost`），不要整包 reload。

## 文件命名与导出约定

- 所有源码文件用 **kebab-case**：`scene-document-atoms.ts`、`use-scene-document.ts`、`validation-panel.tsx`。
- React 组件导出名 PascalCase，文件名保持 kebab-case。
- **一律具名导出**；`types` 目录允许 barrel（`index.ts` 聚合类型）是唯一例外，其它目录禁止 barrel，调用方从具体文件导入：

```ts
import { ValidationPanel } from '@/components/validation-panel';
import { useSceneDocument } from '@/hooks/use-scene-document';
```

### type import

- 纯类型导入统一 `import type { X } from '...'`；同模块同时需要值和类型时可写一行：

```ts
import { validateScenePackage, type ScenePackage } from '@prism/scene-schema';
```

### import 排序

- 提交前跑 `pnpm check`，Biome 自动排序，不要手动与 Biome 对抗。

## React 19 规范

- **禁止 `React.forwardRef`**：React 19 中 ref 是普通 prop，直接在 props 解构。
- **不要写 `displayName`**：React 19 DevTools 已能自动识别函数组件名。
- 优先 named imports：`import { useState } from 'react'`；需要 `React.ComponentProps` 等命名空间类型时允许 `import type * as React from 'react'`。
- 不要回到 `React.FC` / `React.FunctionComponent`。

## UI 组件

- shadcn/ui 组件一律通过 CLI 加入，不要手写进 `components/ui`：

```bash
pnpm dlx shadcn@latest add <组件>
```

## 禁止事项

数据驱动铁律的完整规则与 grep 自检见根 `AGENTS.md`。工程层面额外禁止：

- **禁止材质名/对象名关键词启发式**：`if (material.name.includes('玻璃'))` 这类分支永远不允许，材质映射只能走 schema 的 `materials[].match.names` 显式名单。
- **禁止渲染魔法数字**：任何影响最终像素的参数只有两个合法来源——场景包数据、`presets.ts` 里带注释声明的 `EDITOR_DEFAULTS`。
- **不要直接 `useAtom` 领域 atom**：走对应 domain hook。
- **不要直接读写 localStorage**：走 services 层。
- **不要在 scene-schema 里 import three**：契约包必须纯 TS + zod。
- **不要在 renderer-core 里 import react**：渲染核必须纯 TS + three。
- **不要为形式统一滥用抽象**：三段重复优于一个看不懂的抽象。
