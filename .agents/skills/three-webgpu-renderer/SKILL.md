---
name: three-webgpu-renderer
description: "@prism/renderer-core 渲染核架构与开发约束。修改 packages/renderer-core 时加载：模块划分、数据流（validateScenePackage → loadPackage → 分区 update）、数据驱动铁律 ✅/❌ 代码对比、TSL/WebGPU 注意点、性能红线、window.__PRISM__ 调试 API。"
user-invocable: true
---

# 渲染核开发指南

本 Skill 是 `@prism/renderer-core`（Three.js WebGPU 渲染核，纯 TS + three@0.184，无 React）的架构与约束。工程通用约定见 `prism-patterns`；契约字段见 `docs/schema-v1.md`；契约演进见 `scene-schema-evolution`。

## 模块图

```
packages/renderer-core/src/
├── core/          # PrismRenderer 类：mount(canvas) / loadPackage(json, glb) / 分区 update / dispose
├── convert/       # 唯一换算层：Blender Z-up→Three Y-up、matrix、相机 FOV（含 sensorFit）
├── loaders/       # GLB/EXR 加载、assets 的 sha256 校验
├── environment/   # hdri / procedural-sky / physical-atmosphere、雾
├── lighting/      # sun/point/spot/area、阴影按需重建与 bootstrap
├── materials/     # PBR 覆盖、Layer Weight 三层玻璃 TSL、emissive 扩展
├── pipeline/      # 后期 MRT 三掩码结构：bloom / GTAO / 色彩分级 / tone mapping
└── presets.ts     # EDITOR_DEFAULTS：数据缺省时的兜底预设（逐条带注释）
```

## 数据流

```
validateScenePackage(json)        # @prism/scene-schema，人读错误列表（编辑器校验面板）
      ↓ 通过
PrismRenderer.loadPackage(json, glb)
      ↓
分区更新：updateEnvironment / updateLighting / updatePost
      ↓
dispose()
```

- 编辑器面板调参后只调对应分区 update，不整包 reload。
- convert 是唯一允许做坐标/单位换算的模块；其它模块拿到的必须是 Three 世界（Y-up）。
- 后期管线按 `post` 数据装配：bloom / GTAO / 色彩分级 / tone mapping；SSGI/SSR v1 只留接口与 schema 字段，不实现。

## 数据驱动铁律（本包最高约束）

**视觉参数只有两个合法来源：①schema 数据；②`presets.ts` 里带注释声明的 `EDITOR_DEFAULTS`（数据缺省时兜底，显式可查）。**

### 禁止名字启发式

```ts
// ❌ 永远禁止：材质名/对象名关键词分支
if (material.name.includes('玻璃')) {
  material.metalness = 0.8;
}

// ✅ 显式映射：schema 里 materials[].match.names 声明哪些 GLB 材质应用这份覆盖
for (const override of pkg.materials) {
  for (const glbMaterial of resolveByNames(materialIndex, override.match.names)) {
    applyPbrOverride(glbMaterial, override);
  }
}
```

### 禁止魔法数字

```ts
// ❌ 来路不明的视觉常量
bloomPass.strength = 0.45;
scene.fog = new Fog(0x9db4c8, 30, 220);

// ✅ 数据优先，缺省回退 EDITOR_DEFAULTS（presets.ts 注释里写明为什么是兜底）
const strength = pkg.post.bloom.enabled
  ? pkg.post.bloom.strength
  : EDITOR_DEFAULTS.post.bloom.strength;
```

### 禁止双单位与前端随机

- 灯光强度一律 `energyWatts × intensityScale`（默认 1），不允许第二套无量纲强度。
- `Math.random()` 不出现在渲染路径（旧工程随机种子写死的程序化绿化是反面教材）；需要分布的效果在 Blender 里烘焙进 GLB。

## TSL / WebGPU 注意点

- three@0.184 WebGPU 渲染器 + TSL 节点材质；不要回退去写 GLSL 字符串材质。
- 材质扩展（玻璃 layer-weight/iridescence、emissive）用节点组合，参数全部来自数据。
- **阴影初始化有时序问题**：阴影按需重建，必须走 bootstrap 处理（移植自旧工程验证过的实现），不要在首帧直接开全量阴影。
- WebGPU 优先；浏览器不支持时**明确报错提示**，不要静默降级出错误画面。
- 相机 FOV 换算要处理 `sensorFit`；convert 层配了 Vitest 单测，改换算逻辑前先跑测试。

## 性能红线

| 项 | 红线 |
|---|---|
| 阴影贴图 | 按场景包围盒分级 2048/4096，**禁止写死 8192** |
| 后期 | 按 `post.*.enabled` 装配，关了就真的不建 pass |
| resolutionScale | 设下限，禁止无限制超采样 |
| SSGI/SSR | v1 留接口与 schema 字段，不实现 |

## 调试

- 开发态挂 `window.__PRISM__` 调试 API：renderer 实例、场景统计、当前生效参数来源。
- 排查「这个参数从哪来」先看 `__PRISM__`：任何生效值都应能指回 schema 字段或 EDITOR_DEFAULTS 条目，指不出的就是违规。

## 禁止事项与自检

完整规则在根 `AGENTS.md`「数据驱动铁律」一节。提交本包代码前必跑（grep 必须零命中）：

```bash
grep -rn "\.name\.includes\|\.name\.match" packages/renderer-core/src --include="*.ts"
grep -rn "Math\.random" packages/renderer-core/src
grep -rn "0x[0-9a-fA-F]\{6\}" packages/renderer-core/src | grep -v EDITOR_DEFAULTS

pnpm --filter @prism/renderer-core test
```
