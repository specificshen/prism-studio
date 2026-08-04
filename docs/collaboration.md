# 甲方 / ISV 协作流程

本文定义交付物、验收流程、效果调整流程与问题反馈格式。AI 操作细则见 `.agents/skills/`（ISV 侧优先 `isv-vibe-coding`、`blender-export-pipeline`、`visual-regression`）。

## 角色

- **甲方（owner）**：前端。维护 `@prism/scene-schema` 契约、`@prism/renderer-core` 渲染核、`@prism/editor` 编辑器。
- **ISV**：Blender 建模供应商。产出场景包，在编辑器里看校验报告、调效果、导出数据。**不改前端代码。**

## 交付物定义

一次交付 = 一个**场景包**：

| 文件 | 产生方式 | 说明 |
|---|---|---|
| `scene.glb` | 导出器调 Blender 官方 glTF exporter | 几何、材质贴图、变换 |
| `scene.prism.json` | `tools/blender/prism_export.py` 或编辑器导出 | 符合 schema v1 的场景数据 |
| `export-report.json` | 导出器 | Blender name ↔ 稳定 id 映射 + warning 列表 |

注意：**禁止把场景包叫「工程文件」**——.blend 与代码仓库才是工程文件，不入交付。

## 交付验收流程

1. **校验面板零 error**：编辑器导入场景包，校验报告面板 error 必须为零；warning 逐条处理（`.001` 重名、`match.names` 失效等）。
2. **视觉回归达标**：按 `visual-regression` 流程跑 Cycles 对比，PSNR ≥ 28dB（默认阈值）；不达标按归因清单定位。
3. **入库**：场景包三件套提交仓库指定目录；**工作产物（参考图、截图、对比报告）一律不入库**。

## 效果调整流程

效果调整**只有一条合法路径**：

1. ISV 在编辑器里调：右侧 inspector 面板（环境/灯光/相机/后期/材质）+ 视口 TransformControls，实时预览。
2. 调到满意 → 导出规范化 `.prism.json`（浮点取整、格式化）。
3. 新 `.prism.json` 随场景包入库。

**禁止改代码调效果。** 数据里表达不了的效果，反馈给甲方走 `scene-schema-evolution` 六步流程加字段——ISV 不自己动手改代码。

## 问题反馈模板

效果不一致等问题，反馈时必须附：

```
【场景包】<场景包目录 / 版本 commit>
【问题描述】哪里不一样（哪个材质/灯光/后期）
【校验报告】编辑器校验面板截图或文本（含 warning）
【对比图】Cycles 参考图 vs 编辑器截图（同机位）+ compare.py 输出（PSNR/MAE）
【期望】Blender 里的效果描述或参考
```

没有校验报告与对比图的反馈不进入排查队列。

## 版本约定

- 场景包数据：`format: "prism-scene"` + `version: 1`。
- 向后兼容的加字段不动 `version`；breaking change 才 `version` +1，并在 `docs/schema-v1.md` 附迁移说明。
- 废弃字段保留一个版本并给 warning，不会无声删除——ISV 手上的旧场景包不会突然报错。
