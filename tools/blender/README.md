# Prism Blender 导出器

`prism_export.py` 把 Blender 场景一键导出为 Prism 场景包：
`scene.glb` + `scene.prism.json`（schema v1）+ `export-report.json`。
前端渲染器完全由这些数据驱动，导出器本身不含任何校准值。

## 环境要求

- **Blender ≥ 4.0**。材质解析按 Principled BSDF v2 的输入名读取
  （`Base Color` / `Metallic` / `Roughness` / `IOR` / `Alpha` /
  `Transmission Weight` / `Coat Weight` / `Emission Color` / `Emission Strength`）。
  Blender 3.x 的节点输入名不同（如 `Transmission`），导出的材质字段会缺失。
- 导出前建议 **File → External Data → Pack All Into .blend** 打包贴图。

## 使用方式

### 方式一：Blender UI

1. 打开你的 `.blend` 场景；
2. 切到"脚本（Scripting）"工作区，打开 `prism_export.py`；
3. 点"运行脚本（Run Script）"；
4. 输出在 `.blend` 同目录的 `prism_export/`。

### 方式二：命令行后台

```bash
blender --background scene.blend --python prism_export.py -- --out ./out
```

- `--out` 指定输出目录，省略时默认 `<blend 同目录>/prism_export/`；
- 运行结束会在控制台打印三个输出文件的绝对路径、统计与警告
  （`PRISM_GLB_WRITTEN=` / `PRISM_JSON_WRITTEN=` / `PRISM_STATS=` / `PRISM_WARNING=`）。

## 输出物

| 文件 | 内容 |
| --- | --- |
| `scene.glb` | 官方 glTF 导出器产出的二进制场景，贴图打包内嵌（glTF 标准 y-up） |
| `scene.prism.json` | schema v1 数据：色彩管理（toneMapping）、相机、灯光、材质、对象、环境（HDRI）、资源清单。**坐标一律为 Blender 原始坐标系（Z-up 右手），浮点取整 5 位小数**，坐标转换由前端统一处理 |
| `export-report.json` | Blender name ↔ 稳定 id 映射、警告列表、相机/灯/材质/对象数量统计 |

## 常见问题

### `.001` 重名警告

`Cube.001`、`Material.002` 这类名字是 Blender 自动重命名的产物，通常意味着
场景里存在重名资源（常见于追加/复制后）。导出器会对每个此类资源给出警告：
请在 Outliner 里把重名资源改名或清理后重新导出，否则 id 会带 `-2` 后缀，
后续在编辑器里对不上号。

### 材质字段缺失

如果 `scene.prism.json` 里某个材质的 `pbr` 字段不全，多半是两种原因：

1. 该参数被贴图/程序节点**连线驱动**——这是正常的，贴图随 GLB 走，
   prism.json 只导出常量参数；
2. 场景是 Blender 3.x 制作的，Principled 输入名与 4.x 不一致。

### 哪些效果能进 GLB，哪些不能（能力矩阵）

glTF 是 PBR 材质交换格式，不是 Cycles 节点图格式。Cycles 节点图里的
噪声/程序纹理/复杂混合**必须烘焙成贴图**才能进 GLB：

| 类别 | 内容 | 去向 |
| --- | --- | --- |
| **能直接导出** | Principled BSDF 常量参数、图片贴图（Base Color/Normal/ORM 等）、网格、相机、灯光、World HDRI | GLB + prism.json |
| **必须烘焙** | Noise/Voronoi/Wave 等程序纹理、Bake 节点、多层 Mix Shader 颜色混合、程序位移 | 在 Blender 里烘焙成图片贴图后重新导出 |
| **前端负责** | 体积雾（World Volume）、Bloom/AO 等后期、程序化天空、Layer Weight 多层玻璃（prism.json 的 `glass` 扩展由前端 TSL 复建） | schema 数据 + renderer-core |

完整能力矩阵与校验方法见 `tools/visual-regression/` 和
`docs/data-contract.md`。

### Layer Weight 玻璃

导出器会识别"Layer Weight + Glass BSDF 混合"的节点图，在材质条目里写入
`glass: {"type": "layer-weight", "layers": N}`，前端按 layer-weight 模型复建。
普通 Principled 玻璃请直接用 `Transmission Weight`，glTF 原生支持。
