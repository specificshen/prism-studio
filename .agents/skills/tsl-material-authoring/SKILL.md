---
name: tsl-material-authoring
description: 在 @prism/renderer-core 新增或修改自定义 TSL 材质（glass 判别联合的新类型、layer-weight 玻璃调整）时加载：决策前置三问、materials/tsl/ 扩展点结构、以 layer-weight 为范本的开发六步流程、r185 真实 TSL 插槽速查与经典属性覆盖关系、数据驱动铁律适配、node 冒烟与 window.__PRISM__ 调试。
user-invocable: true
---

# 自定义 TSL 材质开发指南

本 Skill 是「给渲染核加自定义 TSL 材质」的操作手册，范本是被验证过的 `layer-weight` 多层镀膜玻璃。渲染核整体架构见 `three-webgpu-renderer`；schema 字段变更必须走 `scene-schema-evolution` 六步流程；最终效果对标验收走 `visual-regression`。

## 决策前置三问

写一行 TSL 之前，按顺序回答三问，任一为「是」就停手：

1. **GLB 的 PBR 或 `pbr` 覆盖能解决吗？** MeshPhysicalMaterial 原生属性（transmission/dispersion/attenuation/clearcoat/iridescence……）能表达的，一律走 `materials[].pbr` 数据，不写节点。
2. **该在 Blender 里烘焙吗？** 视角无关的颜色/图案/分布类效果（纹理、顶点色、烘焙 AO）属于内容，归 Blender 烘进 GLB，不归前端 shader。
3. **都不行的才写自定义 TSL。** 判据：效果视角相关（菲涅尔类）、无法烘焙，且**全部参数能用 schema 数据表达**。三个条件缺一就回到前两问。

## 扩展点结构

```
packages/renderer-core/src/materials/
├── apply-materials.ts   # match.names 精确匹配 + 升级 MeshPhysicalMaterial + pbr 白名单；玻璃改由 installGlass 分发
└── tsl/
    ├── registry.ts           # TslGlassInstaller 签名 + glassInstallers 注册表 + installGlass 分发（未知类型中文 warning，不抛错）
    ├── layer-weight-glass.ts # 范本：多层镀膜玻璃 installer
    └── fresnel.ts            # 可复用菲涅尔：节点版（TSL 图）+ 标量版（CPU 标定）同一套数学
```

- 统一签名：`type TslGlassInstaller = (material: MeshPhysicalMaterial, config: GlassOverride) => void`。
- `installGlass(material, glass)` 按 `glass.type` 查表分发；契约先于渲染核演进时（未知类型）给中文 warning 静默容错，不抛错、不出错误画面。
- apply-materials 里的顺序固定：**先 pbr 后 glass**。glass installer 写节点槽位（`colorNode`/`iorNode`），layer-weight 的法向入射标定以 pbr 覆盖后的 `material.color` 为基准；节点槽位在节点材质里又优先于 pbr 写的经典标量槽——换序两边都会错。

## 开发六步流程（以 layer-weight 为范本）

### ① schema 判别联合加类型/参数

`glassSchema` 是 `type` 判别联合的演化位：新玻璃类型在 `packages/scene-schema/src/material.ts` 加新 `z.literal` 分支与参数对象。**完整走 `scene-schema-evolution` 六步**（zod → JSON Schema → docs → 导出器 → 渲染核 → examples），这里不重复。

### ② `materials/tsl/` 新模块

每类型一个文件，导出符合 `TslGlassInstaller` 签名的函数。参数**只**从 `config`（schema 数据）取；可复用的纯数学（如菲涅尔）抽成节点版 + 标量版双形态（见 `fresnel.ts`），标量版供 CPU 侧标定与单测。

### ③ registry 注册

`glassInstallers` 加一行 `'new-type': installNewTypeGlass`。apply-materials 的接线到此为止——匹配/升级/报告逻辑不需要动。

### ④ 确认与 pbr 覆盖的共存

节点槽位与经典属性槽不是同一个存储：pbr 写 `material.color` 等标量，TSL installer 写 `material.colorNode` 等节点。保持「pbr 先、glass 后」的顺序（原因见上节），不要在新 installer 里误清 pbr 已写的属性。

### ⑤ Blender 导出器补数据（若参数来自 .blend）

`tools/blender/prism_export.py` 只搬数据不内嵌校准值。纯前端推导的参数（如法向入射标定）不需要导出器配合，在 installer 内由数据计算。

