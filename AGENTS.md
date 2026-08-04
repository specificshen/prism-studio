# prism-studio 协作协议

本仓库是 **Blender → Three.js WebGPU 场景交付协作平台**：乙方设计师在 Blender 里建模并导出场景包，甲方前端维护契约/渲染核/编辑器。**数据契约是协作中心**——渲染效果只有两个合法来源：场景包数据（schema），或代码里显式声明的默认预设。

## 角色与协作

本仓库由**甲方前端（owner）**与**乙方设计师（designer，Blender 建模交付 + 编辑器调效果）**共同使用，**默认角色为 `designer`**（乙方设计师是主要使用者）。AI 处理请求前应先识别当前用户角色，再决定优先激活哪些 skill 与约束：

- **读取 `.agents/user-role`** 文件（值：`owner` | `designer`）；文件不存在或为空时按默认 `designer` 处理。
- 用户也可在 prompt 中直接声明角色（如「我是甲方」），该声明**覆盖配置文件**。

### 角色默认 skill 优先级

| 角色 | 优先参考 | 核心关注点 |
|---|---|---|
| `owner` | `prism-patterns` → `scene-schema-evolution` → `three-webgpu-renderer` → `tsl-material-authoring` | 契约、渲染核、编辑器架构 |
| `designer`（默认） | `designer-vibe-coding` → `designer-blender-vibe-coding` → `blender-export-pipeline` → `visual-regression` | 编辑器调效果、Blender 导出与交付、效果对标 |

### 协作边界

- **设计师只动 Blender 侧、编辑器数据与 docs**：用导出器产出场景包、在编辑器里调效果并导出 `.prism.json`。**不修改 `packages/`、`apps/`、`tools/` 下任何代码。**
- **`packages/` 与 `tools/` 代码只有 owner 改**：契约 schema、渲染核、编辑器实现、Blender 导出器与对比工具。
- 效果调整一律走数据（Blender 重新导出 / 编辑器面板→导出），**禁止改代码调效果**。流程见 `docs/collaboration.md`。

## 项目命令

- `pnpm install` - 安装依赖
- `pnpm dev` - 启动编辑器（@prism/editor 开发服务器）
- `pnpm build` - 全部包生产构建
- `pnpm check` - Biome 检查 + 格式化 + import 排序（自动修复）
- `pnpm check:ci` - Biome 只检查不修复（验收用）
- `pnpm typecheck` - 全部包 TypeScript 类型检查
- `pnpm test` - Vitest 单测
- `pnpm verify` - **改完必跑的一键门禁**（check:ci + typecheck + test + build，与 CI 一致）
- `pnpm sample` - 生成演示场景（tools/make-sample-scene.mjs，无需 Blender 冒烟）
- `pnpm dlx shadcn@latest add <组件>` - 编辑器加 shadcn/ui 组件

## 技术栈

- pnpm workspace monorepo
- Rsbuild 2 + React 19 + TypeScript（strict）
- Tailwind CSS v4 + shadcn/ui + @base-ui/react
- Jotai + localforage
- Biome + Vitest
- three@0.185（WebGPU/TSL 节点材质）
- zod 4（契约 + 构建期生成 JSON Schema）

## 术语词典（必须统一）

- `场景包 scene package`：一次交付的数据单元 = `scene.glb` + `*.prism.json`（附 export-report.json）。**禁止叫「工程文件」**——.blend 和代码仓库才是工程文件，不是交付物。
- `契约 / 契约包`：`@prism/scene-schema`，定义 `*.prism.json` 的 zod schema、校验与 JSON Schema 生成。
- `场景文档 scene document`：编辑器内存中正在被编辑的场景数据（Jotai atom 里的那份），导出后成为 `.prism.json`。
- `渲染核`：`@prism/renderer-core`，Three.js WebGPU 渲染实现，纯 TS 无 React。
- `数据驱动铁律`：渲染效果只有两个合法来源——场景包数据、`presets.ts` 里显式声明的 `EDITOR_DEFAULTS`。

