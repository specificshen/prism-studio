---
name: isv-vibe-coding
description: 面向 ISV（Blender 供应商）的自然语言协作模板。ISV 用自然语言让 AI 协助重新导出、排查效果差异、加灯光、检查材质映射、清理重名、调后期时加载；附 ISV 禁区（不改 packages/ 代码、不在前端代码里调参）。
user-invocable: true
---

# ISV Vibe Coding 指南

本 Skill 面向 ISV：你们负责 Blender 建模与场景包数据，不需要懂前端，用自然语言让 AI 帮你干活即可。导出细节见 `blender-export-pipeline`；效果对标流程见 `visual-regression`；需要新数据字段时走 `scene-schema-evolution`。

## 核心理念

1. **效果一律走数据。** 你在 Blender 里调 → 重新导出；或在编辑器面板里调 → 导出 `.prism.json`。永远不需要、也不允许改前端代码。
2. **校验面板是你的朋友。** 每次导出后先把场景包拖进编辑器看校验报告，error 清零、warning 逐条处理。
3. **说「不一样」就跑对比。** 「和 Blender 里不一样」后面必须跟一套 visual-regression 流程，不是一句抱怨。

## 常用指令模板

### 1. 重新导出场景

```
我在 Blender 里改了灯光/材质，重新导出给我。
```

AI 该做的：

1. 运行导出器（UI 或 CLI，见 `blender-export-pipeline`）。
2. 检查 export-report.json 的 warning（尤其 `.001` 重名）。
3. 提示你把新场景包拖进编辑器看校验面板。

### 2. 效果和 Blender 里不一样

```
渲染效果和 Blender 里不一样，按 visual-regression 流程排查。
```

AI 该做的：

1. 跑 `capture_reference.py` 出 Cycles 参考图。
2. 编辑器同机位截图，`compare.py` 算 PSNR/MAE（阈值 28dB）。
3. 按归因清单走：数据是否导出 → 校验面板 warning → renderer 映射。
4. 用中文说清楚结论（卡在哪一步、缺什么数据/字段）。

### 3. 加一盏灯

```
给场景加一盏射灯，并把参数写进数据。
```

AI 该做的：

1. 在 Blender 里加 Spot 灯并摆好位置（或指导你操作）。
2. 重新导出，确认 `.prism.json` 的 `lights[]` 多出 `type: "spot"` 条目（`energyWatts × intensityScale`）。
3. 编辑器里验证实时生效。
4. ❌ 禁止在前端代码里 `new SpotLight()` 写死。

### 4. 材质效果不对

```
这个玻璃效果不对，检查 match.names 是否对上。
```

AI 该做的：

1. 打开 `.prism.json`，找到该材质覆盖的 `match.names` 名单。
2. 对照 GLB 里的实际材质名（Blender 侧改名会导致失效）。
3. 对不上 → 回 Blender 确认材质名或重新导出，让名单显式包含它。
4. ❌ 禁止写 `material.name.includes('玻璃')` 这类代码。

### 5. 清理重名

```
导出前把 .001 重名清理掉。
```

AI 该做的：

1. 在 Blender 里列出所有带 `.001`（及 `.002` 等）后缀的物体/材质。
2. 逐个改成有意义的名字。
3. 重新导出，确认 export-report.json 不再有重名 warning。

### 6. 调后期/氛围

```
雾太浓了，bloom 再弱一点。
```

AI 该做的：

1. 在编辑器右侧 inspector（环境/后期 Tab）调 `environment.fog`、`post.bloom` 参数，实时预览。
2. 调到满意后导出 `.prism.json`。
3. 提醒你把新 `.prism.json` 随场景包入库（流程见 `docs/collaboration.md`）。

### 7. 需要新效果数据

```
我想控制 XXX 效果，但数据里没有这个字段。
```

AI 该做的：

1. 确认现有 schema 字段确实表达不了（查 `docs/schema-v1.md`）。
2. 反馈给甲方前端，走 `scene-schema-evolution` 六步流程加字段。
3. 你这边等导出器与编辑器更新后重新导出即可。

## ISV 禁区

- ❌ 不要改 `packages/`、`apps/` 下任何代码——那是甲方前端的领地。
- ❌ 不要在前端代码里调参——效果一律走数据（Blender 重新导出，或编辑器面板→导出）。
- ❌ 不要手工瞎编 `.prism.json`——它要么来自导出器，要么来自编辑器导出。
- ❌ 不要把截图、参考图等对比产物提交进仓库（见 `visual-regression`）。

## 检查清单

交付前让 AI 跑一遍：

```
重新导出场景包，确认编辑器校验面板零 error、warning 全部处理完，然后告诉我。
```
