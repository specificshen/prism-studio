# 视觉回归（visual-regression）

用数据证明"前端渲染 = Blender 渲染"：Cycles 渲染参考图 → 编辑器同机位截图 →
逐像素指标对比 → 阈值判定（可进 CI）。

## 依赖

`compare.py` 仅需 Pillow（`capture_reference.py` 运行在 Blender 自带 Python 内，无需安装）：

```bash
pip install Pillow
```

## 完整工作流

### 1. Cycles 渲染参考图

```bash
blender --background scene.blend \
  --python tools/visual-regression/capture_reference.py -- \
  --camera Camera --out work/reference.png --samples 256 --resolution 1280x720
```

- `--camera`：`scene.prism.json` 里 `isDefault: true` 的那台相机（或任一相机名）；
- `--samples` 建议 ≥ 256，噪点会拉低 PSNR、造成误判；
- 色彩管理沿用场景设置，与 `prism.json` 的 `renderer.toneMapping` 一致。

### 2. 编辑器同机位截图

在 Prism Studio 编辑器里导入同一场景包，切到同一台相机，
以**相同分辨率**（1280x720）截取视口，保存为 `work/shot.png`。

### 3. 对比与判定

```bash
python3 tools/visual-regression/compare.py work/reference.png work/shot.png \
  --json work/report.json
```

输出指标：

| 指标 | 含义 | 用途 |
| --- | --- | --- |
| PSNR（dB） | 峰值信噪比，逐像素误差 | 主判定指标，默认阈值 **28dB**（`--threshold` 可配） |
| MAE（0~1） | 平均绝对误差 | 辅助看整体偏差量级 |
| 亮度均值 + P5/P25/P50/P75/P95 | sRGB 亮度直方图分位数对比 | 定位"整体偏亮/偏暗"（曝光、tone mapping 不一致的特征） |

退出码：PSNR ≥ 阈值为 0，否则为 1——CI 直接拿退出码 gate。

### 判定标准参考

- **PSNR ≥ 35dB**：像素级一致，仅采样噪声差异；
- **28 ~ 35dB**：通过。常见于抗锯齿/降噪器差异，肉眼无感；
- **< 28dB**：不通过。先看亮度分位数——整体偏移是曝光/toneMapping 问题；
  分位数一致但 PSNR 低，查几何对位（相机转换）与阴影。

## 工作产物不入库

`work/` 目录（参考图、截图、报告、合成大图）**一律不进 git**——
根 `.gitignore` 已忽略 `work/`。旧工程把 444MB 截图产物提交入库是反面教材：
回归图是"用完即弃"的工作产物，入库的只有脚本与阈值约定。
