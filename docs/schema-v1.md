# Prism Scene 契约 v1（`prism-scene` / `version: 1`）

这份文档是甲方前端与乙方设计师之间的**唯一数据契约**的人读说明。机器读定义在
`packages/scene-schema/src/`（zod strict schema），离线校验用
`packages/scene-schema/json-schema/prism-scene-v1.json`（自动生成）。三者口径不一致时，
以 zod schema 为准，并视为文档/产物过期需要重新生成。

- 交付物：单个 `*.prism.json` 文件 + 其引用的外部资源（GLB / EXR）。
- 生产者：设计师的 Blender 导出器（`tools/blender/prism_export.py`）。
- 消费者：Prism Studio 编辑器与 `@prism/renderer-core`。

---

## 1. 设计原则（先读这个，再写字段）

### 1.1 数据驱动铁律

渲染效果只允许来自两个地方：

1. **场景包数据**（本契约的字段）；
2. **代码里显式声明的默认预设**（renderer-core 的 `EDITOR_DEFAULTS`，数据缺省时兜底，显式可查）。

不允许第三种来源：不允许"看着调出来的魔法数字"，不允许材质名/对象名**关键词启发式**
（旧工程里"名字含 glass 就把 metalness 拉到 0.8"这类分支一律禁止）。
想调效果 → 改数据（在编辑器里调完导出），不是改代码。

### 1.2 单一换算层

数据**永远**保持 Blender 坐标系、公制物理单位：

- 坐标系：`coordinateSystem: "blender"`（Z 向上、右手系），transform 原样存 Blender 世界矩阵；
- 单位：`units: "metric"`，长度一律米，角度一律度，光功率一律瓦特。

任何坐标系转换、单位换算、FOV 推导**只允许发生在 renderer-core 的 convert 层**。
导出器不要"帮忙"转坐标；数据里也不要出现 fov、web 单位强度这类二次换算字段。

### 1.3 稳定 id 主键

- 每个相机/灯光/材质/对象条目都有 `id` 与 `name`：
  - `id`：**场景内唯一主键**，稳定、机器用（推荐用 `makeId(name)` 生成 slug，冲突时由导出器追加短 hash）；
  - `name`：显示名，通常即 Blender 里的名字，可以重复、可以是中文，但**不要拿 name 当键**。
- 与 GLB 内容的绑定走 `match.names`（显式名称列表），见 §3.8/§3.9。

### 1.4 strict 契约与显式版本

- 每个对象都是 strict 模式：**多写字段就是错误**（防止拼错的字段被静默忽略）；
- `format: "prism-scene"` + `version: 1` 必填，校验器先查身份再查字段；
- 破坏性变更升 `version`；新增可选字段不需要升版本。

### 1.5 浮点取整

落盘 JSON 中所有浮点数**取整到 5 位小数**（`serializeScenePackage` 自动处理）。
二进制浮点会带进 `0.10000000149011612` 这类噪声（旧工程教训），不干净的数据无法 diff、无法评审。

---

## 2. 文件形态与顶层结构

```jsonc
{
  "format": "prism-scene",          // 必填，固定值
  "version": 1,                     // 必填，固定值
  "meta": { /* … */ },
  "coordinateSystem": "blender",    // 固定值
  "units": "metric",                // 固定值
  "assets": { /* … */ },
  "renderer": { /* … */ },
  "post": { /* … */ },
  "environment": { /* … */ },
  "cameras": [ /* … */ ],
  "lights": [ /* … */ ],
  "materials": [ /* … */ ],
  "objects": [ /* … */ ],
  "probes": { /* … */ }             // 可选，v1 仅占位
}
```

完整可运行的两个例子在 `packages/scene-schema/examples/`：
`minimal.scene.json`（最小有效包）与 `full.scene.json`（全字段演示）。

**通用数据类型约定**

| 类型 | 写法 | 例子 |
| --- | --- | --- |
| 颜色 | `"#rrggbb"` 六位十六进制字符串 | `"#ff8800"` |
| 变换矩阵 | 16 个数字的数组，**列主序** 4×4，Blender 坐标系 | `[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]` |
| 欧拉角 | `[x, y, z]` 三个数字，单位**度** | `[0, 0, 35]` |
| 角度字段 | 数字，单位度，字段名带 `Deg` 后缀 | `angleDeg: 45` |
| 长度字段 | 数字，单位米（相机参数为毫米，字段名带 `Mm` 后缀） | `clipNear: 0.1` |
| id | 非空字符串，场景内唯一 | `"light-sun-key"` |

