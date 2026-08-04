---
name: designer-vibe-coding
description: 面向设计师（懂设计、不懂前端）的 prism-studio 自然语言协作模板。设计师用「编辑器面板 + 场景包数据 + 自然语言」调效果时加载：加载场景包、调曝光/玻璃/天空/雾/灯光/Bloom、导出交付、效果不一致时的处理；附设计师禁区（不改 packages//tools/ 代码、不在代码里写魔法数字、不手编 JSON 乱加字段）。
user-invocable: true
---

# 设计师 Vibe Coding 指南

本 Skill 面向设计师：你不需要懂前端，在编辑器里看效果、用自然语言让 AI 帮你改**数据**即可。与 `designer-blender-vibe-coding` 的分工：本 Skill 管编辑器/数据侧的日常调效果，`designer-blender-vibe-coding` 管 Blender 侧的导出与交付协作。工程约定见 `prism-patterns`；效果与 Blender 不一致时走 `visual-regression`；想要的效果契约里没有字段时走 `scene-schema-evolution`。

## 核心理念

1. **一切效果调整 = 改数据。** 这是本工程的数据驱动铁律（见根 `AGENTS.md`）：渲染效果只来自场景包数据或代码里显式声明的默认预设。你说「玻璃再透一点」，AI 改的是 `.prism.json` 里的字段，不是代码。
2. **你永远不碰 `packages/` 和 `tools/` 的代码。** 你的工作界面只有三个：编辑器右侧面板、场景包数据、对 AI 的自然语言描述。
3. **调到满意就导出。** 编辑器里调好 → 导出 `.prism.json` → 交给开发，这就是你的交付物。
4. **说「不一样」就跑对比。** 「效果和 Blender 里不一样」后面必须跟一套 `visual-regression` 流程，不是自己想办法修。

## 常用指令模板

### 1. 加载场景包并调曝光

```
加载示例场景包（或我从 Blender 导出的这份场景包），整体太暗了，帮我调亮一点。
```

AI 该做的：

1. 运行 `pnpm sample` 生成演示场景（或接收你给的 `scene.glb` + `.prism.json`）。
2. 在编辑器加载场景包，确认校验面板零 error。
3. 调 `toneMapping.exposure`（单位 stops，+1 = 亮一倍），实时预览到你满意。

### 2. 玻璃再透一点 / 换茶色玻璃

```
幕墙玻璃再透一点；或者换成茶色玻璃。
```

AI 该做的：

1. 在 `.prism.json` 找到该材质的 `materials[].pbr` 条目（靠 `match.names` 对上 GLB 材质名）。
2. 更透：调大 `pbr.transmission`（0~1）；茶色：设 `pbr.attenuationColor`（如 `#a0855c`）并配 `pbr.attenuationDistance`（米，越小颜色越浓）。
3. 编辑器里实时确认效果。❌ 禁止改代码里的材质参数。

### 3. 天空换成傍晚

```
把天空换成傍晚的感觉。
```

AI 该做的：

1. 确认 `environment.type` 是 `procedural-sky`（不是就先切过去）。
2. 调低太阳高度角 `sunElevationDeg`（傍晚约 5~15 度）、摆 `sunAzimuthDeg` 方位角、需要更昏黄时调大 `turbidity`。
3. 天空光照太亮/太暗调 `lightingStrength` 倍率。

### 4. 加雾营造空气感

```
加点雾，让远处楼群有空气感。
```

AI 该做的：

1. 在 `environment.fog` 设 `enabled: true`。
2. 调 `near`/`far`（雾起始/完全遮蔽距离，米）与 `color`，实时预览到氛围合适。

### 5. 灯太亮了

```
这盏射灯太亮了，压暗一点。
```

AI 该做的：

1. 在 `lights[]` 找到该灯，调 `intensityScale` 倍率（或 `energyWatts` 瓦数）。
2. ❌ 禁止发明第二套强度字段——全工程只有 `energyWatts × intensityScale` 这一套口径（数据驱动铁律第 3 条）。

### 6. Bloom 开一点

```
灯光的高光晕开一点，有辉光感。
```

AI 该做的：

1. 在 `post.bloom` 设 `enabled: true`，调 `strength`（强度）与 `threshold`（起辉阈值）。
2. 后期开关关了就是真不建 pass，调完记得保持 `enabled` 状态正确。

### 7. 导出现在的效果给开发

```
把现在调好的效果导出，我要发给开发。
```

AI 该做的：

1. 用编辑器的导出功能（底层是 `serializeScenePackage`，2 空格缩进 + 浮点 5 位取整的规范格式）导出 `.prism.json`。
2. 提醒你：`.prism.json` + 原 `scene.glb` 一起才是完整场景包，按 `docs/collaboration.md` 流程交付。

### 8. 效果和 Blender 里不一样

```
编辑器里的效果和 Blender 里看到的不一样。
```

AI 该做的：

1. 不猜、不改代码，直接转 `visual-regression` 四步流程：Cycles 参考图 → 同机位截图 → PSNR/MAE 对比 → 按归因清单定位（数据没导出 / 校验 warning / 渲染映射）。
2. 用中文说清楚结论：卡在哪一步、缺什么数据或字段。

## 设计师禁区

- ❌ **不改 `packages/`、`apps/`、`tools/` 下任何代码**——那是甲方前端的领地，你也不需要看懂它。
- ❌ **不在代码里写颜色/强度魔法数字。** 想要任何视觉效果，说出口的是「把 X 写进数据」，AI 会落到 `.prism.json` 字段或 `EDITOR_DEFAULTS`。
- ❌ **不手编 JSON 乱加字段。** 加字段前先问 AI「契约里有没有这个字段」（查 `docs/schema-v1.md`）；没有就走 `scene-schema-evolution` 流程，由甲方前端加。
- ❌ **工作产物不入库。** 截图、对比图、临时 JSON 不提交进仓库（见 `visual-regression`）。
- ❌ **不绕过校验面板。** 场景包拖进编辑器先看校验报告，error 清零再谈调效果。

## 检查清单

交付前让 AI 跑一遍：

```
跑 pnpm verify，全绿（Biome + 类型检查 + 单测 + 构建）后再把 .prism.json 交付给我。
```
