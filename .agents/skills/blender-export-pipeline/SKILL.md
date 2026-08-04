---
name: blender-export-pipeline
description: Blender 侧导出工作流。ISV 从 Blender 产出场景包（scene.glb + *.prism.json + export-report.json）时加载：导出器 UI/CLI 用法、坐标系与单位约定、Cycles→glTF 能力矩阵、常见坑（.001 重命名、材质改名、Principled v2 输入名）、导出后校验动作。
user-invocable: true
---

# Blender 导出工作流

本 Skill 覆盖「Blender 场景 → 场景包」的全流程。契约字段含义见 `docs/schema-v1.md`；导出器安装与参数详情以 `tools/blender/README.md` 为准；效果对标排查见 `visual-regression`。

## 导出器用法

导出器 `tools/blender/prism_export.py` 一键产出三件套：

- `scene.glb` —— 调 Blender 官方 glTF exporter。
- `scene.prism.json` —— 符合 schema v1（`format: "prism-scene"` + `version: 1`）的场景数据。
- `export-report.json` —— mapping 报告：Blender name ↔ 稳定 id、warning 列表（如 `.001` 自动重命名）。

### UI 方式

Blender → Scripting 工作区加载 `prism_export.py` → 运行 → 按面板提示选择输出目录。

### CLI 方式

```bash
blender --background <场景.blend> --python tools/blender/prism_export.py -- --out <输出目录>
```

> 参数细节（输出目录、资源开关等）以 `tools/blender/README.md` 为准，本 Skill 不重复维护。

## 坐标系与单位约定（最重要）

**数据永远保持 Blender 原生表达，转换只发生在 `@prism/renderer-core` 的 convert 层（单一换算层）。**

| 维度 | 数据里的值（schema 侧） | 转换位置 |
|---|---|---|
| 坐标系 | Blender Z-up（`coordinateSystem: "blender"`），transform 用 matrix | renderer-core/convert |
| 单位 | 米制（`units: "metric"`） | renderer-core/convert |
| 灯光强度 | `energyWatts`（瓦特）× `intensityScale`（默认 1），无第二单位 | 不转换，渲染核直接用 |
| 曝光 | stops（`renderer.toneMapping.exposureStops`，来自色彩管理 exposure） | 导出器换算为 stops |
| 相机 | lens / sensorWidth / sensorFit / clip 原样导出 | FOV 换算在 convert 层 |

✅ 导出器只做「Blender 原生值 → schema 字段」的搬运与 stops 换算。
❌ 禁止在导出器里做 Y-up 转换、禁止内嵌任何校准值/魔法数字。

## Cycles → glTF 能力矩阵

| Blender 里的东西 | 去向 | 说明 |
|---|---|---|
| Principled PBR 参数（基础色/金属度/粗糙度/透射等） | GLB + `.prism.json` 材质 PBR 覆盖 | 直接导出 |
| 相机（lens/sensor/matrix） | `.prism.json` `cameras[]` | 直接导出，FOV 换算在 convert 层 |
| 灯光（sun/point/spot/area、能量、颜色、阴影开关） | `.prism.json` `lights[]` | 直接导出为 `energyWatts` |
| 对象变换、可见性、阴影标志 | GLB + `.prism.json` `objects[]` | 直接导出 |
| 世界（HDRI / 天空强度） | `.prism.json` `environment` + EXR 资源 | 直接导出 |
| 程序化纹理 / 噪声 / bake 节点 | **必须烘焙**成贴图再进 GLB | glTF 只认贴图，节点逻辑带不过来 |
| Layer Weight 玻璃等 Cycles 特性 | `.prism.json` 材质 `glass` 扩展（layer-weight/iridescence） | 导出器识别后写数据，渲染核 TSL 复建 |
| 后期（bloom/雾/GTAO/SSGI）、物理大气、反射探针 | **前端负责**，参数在 `.prism.json` `post` / `environment` / `probes` | Cycles 里没有对应物，在编辑器里调 |

## 常见坑

1. **`.001` 自动重命名**：Blender 复制物体/材质会自动加 `.001` 后缀，既丑又会打乱 `match.names`。导出器会在 export-report.json 里 warning，**导出前先清理重名**。
2. **材质改名导致 `match.names` 失效**：schema 里材质映射是显式名单。Blender 侧改名后必须重新导出，否则映射对不上、材质回退默认——效果对不上时先查这个。
3. **Principled v2 输入名变化**：Blender 4.x 的 Principled BSDF 输入名与旧版不同（如 `Coat Weight`、`Sheen Weight`）。导出器按 v2 处理；打开旧 .blend 时注意节点版本。
4. **指望名字当主键**：稳定 `id`（slug+hash）才是主键，`name` 仅显示用。中文名、改名都不影响 id。

## 导出后必做

1. 打开编辑器（`pnpm dev`），把 `.prism.json` + `scene.glb` 拖进去。
2. 看**校验报告面板**：error 必须为零；warning 逐条处理（多半是 `.001` 重名或映射缺失）。
3. 效果不对 → 走 `visual-regression` 流程量化定位，不要改前端代码。

## 禁止事项

- 不要在导出器里写死任何视觉参数（校准值、魔法数字）——旧工程就是这么烂掉的。
- 不要在导出器里做坐标系转换——转换只发生在 renderer-core/convert。
- 不要手工编辑 `.prism.json` 绕过导出器与编辑器（调效果的正路是编辑器面板→导出，见 `docs/collaboration.md`）。