---

## 3. 逐节字段说明

### 3.1 `meta`（必填）——元信息，不参与渲染

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 必填 | 场景名称（显示用） |
| `sourceBlend` | string | 可选 | 源 `.blend` 文件，便于回查 |
| `exportedAt` | string | 可选 | 导出时间，ISO 8601（如 `2026-01-01T08:00:00Z`） |
| `exporterVersion` | string | 可选 | 导出器标识与版本（如 `prism-export 0.1.0`） |

### 3.2 `assets`（必填）——外部资源

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `model` | AssetRef | 必填 | 几何模型（GLB） |
| `environment` | AssetRef | 可选 | 环境贴图（EXR/HDR），`environment.type` 为 `hdri` 时通常应有 |

`AssetRef`：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `url` | string | 必填 | 资源地址（相对场景包路径或 URL），非空 |
| `sha256` | string | 可选 | 内容 SHA-256（64 位十六进制），用于完整性校验与缓存 |

### 3.3 `renderer`（必填）——渲染器配置

`renderer.toneMapping`（必填）：

| 字段 | 类型 | 单位 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | enum | — | 必填 | `AgX` / `ACESFilmic` / `Neutral` |
| `exposureStops` | number | 档（stops） | 必填 | 曝光调整，0 不调整，+1 亮一倍 |

`renderer.colorGrading`（可选）——省略整节等价于全 0：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `contrast` | number | 0 | 对比度 |
| `saturation` | number | 0 | 饱和度 |
| `whiteBalance` | number | 0 | 白平衡偏移（负冷正暖） |
| `highlights` | number | 0 | 高光调整 |
| `shadows` | number | 0 | 阴影调整 |

`renderer.shadows`（必填）——阴影全局设置：

| 字段 | 类型 | 单位 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `mapSize` | int | 像素 | 必填 | 主阴影贴图边长；**> 4096 触发性能 warning**，建议 2048/4096 |
| `bias` | number | — | 必填 | 深度偏移，消除阴影痤疮 |
| `normalBias` | number | — | 必填 | 法线偏移，消除漏光/条纹 |
| `radius` | number | 像素 | 必填 | PCF 软化半径（≥0），越大越柔 |
| `primaryLightId` | string | — | 可选 | 产生主阴影的灯光 id；缺省由渲染器取第一盏投影灯 |

### 3.4 `post`（必填，可为 `{}`）——后期管线

每个效果独立可选；省略即不启用。

`post.bloom`：`enabled`（bool）、`threshold`（亮度阈值）、`strength`（强度）、`radius`（0~1 扩散半径）。

`post.ao`（GTAO）：`enabled`、`strength`（强度）、`radius`（采样半径，米）、`resolutionScale`（分辨率缩放，>0）。

`post.ssgi`（**reserved**）：`enabled`、`strength`、`radius`。
`post.ssr`（**reserved**）：`enabled`、`strength`、`quality`（`low`/`medium`/`high`）。

> reserved = 契约先行落数据，v1 渲染器可以忽略；数据携带是合法的，便于后续版本直接消费。

### 3.5 `environment`（必填）——环境，三选一（`type` 判别）

**`type: "hdri"`**（生产主流）：

| 字段 | 类型 | 单位 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `url` | string | — | 必填 | HDR/EXR 贴图地址 |
| `strength` | number | 倍率 | 必填 | 背景可视强度 |
| `lightingStrength` | number | 倍率 | 必填 | 光照强度（与背景解耦：可只照亮不改背景观感） |
| `rotation` | [x,y,z] | 度 | 必填 | 贴图旋转（欧拉角） |
| `visibleBackground` | object | — | 可选 | `{type:"texture", url?}` 或 `{type:"color", color?}`：背景贴图原样显示或换纯色 |
| `fog` | object | — | 可选 | 见下方 fog 表 |

**`type: "procedural-sky"`**（程序化天空）：

