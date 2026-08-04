/**
 * 演示场景生成器：程序化生成 apps/editor/public/sample/ 下的
 * sample.glb + sample.prism.json，无需 Blender 即可冒烟渲染核。
 *
 * 用法：node tools/make-sample-scene.mjs   （或 pnpm sample）
 * 依赖：@gltf-transform/core + @gltf-transform/functions（根 devDependencies）
 *
 * 注意坐标约定：GLB 按 glTF 标准（y-up）生成；sample.prism.json 里的
 * 相机/灯光 transform 按契约写成 **Blender 坐标系（Z-up 右手）**，
 * 由渲染核 convert 层统一换算（Blender [x,y,z] → three [x,z,-y]）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Format, NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const SAMPLE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../apps/editor/public/sample',
);
const GLB_FILENAME = 'sample.glb';
const JSON_FILENAME = 'sample.prism.json';

const FLOAT_PRECISION = 5;

/** KHR 扩展补丁：extensions 包不在依赖内，写完 JSON 后按材质名手工补。 */
const KHR_PATCHES = {
  'glass-clear': {
    KHR_materials_transmission: { transmissionFactor: 1 },
    KHR_materials_ior: { ior: 1.5 },
    KHR_materials_volume: { thicknessFactor: 0.5 },
  },
  'emissive-panel': {
    KHR_materials_emissive_strength: { emissiveStrength: 12 },
  },
};

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function round5(value) {
  const result =
    Math.round(value * 10 ** FLOAT_PRECISION) / 10 ** FLOAT_PRECISION;
  return result === 0 ? 0 : result; // 归一 -0
}

function roundFloats(value) {
  if (typeof value === 'number') return round5(value);
  if (Array.isArray(value)) return value.map(roundFloats);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, roundFloats(v)]),
    );
  }
  return value;
}

const degToRad = (deg) => (deg * Math.PI) / 180;

const normalize = ([x, y, z]) => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};

const cross = ([ax, ay, az], [bx, by, bz]) => [
  ay * bz - az * by,
  az * bx - ax * bz,
  ax * by - ay * bx,
];

/** Blender 欧拉 XYZ（度）→ 3x3 旋转矩阵（R = Rz·Ry·Rx，行主序存储）。 */
function eulerBlenderToMat3(xDeg, yDeg, zDeg) {
  const [x, y, z] = [degToRad(xDeg), degToRad(yDeg), degToRad(zDeg)];
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(x),
    Math.sin(x),
    Math.cos(y),
    Math.sin(y),
    Math.cos(z),
    Math.sin(z),
  ];
  // Rx · Ry · Rz 按 Blender Euler 'XYZ'（先 X 后 Z）展开
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}

/** Blender 相机 lookAt：相机 -Z 指向目标，世界 +Z 为上。返回 3x3（列为基向量）。 */
function lookAtBlenderMat3(eye, target) {
  const zAxis = normalize([
    eye[0] - target[0],
    eye[1] - target[1],
    eye[2] - target[2],
  ]);
  const xAxis = normalize(cross([0, 0, 1], zAxis));
  const yAxis = cross(zAxis, xAxis);
  return [
    [xAxis[0], yAxis[0], zAxis[0]],
    [xAxis[1], yAxis[1], zAxis[1]],
    [xAxis[2], yAxis[2], zAxis[2]],
  ];
}

/** 3x3（行主序）+ 平移 → 16 元素列主序矩阵（与 schema transform 一致）。 */
function mat3ToColumnMajor16(m3, translation) {
  return [
    m3[0][0],
    m3[1][0],
    m3[2][0],
    0,
    m3[0][1],
    m3[1][1],
    m3[2][1],
    0,
    m3[0][2],
    m3[1][2],
    m3[2][2],
    0,
    translation[0],
    translation[1],
    translation[2],
    1,
  ];
}

// ---------------------------------------------------------------------------
// 几何体（POSITION + NORMAL + indices，glTF y-up）
// ---------------------------------------------------------------------------

