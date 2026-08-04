# prism-studio

**Blender → Three.js WebGPU 场景交付协作平台。**

ISV（外部供应商）在 Blender 里建模，用导出器一键产出场景包（`scene.glb` + `*.prism.json`）；甲方前端维护契约包、WebGPU 渲染核与可视化编辑器。平台的核心理念：**数据契约是协作中心**——渲染效果只来自场景包数据或代码里显式声明的默认预设，杜绝材质名启发式与魔法数字。

## 快速开始

```bash
pnpm install   # 安装依赖
pnpm sample    # 生成内置演示场景（无需 Blender）
pnpm dev       # 启动编辑器，加载演示场景冒烟
```

有 Blender 环境时：用 `tools/blender/prism_export.py` 导出真实场景包，拖进编辑器查看校验报告与渲染效果。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动编辑器（@prism/editor 开发服务器） |
| `pnpm build` | 全部包生产构建 |
| `pnpm check` | Biome 检查 + 格式化（自动修复） |
| `pnpm check:ci` | Biome 只检查不修复（验收用） |
| `pnpm typecheck` | 全部包 TypeScript 类型检查 |
| `pnpm test` | Vitest 单测 |
| `pnpm sample` | 生成演示场景（tools/make-sample-scene.mjs） |

## 仓库结构

```
prism-studio/
├── packages/
│   ├── scene-schema/      # @prism/scene-schema 契约包（纯 TS + zod）
│   └── renderer-core/     # @prism/renderer-core Three.js WebGPU 渲染核
├── apps/
│   └── editor/            # @prism/editor Prism Studio 编辑器（Rsbuild + React）
├── tools/
│   ├── blender/           # Blender 导出器（详见 tools/blender/README.md）
│   ├── visual-regression/ # Cycles 参考图 + 像素对比
│   └── make-sample-scene.mjs
├── docs/                  # schema-v1 / data-contract / collaboration
└── .agents/skills/        # AI 协作规范（6 个 skill）
```

## 协作角色

- **甲方前端（owner）**：维护 schema / renderer / editor。
- **ISV（Blender 供应商）**：建模、导出场景包、在编辑器里调效果——不改前端代码。

AI 协作规范入口：根目录 `AGENTS.md` + `.agents/skills/`（6 个 skill）；协作流程见 `docs/collaboration.md`；Blender 导出器使用见 `tools/blender/README.md`。