| 字段 | 类型 | 单位 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `sunElevationDeg` | number | 度 | 必填 | 太阳高度角 |
| `sunAzimuthDeg` | number | 度 | 必填 | 太阳方位角（0 正北，顺时针） |
| `turbidity` | number | — | 可选 | 大气浑浊度 |
| `lightingStrength` | number | 倍率 | **1** | 天空光照（IBL）强度：天穹烘焙成 `scene.environment` 后的 `environmentIntensity`（v1.1 新增可选字段，旧场景包向后兼容） |
| `fog` | object | — | 可选 | 见下方 fog 表 |

**`type: "physical-atmosphere"`**（**experimental**，参数与实现可能随版本调整）：

| 字段 | 类型 | 单位 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `geo.latitudeDeg` | number | 度 | 必填 | 地理纬度，-90~90 |
| `geo.longitudeDeg` | number | 度 | 必填 | 地理经度，-180~180 |
| `fog` | object | — | 可选 | 见下方 fog 表 |

三种环境共用的 `fog`（线性雾）：

| 字段 | 类型 | 单位 | 说明 |
| --- | --- | --- | --- |
| `enabled` | bool | — | 开关 |
| `color` | color | — | 雾颜色 |
| `near` | number | 米 | 雾起始距离 |
| `far` | number | 米 | 雾完全遮蔽距离 |

### 3.6 `cameras[]`（必填数组，可为空）——物理相机

| 字段 | 类型 | 单位 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | — | 必填 | 稳定 id，唯一主键 |
| `name` | string | — | 必填 | 显示名 |
| `transform` | number[16] | — | 必填 | 世界矩阵，列主序，Blender 坐标系 |
| `lensMm` | number | 毫米 | 必填 | 焦距（>0） |
| `sensorWidthMm` | number | 毫米 | 必填 | 传感器宽度（>0，Blender 默认 36） |
| `sensorFit` | enum | — | 必填 | `auto` / `horizontal` / `vertical` |
| `clipNear` | number | 米 | 必填 | 近裁剪面（>0） |
| `clipFar` | number | 米 | 必填 | 远裁剪面（>0） |
| `isDefault` | bool | — | 可选 | 默认相机标记，全场至多一个 |

> 数据里**不存 fov**：FOV 由 renderer-core 按 `lensMm + sensorWidthMm + sensorFit` 与视口宽高比换算（单一换算层）。

### 3.7 `lights[]`（必填数组，可为空）——灯光

| 字段 | 类型 | 单位 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | — | 必填 | 稳定 id，唯一主键 |
| `name` | string | — | 必填 | 显示名 |
| `type` | enum | — | 必填 | `sun` / `point` / `spot` / `area` |
| `color` | color | — | 必填 | 灯光颜色 |
| `energyWatts` | number | 瓦特 | 必填 | 物理功率（≥0）；sun 为辐照度 W/m²，与 Blender sun strength 一致 |
| `intensityScale` | number | 倍率 | **1** | 最终强度 = `energyWatts × intensityScale`；编辑器调光只改它 |
| `transform` | number[16] | — | 必填 | 世界矩阵，列主序，Blender 坐标系 |
| `shadow` | object | — | 可选 | 单灯阴影覆盖，见下表 |
| `spot` | object | — | 可选 | 聚光灯参数（`type:"spot"` 时应携带） |
| `area` | object | — | 可选 | 面光参数（`type:"area"` 时应携带） |

`shadow`（缺省字段回落到 `renderer.shadows` 全局设置）：

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `castShadow` | bool | 必填 | 是否投影 |
| `mapSize` | int | 可选 | 单灯阴影贴图边长；**> 4096 触发性能 warning** |
| `bias` / `normalBias` / `radius` | number | 可选 | 同全局设置口径 |

`spot`：`angleDeg`（聚光锥全角，度，>0，必填）、`blend`（边缘柔化 0~1，可选）。
`area`：`width`、`height`（米，>0，均必填）。

### 3.8 `materials[]`（必填数组，可为空）——材质覆盖

GLB 导出的 PBR 参数是基准，本表只做**覆盖**；缺省字段 = 沿用 GLB 原值。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 必填 | 稳定 id，唯一主键 |
| `name` | string | 必填 | 显示名 |
| `match.names` | string[] | 必填 | 显式绑定的 GLB 材质名列表；**为空数组触发 warning**（匹配不到任何东西） |
| `pbr` | object | 可选 | PBR 覆盖参数，见下表 |
| `glass` | object | 可选 | 程序化玻璃（layer-weight），见下表 |