## 相关 Skill

处理本仓库时，按场景优先参考以下本地 skill：

- `prism-patterns` - 工程约定唯一真相源（分层、目录、数据流、命名/导出、禁止事项）
- `scene-schema-evolution` - 契约演进六步流程与版本/废弃规则
- `blender-export-pipeline` - Blender 导出工作流、坐标/单位约定、Cycles→glTF 能力矩阵与坑
- `three-webgpu-renderer` - 渲染核架构、数据驱动铁律代码对比、性能红线
- `tsl-material-authoring` - 自定义 TSL 材质（玻璃）开发六步流程、materials/tsl/ 扩展点与 r185 插槽速查
- `visual-regression` - Cycles 对标四步流程与归因清单（工作产物不入库）
- `designer-blender-vibe-coding` - 乙方设计师 Blender 侧自然语言协作模板与禁区（导出与交付协作）
- `designer-vibe-coding` - 设计师自然语言协作模板与禁区（只动编辑器数据，不碰代码）

## 最高层原则

- **数据驱动铁律居首**：任何影响最终像素的参数，只能来自场景包数据或 `EDITOR_DEFAULTS`（详见下文硬约束）。
- 契约演进走 `scene-schema-evolution` 六步流程，不允许只改代码不同步文档/导出器。
- 三段重复优于一个看不懂的抽象；不为形式统一滥用抽象。
- 工作产物（参考图、截图、对比报告）一律不入库。
- 具体工程约定见 `prism-patterns`。

## 数据驱动铁律（AI/Vibe Coding 必读）

本节是写 `packages/renderer-core`（以及任何影响渲染的代码）时的硬约束，优先级高于个人偏好、网络教程、其他参考资料。旧工程 17 类效果硬编码导致交付失控，本节就是它的墓志铭。

### 规则

1. **禁止材质名/对象名关键词分支。** `material.name.includes('玻璃')`、`obj.name.match(/幕墙/)` 这类启发式永远不允许。材质映射只能走 schema `materials[].match.names` 显式名单。
2. **禁止渲染魔法数字。** 颜色、强度、阈值、范围等视觉参数必须来自 schema 数据或 `EDITOR_DEFAULTS`；`EDITOR_DEFAULTS` 每条必须带注释说明为什么是兜底。
3. **禁止双单位。** 灯光强度一律 `energyWatts × intensityScale`（默认 1）；曝光一律 stops；坐标一律 Blender Z-up 进数据、convert 层一处换算。旧工程 `energy` + `webIntensity` 双轨是反面教材。
4. **禁止前端随机出视觉效果。** `Math.random()` 不允许出现在渲染路径（旧工程随机种子写死的程序化绿化是反面教材）；需要分布的效果在 Blender 里烘焙进 GLB。
5. **改动视觉 = 改动数据。** 想调效果，只能改场景包数据或 `EDITOR_DEFAULTS`，并在提交信息里写明原因；不允许「在代码里微调一下」。

### 自检清单（提交前 grep 必须零命中）

```bash
# 名字启发式
grep -rn "\.name\.includes\|\.name\.match" packages/renderer-core/src --include="*.ts"

# 前端随机
grep -rn "Math\.random" packages/renderer-core/src

# 颜色字面量（只允许出现在 presets.ts 的 EDITOR_DEFAULTS）
grep -rn "0x[0-9a-fA-F]\{6\}" packages/renderer-core/src | grep -v EDITOR_DEFAULTS
```

任何一条有命中都必须修正：要么进 schema 数据，要么进 `EDITOR_DEFAULTS` 并加注释。

### 决策记录

- 2026-08-03 初版：确立 schema v1（`format: "prism-scene"` + `version: 1`）；废除旧工程 `webIntensity` 双轨，灯光统一 `energyWatts × intensityScale`；废除名字启发式，材质映射统一 `match.names` 显式名单。