function planeGeometry(width, depth) {
  const hw = width / 2;
  const hd = depth / 2;
  // 法线 +Y；索引顺序保证右手系正面朝上
  return {
    positions: new Float32Array([
      -hw,
      0,
      -hd,
      hw,
      0,
      -hd,
      hw,
      0,
      hd,
      -hw,
      0,
      hd,
    ]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    indices: new Uint16Array([0, 2, 1, 0, 3, 2]),
  };
}

function boxGeometry(size) {
  const h = size / 2;
  // 6 个面 × 4 顶点（独立法线），绕序均为正面朝外
  const faces = [
    {
      n: [1, 0, 0],
      corners: [
        [h, -h, h],
        [h, -h, -h],
        [h, h, -h],
        [h, h, h],
      ],
    },
    {
      n: [-1, 0, 0],
      corners: [
        [-h, -h, -h],
        [-h, -h, h],
        [-h, h, h],
        [-h, h, -h],
      ],
    },
    {
      n: [0, 1, 0],
      corners: [
        [-h, h, h],
        [h, h, h],
        [h, h, -h],
        [-h, h, -h],
      ],
    },
    {
      n: [0, -1, 0],
      corners: [
        [-h, -h, -h],
        [h, -h, -h],
        [h, -h, h],
        [-h, -h, h],
      ],
    },
    {
      n: [0, 0, 1],
      corners: [
        [-h, -h, h],
        [h, -h, h],
        [h, h, h],
        [-h, h, h],
      ],
    },
    {
      n: [0, 0, -1],
      corners: [
        [h, -h, -h],
        [-h, -h, -h],
        [-h, h, -h],
        [h, h, -h],
      ],
    },
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  for (const [faceIndex, face] of faces.entries()) {
    const base = faceIndex * 4;
    for (const corner of face.corners) {
      positions.push(...corner);
      normals.push(...face.n);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

function sphereGeometry(radius, widthSegments = 32, heightSegments = 24) {
  const positions = [];
  const indices = [];
  for (let y = 0; y <= heightSegments; y += 1) {
    const theta = (y / heightSegments) * Math.PI;
    for (let x = 0; x <= widthSegments; x += 1) {
      const phi = (x / widthSegments) * 2 * Math.PI;
      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.cos(theta);
      const nz = Math.sin(theta) * Math.sin(phi);
      positions.push(radius * nx, radius * ny, radius * nz);
    }
  }
  const row = widthSegments + 1;
  for (let y = 0; y < heightSegments; y += 1) {
    for (let x = 0; x < widthSegments; x += 1) {
      const a = y * row + x;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // UV 球法线即归一化位置（球心在原点）
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
}

// ---------------------------------------------------------------------------
// GLB 组装
// ---------------------------------------------------------------------------

function createPrimitive(doc, buffer, geometry, material) {
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(geometry.positions)
    .setBuffer(buffer);
  const normal = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(geometry.normals)
    .setBuffer(buffer);
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(geometry.indices)
    .setBuffer(buffer);
  return doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setIndices(indices)
    .setMaterial(material);
}

function createMaterial(
  doc,
  name,
  { baseColor, metallic = 0, roughness = 1, emissive },
) {
  const material = doc
    .createMaterial(name)
    .setBaseColorFactor(baseColor)
    .setMetallicFactor(metallic)
    .setRoughnessFactor(roughness);
  if (emissive) material.setEmissiveFactor(emissive);
  return material;
}

async function buildDocument() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('sample');

  const materials = {
    ground: createMaterial(doc, 'ground', {
      baseColor: [0.72, 0.72, 0.72, 1],
      roughness: 0.9,
    }),
    'metal-brushed': createMaterial(doc, 'metal-brushed', {
      baseColor: [0.83, 0.85, 0.88, 1],
      metallic: 1,
      roughness: 0.25,
    }),
    'painted-red': createMaterial(doc, 'painted-red', {
      baseColor: [0.62, 0.07, 0.05, 1],
      roughness: 0.6,
    }),
    'painted-blue': createMaterial(doc, 'painted-blue', {
      baseColor: [0.08, 0.2, 0.62, 1],
      roughness: 0.55,
    }),
    'glass-clear': createMaterial(doc, 'glass-clear', {
      baseColor: [1, 1, 1, 1],
      roughness: 0.05,
    }),
    'emissive-panel': createMaterial(doc, 'emissive-panel', {
      baseColor: [0.05, 0.05, 0.05, 1],
      roughness: 1,
      emissive: [1, 1, 1],
    }),
  };

  // [名字, 几何, 材质, 位置, 四元数]（glTF y-up 布局）
  const parts = [
    ['ground', planeGeometry(14, 14), materials.ground, [0, 0, 0], null],
    [
      'metal-brushed',
      boxGeometry(1.4),
      materials['metal-brushed'],
      [-2.4, 0.7, -1.0],
      null,
    ],
    [
      'painted-red',
      boxGeometry(1.2),
      materials['painted-red'],
      [0.4, 0.6, 1.6],
      null,
    ],
    [
      'painted-blue',
      boxGeometry(1.0),
      materials['painted-blue'],
      [2.6, 0.5, -0.8],
      null,
    ],
    [
      'glass-clear',
      sphereGeometry(0.8),
      materials['glass-clear'],
      [-0.4, 0.8, -0.4],
      null,
    ],
    // 自发光板：平面法线 +Y，绕 X 转 π 使其朝下
    [
      'emissive-panel',
      planeGeometry(3.2, 2.0),
      materials['emissive-panel'],
      [0, 3.4, 0],
      [1, 0, 0, 0],
    ],
  ];

  for (const [name, geometry, material, translation, rotation] of parts) {
    const mesh = doc
      .createMesh(name)
      .addPrimitive(createPrimitive(doc, buffer, geometry, material));
    const node = doc.createNode(name).setMesh(mesh).setTranslation(translation);
    if (rotation) node.setRotation(rotation);
    scene.addChild(node);
  }

  await doc.transform(prune());
  return doc;
}

/** JSONDocument → GLB 二进制（手工封包，避免引入 extensions 依赖）。 */
function packGlb(gltfJson, bin) {
  const pad = (buf, fill) => {
    const rest = buf.length % 4;
    return rest === 0
      ? buf
      : Buffer.concat([buf, Buffer.alloc(4 - rest, fill)]);
  };
  const jsonChunk = pad(Buffer.from(JSON.stringify(gltfJson), 'utf8'), 0x20);
  const binChunk = pad(Buffer.from(bin), 0x00);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
}

async function buildGlb() {
  const doc = await buildDocument();
  const io = new NodeIO();
  const { json, resources } = await io.writeJSON(doc, { format: Format.GLB });

  // 手工补 KHR 材质扩展（transmission / ior / volume / emissive_strength）
  const extensionsUsed = new Set(json.extensionsUsed ?? []);
  for (const material of json.materials ?? []) {
    const patch = KHR_PATCHES[material.name];
    if (!patch) continue;
    material.extensions = { ...(material.extensions ?? {}), ...patch };
    for (const key of Object.keys(patch)) extensionsUsed.add(key);
  }
  if (extensionsUsed.size > 0) json.extensionsUsed = [...extensionsUsed].sort();

  const bin = resources['@glb.bin'] ?? Object.values(resources)[0];
  if (!bin) throw new Error('GLB 写出失败：未找到二进制 buffer');
  return packGlb(json, bin);
}

// ---------------------------------------------------------------------------
// sample.prism.json（schema v1，transform 为 Blender 坐标系）
// ---------------------------------------------------------------------------

function buildSceneJson() {
  // 太阳：欧拉 (45°, 0°, 135°)，-Z 轴 45° 俯射，与 environment 的太阳方位一致
  const sunRotation = eulerBlenderToMat3(45, 0, 135);
  // 相机：Blender 坐标 [8,-8,5] 看向原点
  const cameraEye = [8, -8, 5];
  const cameraRotation = lookAtBlenderMat3(cameraEye, [0, 0, 0]);

  return {
    format: 'prism-scene',
    version: 1,
    meta: {
      name: 'prism-sample',
      exporterVersion: 'make-sample-scene 1.0.0',
      exportedAt: new Date().toISOString(),
    },
    coordinateSystem: 'blender',
    units: 'metric',
    assets: { model: { url: GLB_FILENAME } },
    renderer: {
      toneMapping: { type: 'AgX', exposureStops: 0 },
      shadows: { mapSize: 2048, bias: -0.0002, normalBias: 0.02, radius: 1.5 },
    },
    environment: {
      type: 'procedural-sky',
      sunElevationDeg: 45,
      sunAzimuthDeg: 135,
      turbidity: 4,
      // IBL 强度：物理天空做环境光很亮，0.45 是示例场景的均衡值（数据调参，不改代码）
      lightingStrength: 0.45,
    },
    post: {
      bloom: { enabled: true, threshold: 1, strength: 0.25, radius: 0.6 },
    },
    cameras: [
      {
        id: 'camera-main',
        name: 'Camera',
        transform: mat3ToColumnMajor16(cameraRotation, cameraEye),
        lensMm: 35,
        sensorWidthMm: 36,
        sensorFit: 'auto',
        clipNear: 0.1,
        clipFar: 1000,
        isDefault: true,
      },
    ],
    lights: [
      {
        id: 'sun',
        name: 'Sun',
        type: 'sun',
        color: '#ffffff',
        energyWatts: 3,
        transform: mat3ToColumnMajor16(sunRotation, [0, 0, 0]),
        shadow: { castShadow: true },
      },
    ],
    materials: [
      // PBR 覆盖演示：显式 match.names，禁止关键词启发式
      {
        id: 'glass-clear',
        name: 'glass-clear',
        match: { names: ['glass-clear'] },
        pbr: { roughness: 0.05, transmission: 1, ior: 1.5 },
      },
    ],
    objects: [],
  };
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(SAMPLE_DIR, { recursive: true });

  const glb = await buildGlb();
  const glbPath = resolve(SAMPLE_DIR, GLB_FILENAME);
  writeFileSync(glbPath, glb);

  const sceneJson = `${JSON.stringify(roundFloats(buildSceneJson()), null, 2)}\n`;
  const jsonPath = resolve(SAMPLE_DIR, JSON_FILENAME);
  writeFileSync(jsonPath, sceneJson, 'utf8');

  console.log(`已生成 ${glbPath}（${(glb.length / 1024).toFixed(1)} KB）`);
  console.log(
    `已生成 ${jsonPath}（${(Buffer.byteLength(sceneJson) / 1024).toFixed(1)} KB）`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
