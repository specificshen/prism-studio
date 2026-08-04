---
name: visual-regression
description: 渲染效果对标排查流程。当 ISV 反馈「和 Blender 里不一样」时加载：Cycles 参考图 → 编辑器同机位截图 → compare.py 像素对比（PSNR/MAE/亮度分位数，阈值默认 28dB）→ 归因清单。工作产物一律不入库。
user-invocable: true
---

# 视觉回归对标流程

本 Skill 回答：「前端渲染和 Blender Cycles 不一样」时按什么流程定位。Blender 导出细节见 `blender-export-pipeline`；渲染核映射逻辑见 `three-webgpu-renderer`。

## 什么时候用

- ISV 说「和 Blender 里不一样」——不要空对空讨论，先跑本流程拿到量化差异。
- 渲染核改了映射逻辑（convert / materials / pipeline）后做回归验证。

## 四步流程

### ① Cycles 参考图

Blender 侧用 `tools/visual-regression/capture_reference.py` 渲染 Cycles 参考图（固定机位、固定分辨率）：

```bash
blender --background <场景.blend> --python tools/visual-regression/capture_reference.py -- --out <输出目录>
```

### ② 编辑器同机位截图

编辑器加载同一场景包，切到同一台相机（`cameras[]` 里那台），截图导出。**机位不一致则对比无意义。**

### ③ compare.py 像素对比

```bash
python tools/visual-regression/compare.py <参考图.png> <编辑器截图.png>
```

输出 PSNR / MAE / 亮度分位数对比。**默认阈值 PSNR 28dB**：低于阈值判定不一致，进入归因。

### ④ 归因清单（按顺序查，大概率前两步就解决）

1. **数据是否导出**：这个效果的参数在 `.prism.json` 里有吗？没有 → Blender 侧没导出（程序纹理要烘焙？字段缺失走 `scene-schema-evolution`？）。
2. **校验面板 warning**：编辑器校验报告里有没有这条数据的 warning（`.001` 重名、`match.names` 失效）？
3. **renderer 映射**：数据有、校验过，但渲染不对 → 渲染核 convert/materials/pipeline 的消费逻辑问题，用 `window.__PRISM__` 确认生效参数来源。

## 工作产物一律不入库

- 参考图、截图、对比报告是**工作产物**，放本地或共享盘，**永不 git 入库**（任何目录）。
- 反面教材：旧工程 444MB `work/` 截图垃圾进了仓库。
- 需要随问题反馈附图的，贴到反馈消息里（见 `docs/collaboration.md` 问题反馈模板），不是提交到仓库。

## 禁止事项

- 不要拿不同机位/不同分辨率的图做对比。
- 不要靠肉眼「我觉得差不多」下结论——PSNR/MAE 说话。
- 不要把对比产物 commit 进仓库。
- 不要为了「让对比通过」去前端代码里调参——差异归因到数据就改数据，归因到映射就提给甲方改 renderer。