`pbr`（全部可选；对应 Principled BSDF 口径）：

| 字段 | 类型 | 取值 | 说明 |
| --- | --- | --- | --- |
| `baseColor` | color | — | 基础色 |
| `opacity` | number | 0~1 | 不透明度 |
| `metalness` | number | 0~1 | 金属度 |
| `roughness` | number | 0~1 | 粗糙度 |
| `ior` | number | ≥1 | 折射率（默认 1.5） |
| `transmission` | number | 0~1 | 透射率 |
| `thickness` | number | ≥0 米 | 体积厚度，配合 transmission |
| `dispersion` | number | ≥0 | 色散强度，对应 `material.dispersion`；仅 transmission > 0 时可见（v1.1 新增，向后兼容） |
| `attenuationColor` | color | — | 体积衰减色（Beer 定律），配合 transmission/thickness（v1.1 新增，向后兼容） |
| `attenuationDistance` | number | >0 米 | 体积衰减距离，对应 `material.attenuationDistance`（v1.1 新增，向后兼容） |
| `clearcoat` | number | 0~1 | 清漆强度 |
| `clearcoatRoughness` | number | 0~1 | 清漆粗糙度 |
| `emissive` | color | — | 自发光颜色 |
| `emissiveIntensity` | number | ≥0 | 自发光强度倍率 |
| `alphaMode` | enum | `opaque`/`blend` | 混合模式 |

`glass`（程序化镀膜玻璃，由 renderer-core 用 TSL 复建，参数全部来自数据）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | `"layer-weight"` | 固定值 |
| `layers` | array | 至少一层：`[{ior: ≥1, color: "#rrggbb"}, …]`，顺序即层叠顺序 |

### 3.9 `objects[]`（必填数组，可为空）——对象级覆盖

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 必填 | 稳定 id，唯一主键 |
| `name` | string | 必填 | 显示名 |
| `match.names` | string[] | 必填 | 显式绑定的 GLB 对象/网格名；**为空数组触发 warning** |
| `visible` | bool | 可选 | 可见性覆盖 |
| `castShadow` | bool | 可选 | 投影开关覆盖 |
| `receiveShadow` | bool | 可选 | 接收阴影开关覆盖 |

### 3.10 `probes`（可选）——反射探针占位

`reflection?: unknown[]`、`planar?: unknown[]`。**v1 仅保留位**：条目结构后续版本定义，
渲染器 v1 忽略；strict 校验允许数组里放任意内容。

---

## 4. 与旧乙方工程 6 种 JSON 的对照

旧工程（`threejs-webgpu-editor-core`）并存至少 6 种 JSON 形态（`render_config.json`、
`final-portable-*.json`、`江苏银行-webgpu.json`、work/ 下多代 profile 文件……），
无 `format`/`version` 靠字段嗅探区分。v1 不做兼容导入，设计师用新导出器重新导出，干净起步。对照如下：

| 旧工程做法 | schema v1 | 为什么 |
| --- | --- | --- |
| 灯光双单位：`energy: 10`（瓦特）+ `webIntensity: 0.12`（无量纲，前端另算） | 单一 `energyWatts × intensityScale`（默认 1） | 一个强度只能有一个口径；物理值不动，调光只改倍率 |
| 同义字段不同名：`webgpuMaterials` vs `webgpuMaterialOverrides` | 唯一 `materials[]` | 同义词靠运行时猜，错一个名字就静默失效 |
| 中文显示名当主键（`"name": "灯光_总览_01"` 直接做键） | 稳定 `id` 主键 + `name` 仅显示 + `match.names` 显式绑定 | 改名即断链；显示名从来不是好键 |
| 变换三份冗余：`location` + `rotationEuler` + 行主序嵌套 `matrixWorld` | 唯一 `transform`：列主序 16 数组 | 冗余必然不一致；一种矩阵一种序 |
| 无 `format`/`version`，靠"有哪些字段"嗅探格式 | `format: "prism-scene"` + `version: 1` 必填，校验器先查身份 | 嗅探在字段演进后必然误判 |
| Bloom/雾/GTAO/色调映射/大气参数硬编码在 `main.js`，JSON 里根本没有 | 全部进 `post` / `environment` / `renderer` 数据 | 效果不可评审、不可复现、设计师改不了 |
| 相机 fov 与 matrix 混用、`camera`/`blenderCamera` 双段并存 | 唯一 `cameras[]`：物理参数 `lensMm + sensorWidthMm + sensorFit`，fov 只在渲染层换算 | 单一换算层，不在数据里存推导结果 |
| snake_case / camelCase 混用、`SUN`/`sun` 大小写混用 | 全量 camelCase；枚举一律小写（`sun`/`point`/`spot`/`area`） | 口径统一，机器与人都不用猜 |

