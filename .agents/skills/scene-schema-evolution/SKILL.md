---
name: scene-schema-evolution
description: prism-studio 场景契约（schema）演进流程。当设计师需要在 Blender 里控制新效果、或现有字段表达不足时加载：什么时候动 schema、加字段六步流程、版本与废弃规则、每步验证命令。
user-invocable: true
---

# 契约演进流程

本 Skill 回答一个问题：**要动 `*.prism.json` 的字段时，按什么顺序改、改完怎么验证。** 契约字段的人读文档在 `docs/schema-v1.md`；工程约定见 `prism-patterns`；Blender 侧导出细节见 `blender-export-pipeline`。

## 什么时候要动 schema

唯一正当理由：**设计师需要在 Blender 侧控制某种效果数据，而现有 schema 表达不了。**

典型信号：

- 设计师说「这个效果我在 Blender 里调了但前端没变」——先确认字段是否存在，不存在才走本流程。
- 渲染核里出现了一个想写死的视觉参数——按数据驱动铁律，它应该进 schema（或 `EDITOR_DEFAULTS` 兜底）。

不要动 schema 的情况：

- 只是代码实现调整（转换层、性能策略、编辑器交互）——那本来就不在数据里，边界见 `docs/data-contract.md`。
- 临时调试——用编辑器面板调、导出 `.prism.json` 即可，不要为它加字段。

## 加字段六步流程

顺序不能乱，每一步都有验证命令。

### ① 改 zod schema

在 `packages/scene-schema/src` 里加字段。遵守契约铁律：

- 稳定 `id`（slug+hash）做主键，`name` 仅显示用。
- 浮点统一 5 位小数取整。
- 新字段给默认值或 optional，保证向后兼容（见下方版本规则）。

```bash
pnpm --filter @prism/scene-schema test
```

### ② 重新生成 JSON Schema

构建期从 zod 生成 JSON Schema，供设计师与外部工具离线校验：

```bash
pnpm --filter @prism/scene-schema build
```

### ③ 更新 docs/schema-v1.md

字段表加一行：字段路径、类型、默认值、单位、含义、Blender 侧来源。人读文档必须与 zod 同步，不允许只改代码不改文档。

### ④ 导出器产出

`tools/blender/prism_export.py` 导出该字段（Blender 数据源 → schema 字段）。注意**导出器不内嵌任何校准值**，只搬数据。导出一个真实场景验证：

```bash
blender --background <场景.blend> --python tools/blender/prism_export.py -- --out <输出目录>
```

### ⑤ renderer-core 消费

在渲染核对应分区（environment / lighting / materials / pipeline）消费新字段；数据缺省时回退 `EDITOR_DEFAULTS`，并在 `presets.ts` 注释里写明兜底原因。

```bash
pnpm --filter @prism/renderer-core test
pnpm typecheck
```

### ⑥ 更新 examples 与演示场景

- 更新 scene-schema 的示例 JSON。
- 需要时重新生成演示场景：`pnpm sample`。

最后全量验证（改完必跑的一键门禁）：

```bash
pnpm verify
```

## 版本规则

- **向后兼容的加字段**（新字段有默认值、旧场景包照样通过校验）：**不动 `version`**，保持 `version: 1`。
- **Breaking change**（改字段语义、删字段、改单位、旧文件无法通过校验）：`version` +1，并在 `docs/schema-v1.md` 写迁移说明（旧字段 → 新字段的映射与换算）。
- `format: "prism-scene"` 永远不变；它是格式标识，不是版本号。

## 废弃字段政策

- 字段废弃后**保留一个版本**：schema 仍接受它，渲染核仍消费它，但 `validateScenePackage()` 输出 warning 提示迁移。
- 下一个 version 才允许删除。
- 禁止无声删除：设计师手上的旧场景包不能突然报错一堆 error。

## 禁止事项

- 不要只改 zod 不走六步——每一步都有人依赖（设计师靠 JSON Schema 与 docs，渲染核靠默认值）。
- 不要在 renderer-core 里容忍「旧字段别名」。同义字段不同名是旧工程 `webgpuMaterials` vs `webgpuMaterialOverrides` 的坑；别名需求走版本迁移说明。
- 不要引入双单位。灯光强度只有 `energyWatts × intensityScale`（默认 1）一种表达；旧工程 `energy` + `webIntensity` 双轨是反面教材。
- 不要 snake_case / camelCase 混用：schema 字段一律 camelCase。
