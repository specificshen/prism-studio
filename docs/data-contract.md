# 数据 vs 代码边界原则

本文回答一个问题：**一个影响渲染效果的参数，到底该进数据（schema）还是留在代码？** 这是 prism-studio 的设计基石。执行细则见根 `AGENTS.md`「数据驱动铁律」；契约字段与演进流程见 `docs/schema-v1.md` 与 skill `scene-schema-evolution`。

## 原则

> 渲染效果只有两个合法来源：①场景包数据（schema）；②代码里显式声明的默认预设（`EDITOR_DEFAULTS`）。

## 什么必须进数据

**一切影响最终像素的、设计师在 Blender 里能感知的效果，都必须进 schema。**

- 设计师在 Blender 里调过的：灯光能量/颜色、材质 PBR 参数、相机镜头、世界 HDRI/天空、色彩管理曝光。
- 设计师期望「我在 Blender 里看到的就是前端样子」的：玻璃、镀膜、自发光、雾、大气。
- 甲方与乙方设计师会反复拉扯微调的：bloom 强度、AO、色调映射、阴影。

只要满足「设计师需要控制它」或「交付验收时它会被对比」，它就没有资格留在代码里。

## 什么留代码

- **转换层**：Blender Z-up → Three Y-up、matrix/FOV 换算（只在 renderer-core/convert，单一换算层）。
- **性能策略**：阴影贴图分级（2048/4096）、后期按需装配、resolutionScale 下限。
- **编辑器交互**：面板布局、TransformControls、校验报告展示。
- **实现机制**：TSL 节点怎么搭、后期 MRT 掩码结构——机制在代码，参数在数据。

## EDITOR_DEFAULTS 的定位

`presets.ts` 里的 `EDITOR_DEFAULTS` 是**兜底预设**：数据缺省时让渲染不致崩坏的默认值。

- ✅ 每条必须带注释：为什么是这个值、什么场景下兜底。
- ✅ 显式可查：调试时能通过 `window.__PRISM__` 确认某参数来自数据还是兜底。
- ❌ 它不是藏参数的地方。「懒得进 schema」不是放 `EDITOR_DEFAULTS` 的理由——设计师要控制的必须进 schema。

## 反面教材：旧工程 17 类硬编码效果

旧工程（threejs-webgpu-editor-core）把以下效果全部硬编码在前端或 Python 生成器里，导出的 JSON 根本没有这些字段，导致「Blender 里调了前端不变、前端改代码设计师不知道」：

- 彩虹镀膜玻璃参数
- A1 幕墙效果
- 程序化绿化（随机种子写死）
- 材质名关键词启发式：metalness 拉到 0.8
- emissive clamp 1.1–2.8
- Bloom 核心参数
- 雾参数
- GTAO 参数
- SSGI 参数
- 大气预设
- 经纬度（写死南京）
- …等 17 类

prism-studio 的对应物全部在 schema v1 里有字段（`post.*`、`environment.*`、材质 `glass`/`emissive` 扩展、`renderer.shadows`）——这是本工程存在的意义。

## 判定流程（文字版）

拿到一个参数，按顺序问：

1. **设计师需要控制它吗？**（他在 Blender 里能感知、会要求调，或验收时会被对比）→ 是：**进 schema**，走 `scene-schema-evolution` 六步流程。
2. **只是数据缺省时的兜底吗？** → 是：进 `EDITOR_DEFAULTS`，写注释。
3. **否则**（转换、性能、交互、机制）→ 留在代码，写成带注释的常量。

三个去向之外没有第四个。拿不准时默认进 schema——数据多一个字段的代价，远小于代码里藏一个魔法数字。