### ⑥ 视觉回归校准

效果类改动必须过 `visual-regression` 四步：Cycles 参考图 → 编辑器同机位截图 → `compare.py` 像素对比（默认阈值 PSNR ≥ 28dB）→ 归因。工作产物不入库。

## TSL 插槽速查表（three r185，以 @types/three 为准）

GLB 经典材质在 WebGPU 下由 `StandardNodeLibrary.fromMaterial` 枚举拷贝为 `MeshPhysicalNodeMaterial`，**提前挂在经典材质上的节点槽位会被一并带走**（r185 已实证，见调试节）。覆盖语义统一为：`xxxNode !== null` 时接管，否则回退经典属性（`MaterialReferenceNode` 每帧读 `material.xxx`）。

| 插槽 | 接管什么 | 回退的经典属性 |
| --- | --- | --- |
| `colorNode` | diffuse 颜色（float/vec2/vec3/vec4 均可） | `color` × `map` |
| `roughnessNode` / `metalnessNode` | 粗糙度 / 金属度 | `roughness`/`roughnessMap`、`metalness`/`metalnessMap` |
| `normalNode` | 着色法线（视图空间） | `normalMap` |
| `emissiveNode` | 自发光辐射 | `emissive` × `emissiveMap` × `emissiveIntensity` |
| `opacityNode` | 不透明度 | `opacity` × `alphaMap` |
| `iorNode` | 折射率（同时驱动镜面 F0 与折射） | `ior` |
| `transmissionNode` / `thicknessNode` | 透射率 / 体积厚度 | `transmission`、`thickness` |
| `attenuationColorNode` / `attenuationDistanceNode` | 体积衰减色 / 距离（Beer 定律） | `attenuationColor`、`attenuationDistance` |
| `dispersionNode` | 色散（仅 transmission > 0 时参与着色） | `dispersion` |
| `clearcoatNode` / `clearcoatRoughnessNode` / `clearcoatNormalNode` | 清漆层 | `clearcoat*` 系列属性 |
| `sheenNode` / `iridescenceNode` / `specularColorNode` / `anisotropyNode` 等 | 对应物理层 | 同名经典属性 |
| `aoNode` / `envNode` | 环境遮蔽 / 环境贴图覆盖（NodeMaterial 级） | `aoMap`、scene.environment |

layer-weight 只用了 `colorNode` + `iorNode` 两个槽位：前者接管着色颜色（视角相关镀膜色），后者把多层 R0 反解成等效 IOR 驱动镜面反射——能用两三个槽位解决的不要铺满全表。

## 数据驱动铁律适配

```ts
// ✅ 参数全部来自 schema 数据
const factors = glass.layers.map((layer) => dielectricFresnelNode(dotNV, layer.ior));

// ❌ shader 里写死视觉常量（等价于魔法数字，铁律第二条）
const ior = float(1.45);
```

另三条在 TSL 场景的具体化：

- **禁 GLSL**：不写 ShaderMaterial/字符串着色器，只用 TSL 节点组合。
- **禁 `Math.random`**：分布类需求回 Blender 烘焙（决策第二问）。
- **禁名字启发式**：installer 由 `glass.type` 分发，材质绑定只走 `match.names` 显式名单，不读材质名内容。

## 调试

- **node 冒烟（非 GPU）**：installer 的标量数学（标定系数、R0 反解、菲涅尔标量版）可直接 `node` 跑脚本断言；`fromMaterial` 枚举拷贝机制同样可在 node 验证——`new MeshPhysicalNodeMaterial()` 后 `for (const key in classic) node[key] = classic[key]`，断言 `useDispersion`、`colorNode` 被带走。node ≥ 22.18 直接 import 包内 TS 亦可。
- **`window.__PRISM__`**：运行时查生效参数来源（见 `three-webgpu-renderer` 调试节）；layer-weight installer 会把 `layers` 写进 `material.userData.prismLayerWeightGlass` 供回查，新 installer 沿用同一约定。
- **GPU 画面问题**不要靠猜：走 `visual-regression` 量化差异再归因。

## 验证命令

```bash
pnpm verify    # 改完必跑的一键门禁（check:ci + typecheck + test + build）

# 开发中的单项快查：
pnpm --filter @prism/scene-schema test    # ① 契约层（含新字段用例）
pnpm --filter @prism/renderer-core typecheck
# 铁律 grep 自检（必须零命中，见 three-webgpu-renderer 文末三条）
```