---

## 5. 校验器用法

```ts
import { validateScenePackage } from '@prism/scene-schema';

const result = validateScenePackage(JSON.parse(fileText));
// result.ok      —— 没有任何 error 时为 true（warning 不阻断）
// result.issues  —— [{ path, message, severity: 'error' | 'warning' }]，message 为中文人读
// result.data    —— 结构校验通过时提供（带默认值补全），可直接交给渲染器
```

校验分三层，任一层的 error 都会让 `ok === false`：

1. **身份检查**：`format`/`version` 缺失或不匹配（消息里会写明当前支持的版本）；
2. **结构校验**（zod strict）：类型错误、缺必填字段、枚举取值非法、**多余字段**；
3. **语义规则**：见下表。

| 规则 | 级别 | 说明 |
| --- | --- | --- |
| `id` 重复（跨 cameras/lights/materials/objects 全局查重） | error | id 是唯一主键，重名会导致覆盖错乱 |
| `shadow.mapSize > 4096`（全局或单灯） | warning | 显存随边长平方增长，低端设备卡顿风险 |
| `match.names` 为空数组 | warning | 该条覆盖匹配不到任何 GLB 条目 |
| `id`/`name`/`match.names` 带 Blender 自动重命名后缀（`.001` 等） | warning | 说明 .blend 里有同名条目，回 Blender 清理后重新导出 |

**常见错误速查**

| 报错消息（摘录） | 原因与处理 |
| --- | --- |
| `format 缺失或不匹配：应为 "prism-scene"` | 文件不是场景包或 format 写错；旧工程 JSON 请用新导出器重新导出 |
| `version 缺失或不匹配：应为 1` | 契约版本不符，用对应版本导出器重新导出 |
| `存在契约未声明的多余字段："webIntensity"` | strict 模式：删掉该字段或检查拼写；旧字段名见 §4 对照表 |
| `缺少必填字段（应为数字）` 于 `lights.0.energyWatts` | 灯光缺物理功率，导出器应始终写出 |
| `颜色格式不正确：应为 "#rrggbb"` | 颜色写成数组/英文名/三位 hex；统一六位 hex 字符串 |
| `transform 必须是 16 个数字组成的数组` | 矩阵写成了嵌套数组或行主序截断；列主序 4×4 展开 |
| `取值不合法：只允许 "AgX" / "ACESFilmic" / "Neutral"` | toneMapping.type 枚举非法（注意大小写） |

---

## 6. 离线校验：JSON Schema

不用 TS 的协作者（如设计师的 Python 工具链）用生成的 JSON Schema 离线校验：

```bash
pnpm --filter @prism/scene-schema build
# 产物：packages/scene-schema/json-schema/prism-scene-v1.json（draft 2020-12，自动生成勿手改）
```

配合任意 JSON Schema 校验器（Python `jsonschema`、VS Code YAML/JSON 插件、`ajv` 等）即可
在导出流水线里卡口。注意 JSON Schema 表达的是**结构**；§5 的语义规则（id 查重、
性能 warning 等）只有 `validateScenePackage` 提供，编辑器校验面板以它为准。

---

## 7. 序列化与导出规范

```ts
import { serializeScenePackage } from '@prism/scene-schema';
const text = serializeScenePackage(pkg); // 2 空格缩进，末尾换行，浮点统一取整 5 位小数
```

- 所有落盘的 `*.prism.json` **必须**经 `serializeScenePackage` 输出（或严格等价实现）：
  浮点 5 位取整、2 空格缩进、末尾换行——保证 diff 干净、可评审；
- 导出器同时应输出一份 mapping 报告（Blender name ↔ 稳定 id，`.001` 重命名警告）；
- 资源引用（`assets.*.url`、`environment.url`）用相对场景包的路径，保证整包可搬运。
