"""Prism 场景导出器：Blender → scene.glb + scene.prism.json + export-report.json。

使用说明
========

前置条件：
  - Blender ≥ 4.0（材质解析按 Principled BSDF v2 输入名读取）；
  - 建议先 File → External Data → Pack All Into .blend 打包贴图，
    否则 glTF 导出器按引用路径收集图片，缺图会在导出报告里体现；
  - 场景内不要遗留 Blender 自动重命名资源（Cube.001 之类），脚本会警告。

运行方式一（Blender UI）：
  在"脚本工作区"打开本文件，点"运行脚本"。
  输出到 .blend 同目录下的 prism_export/。

运行方式二（命令行后台）：
  blender --background scene.blend --python prism_export.py -- --out ./out
  `--out` 省略时默认 <blend 同目录>/prism_export/。

输出物：
  - scene.glb          官方 glTF 导出器产出的二进制场景（图片打包内嵌）
  - scene.prism.json   prism-scene schema v1 数据：色彩管理、相机、灯光、
                       材质、对象、环境（HDRI）、资源清单
  - export-report.json Blender name ↔ 稳定 id 映射、警告列表、数量统计

设计约定（与 renderer-core 的数据契约一致）：
  - 坐标系一律保持 Blender 原始坐标 / 欧拉 / 矩阵（Z-up 右手系），
    本脚本不做任何坐标转换——转换只发生在前端 renderer-core 的 convert 层；
  - 浮点数统一取整 5 位小数；
  - 灯光能量单一物理单位 energyWatts（Blender data.energy 原样）；
  - 本脚本只搬运 Blender 场景数据，禁止内嵌任何"校准值 / 手调参数"。
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import bpy

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------

PRISM_EXPORTER_VERSION = "1.0.0"

SCENE_FORMAT = "prism-scene"
SCENE_VERSION = 1

FLOAT_PRECISION = 5

GLB_FILENAME = "scene.glb"
JSON_FILENAME = "scene.prism.json"
REPORT_FILENAME = "export-report.json"

# 色彩管理 view_transform → schema toneMapping.type。
# glTF / three.js 没有 AgX 之外的 Blender 专有变换，Filmic 与 Standard
# 在前端统一走 ACESFilmic 近似。
TONE_MAPPING_BY_VIEW_TRANSFORM = {
    "AgX": "AgX",
    "Khronos PBR Neutral": "Neutral",
    "Standard": "ACESFilmic",
    "Filmic": "ACESFilmic",
}

LIGHT_TYPE_EXPORT = {
    "SUN": "sun",
    "POINT": "point",
    "SPOT": "spot",
    "AREA": "area",
}

SENSOR_FIT_EXPORT = {
    "AUTO": "auto",
    "HORIZONTAL": "horizontal",
    "VERTICAL": "vertical",
}

# Blender 4.x Principled BSDF v2 的输入名（3.x 的 "Transmission" 等已改名）。
INPUT_BASE_COLOR = "Base Color"
INPUT_METALLIC = "Metallic"
INPUT_ROUGHNESS = "Roughness"
INPUT_IOR = "IOR"
INPUT_ALPHA = "Alpha"
INPUT_TRANSMISSION = "Transmission Weight"
INPUT_COAT = "Coat Weight"
INPUT_EMISSION_COLOR = "Emission Color"
INPUT_EMISSION_STRENGTH = "Emission Strength"

# Blender 自动重命名后缀（Cube.001）。
AUTO_RENAME_SUFFIX = re.compile(r"\.\d{3}$")

# id 允许的字符：unicode 字母 / 数字 / 连字符（\w 含字母数字下划线，
# 下划线已提前替换为连字符）。
ID_ILLEGAL_CHARS = re.compile(r"[^\w-]+", re.UNICODE)
ID_DASH_RUNS = re.compile(r"-{2,}")
ID_WHITESPACE_UNDERSCORE = re.compile(r"[\s_]+")


# ---------------------------------------------------------------------------
# 通用小工具
# ---------------------------------------------------------------------------


def round5(value: float) -> float:
    """浮点取整 5 位小数，并把 -0.0 归一为 0.0。"""
    result = round(float(value), FLOAT_PRECISION)
    return 0.0 if result == 0 else result


def round_floats(value: Any) -> Any:
    """递归把结构里所有 float 取整，作为写出前的统一兜底。"""
    if isinstance(value, float):
        return round5(value)
    if isinstance(value, list):
        return [round_floats(item) for item in value]
    if isinstance(value, dict):
        return {key: round_floats(item) for key, item in value.items()}
    return value


def property_value(owner: Any, name: str, default: Any = None) -> Any:
    """安全读取 RNA 属性，属性不存在（版本差异）时返回 default。"""
    if owner is None or not hasattr(owner, name):
        return default
    try:
        return getattr(owner, name)
    except (AttributeError, RuntimeError, TypeError, ValueError):
        return default


def hex_color(rgb: Any) -> str:
    """Blender 线性 RGB（0~1 浮点）→ '#rrggbb'。

    与 glTF baseColorFactor 一致，保留线性值不做 sRGB 转换，
    前端按线性颜色消费。
    """
    channels = [max(0, min(255, round(float(c) * 255.0))) for c in list(rgb)[:3]]
    return "#{:02x}{:02x}{:02x}".format(*channels)


def matrix_column_major(matrix: Any) -> list[float]:
    """mathutils Matrix → 16 元素列主序扁平数组（与 three.js Matrix4 一致）。"""
    return [round5(matrix[row][col]) for col in range(4) for row in range(4)]


def node_socket_constant(node: Any, name: str) -> Any:
    """读取节点输入的常量值；输入被连线（贴图/程序节点驱动）时返回 None。

    被连线意味着该参数由 GLB 内的贴图承载，prism.json 不再重复导出。
    """
    socket = node.inputs.get(name)
    if socket is None or socket.is_linked:
        return None
    return property_value(socket, "default_value")


# ---------------------------------------------------------------------------
# 稳定 id 生成
# ---------------------------------------------------------------------------


def slugify(name: str) -> str:
    """Blender 名称 → id 候选：小写、空白/下划线转 `-`、去非法字符、保留 unicode 字母。"""
    slug = name.strip().lower()
    slug = ID_WHITESPACE_UNDERSCORE.sub("-", slug)
    slug = ID_ILLEGAL_CHARS.sub("", slug)
    slug = ID_DASH_RUNS.sub("-", slug).strip("-")
    return slug or "item"


class IdRegistry:
    """全局 id 注册表：保证跨类别唯一，冲突时追加 -2 / -3。"""

    def __init__(self) -> None:
        self._owners: dict[str, tuple[str, str]] = {}
        self.entries: list[dict[str, str]] = []

    def register(self, kind: str, name: str) -> str:
        base = slugify(name)
        candidate = base
        suffix = 2
        while candidate in self._owners:
            candidate = f"{base}-{suffix}"
            suffix += 1
        self._owners[candidate] = (kind, name)
        self.entries.append({"kind": kind, "name": name, "id": candidate})
        return candidate


def warn_auto_rename(kind: str, name: str, warnings: list[str]) -> None:
    """检测到 .001 这类 Blender 自动重命名后缀时登记警告。"""
    if AUTO_RENAME_SUFFIX.search(name):
        warnings.append(
            f"{kind} `{name}` 带有 Blender 自动重命名后缀："
            "Blender 里存在重名资源，请清理后重新导出"
        )


# ---------------------------------------------------------------------------
# 各段导出
# ---------------------------------------------------------------------------


def export_meta() -> dict[str, Any]:
    blend_path = Path(bpy.data.filepath) if bpy.data.filepath else None
    return {
        "name": blend_path.stem if blend_path else "untitled",
        "sourceBlend": blend_path.name if blend_path else None,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "exporterVersion": PRISM_EXPORTER_VERSION,
        "coordinateSystem": "blender",
        "units": "metric",
    }


def export_renderer(scene: Any, warnings: list[str]) -> dict[str, Any]:
    view_transform = scene.view_settings.view_transform
    tone_mapping = TONE_MAPPING_BY_VIEW_TRANSFORM.get(view_transform)
    if tone_mapping is None:
        warnings.append(
            f"未知 view_transform `{view_transform}`，toneMapping 已回退为 AgX，"
            "请在 Blender 色彩管理中改用 AgX / Khronos PBR Neutral"
        )
        tone_mapping = "AgX"
    return {
        "toneMapping": {
            "type": tone_mapping,
            "exposureStops": round5(scene.view_settings.exposure),
        }
    }


def export_cameras(scene: Any, registry: IdRegistry, warnings: list[str]) -> list[dict[str, Any]]:
    cameras = []
    for obj in scene.objects:
        if obj.type != "CAMERA":
            continue
        warn_auto_rename("相机", obj.name, warnings)
        data = obj.data
        cameras.append(
            {
                "id": registry.register("camera", obj.name),
                "name": obj.name,
                "transform": matrix_column_major(obj.matrix_world),
                "lensMm": round5(data.lens),
                "sensorWidthMm": round5(data.sensor_width),
                "sensorFit": SENSOR_FIT_EXPORT.get(data.sensor_fit, "auto"),
                "clipNear": round5(data.clip_start),
                "clipFar": round5(data.clip_end),
                "isDefault": scene.camera == obj,
            }
        )
    return cameras


def export_light_shadow(obj: Any, light_type: str) -> dict[str, Any]:
    data = obj.data
    shadow: dict[str, Any] = {"castShadow": bool(property_value(data, "use_shadow", True))}
    # SUN 的 angle 是角直径（弧度），前端用作软阴影半径；
    # POINT / SPOT 用 shadow_soft_size（米）。属性缺失时省略字段。
    if light_type == "sun":
        angle = property_value(data, "angle")
        if angle is not None:
            shadow["radius"] = round5(angle)
    elif light_type in ("point", "spot"):
        soft_size = property_value(data, "shadow_soft_size")
        if soft_size is not None:
            shadow["radius"] = round5(soft_size)
    return shadow


def export_lights(scene: Any, registry: IdRegistry, warnings: list[str]) -> list[dict[str, Any]]:
    lights = []
    for obj in scene.objects:
        if obj.type != "LIGHT":
            continue
        warn_auto_rename("灯光", obj.name, warnings)
        data = obj.data
        light_type = LIGHT_TYPE_EXPORT.get(data.type)
        if light_type is None:
            warnings.append(f"灯光 `{obj.name}` 类型 `{data.type}` 无法映射，已跳过")
            continue
        entry: dict[str, Any] = {
            "id": registry.register("light", obj.name),
            "name": obj.name,
            "type": light_type,
            "color": hex_color(data.color),
            "energyWatts": round5(data.energy),
            "transform": matrix_column_major(obj.matrix_world),
            "shadow": export_light_shadow(obj, light_type),
        }
        if light_type == "spot":
            entry["spot"] = {
                "angleDeg": round5(math.degrees(property_value(data, "spot_size", 0.0))),
                "blend": round5(property_value(data, "spot_blend", 0.0)),
            }
        elif light_type == "area":
            shape = property_value(data, "shape", "SQUARE")
            entry["area"] = {
                "shape": str(shape).lower(),
                "width": round5(property_value(data, "size", 0.0)),
                # SQUARE / DISK 没有独立高度，回落到 size
                "height": round5(
                    property_value(data, "size_y")
                    if shape in ("RECTANGLE", "ELLIPSE")
                    else property_value(data, "size", 0.0)
                ),
            }
        lights.append(entry)
    return lights


def find_output_surface_node(node_tree: Any) -> Any:
    """材质输出节点 Surface 输入直连的节点（玻璃混合图里是 Mix Shader）。"""
    for node in node_tree.nodes:
        if node.type != "OUTPUT_MATERIAL":
            continue
        socket = node.inputs.get("Surface")
        if socket is not None and socket.is_linked:
            return socket.links[0].from_node
    return None


def extract_principled_pbr(node: Any) -> dict[str, Any]:
    """从 Principled BSDF v2 提取常量 PBR 参数；被贴图驱动的字段省略。"""
    pbr: dict[str, Any] = {}
    base_color = node_socket_constant(node, INPUT_BASE_COLOR)
    if base_color is not None:
        pbr["baseColor"] = hex_color(base_color)
    scalar_inputs = (
        (INPUT_METALLIC, "metalness"),
        (INPUT_ROUGHNESS, "roughness"),
        (INPUT_IOR, "ior"),
        (INPUT_ALPHA, "alpha"),
        (INPUT_TRANSMISSION, "transmission"),
        (INPUT_COAT, "coat"),
    )
    for socket_name, field in scalar_inputs:
        value = node_socket_constant(node, socket_name)
        if value is not None:
            pbr[field] = round5(value)
    return pbr


def extract_emissive(node: Any) -> dict[str, Any] | None:
    """自发光：仅当颜色与强度均为常量且实际发光时导出。"""
    color = node_socket_constant(node, INPUT_EMISSION_COLOR)
    strength = node_socket_constant(node, INPUT_EMISSION_STRENGTH)
    if color is None or strength is None:
        return None
    if float(strength) <= 0.0 or max(list(color)[:3]) <= 0.0:
        return None
    return {"color": hex_color(color), "strength": round5(strength)}


def extract_attenuation(node_tree: Any, material_name: str, warnings: list[str]) -> dict[str, Any]:
    """材质输出 Volume 输入挂了 Volume Absorption → pbr 体积衰减字段（v1.1）。

    对应 KHR_materials_volume 口径：attenuationColor 取节点 Color（线性 →
    '#rrggbb'）；attenuationDistance = 1 / density（米）。density ≤ 0 或被
    节点驱动时跳过并登记警告，不硬编兜底值。
    """
    for node in node_tree.nodes:
        if node.type != "OUTPUT_MATERIAL":
            continue
        volume_socket = node.inputs.get("Volume")
        if volume_socket is None or not volume_socket.is_linked:
            continue
        volume_node = volume_socket.links[0].from_node
        if volume_node.type != "VOLUME_ABSORPTION":
            continue
        density = node_socket_constant(volume_node, "Density")
        if density is None:
            warnings.append(
                f"材质 `{material_name}` 的 Volume Absorption 密度被节点驱动："
                "无法换算 attenuationDistance，请改为常量或在编辑器侧配置"
            )
            return {}
        if float(density) <= 0.0:
            warnings.append(
                f"材质 `{material_name}` 的 Volume Absorption 密度 ≤ 0："
                "跳过 attenuation 导出（attenuationDistance = 1/density 无意义）"
            )
            return {}
        pbr: dict[str, Any] = {"attenuationDistance": round5(1.0 / float(density))}
        color = node_socket_constant(volume_node, "Color")
        if color is not None:
            pbr["attenuationColor"] = hex_color(color)
        return pbr
    return {}


def detect_layer_weight_glass(node_tree: Any) -> dict[str, Any] | None:
    """识别 Layer Weight 驱动的多层玻璃节点图（Glass BSDF 混合等）。

    这类菲涅尔玻璃无法进 glTF PBR，由前端 glass 扩展按 layer-weight
    模型复建；layers 取图中的 Glass BSDF 数量。
    """
    node_types = [node.type for node in node_tree.nodes]
    if "LAYER_WEIGHT" not in node_types:
        return None
    glass_layers = node_types.count("BSDF_GLASS")
    if glass_layers == 0:
        return None
    return {"type": "layer-weight", "layers": glass_layers}


def export_material(material: Any, registry: IdRegistry, warnings: list[str]) -> dict[str, Any]:
    warn_auto_rename("材质", material.name, warnings)
    entry: dict[str, Any] = {
        "id": registry.register("material", material.name),
        "match": {"names": [material.name]},
    }
    if not material.use_nodes or material.node_tree is None:
        # 无节点材质：退回 legacy 属性，保证 GLB 之外也有可用数据
        entry["pbr"] = {
            "baseColor": hex_color(material.diffuse_color),
            "metalness": round5(material.metallic),
            "roughness": round5(material.roughness),
        }
        return entry

    tree = material.node_tree
    surface_node = find_output_surface_node(tree)
    principled = surface_node if surface_node is not None and surface_node.type == "BSDF_PRINCIPLED" else None
    if principled is None:
        # 输出经 Mix/Add Shader 等混合：找图里第一个 Principled 兜底取基础参数
        principled = next((node for node in tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if principled is not None:
        entry["pbr"] = extract_principled_pbr(principled)
        emissive = extract_emissive(principled)
        if emissive is not None:
            entry["emissive"] = emissive

    attenuation = extract_attenuation(tree, material.name, warnings)
    if attenuation:
        entry.setdefault("pbr", {}).update(attenuation)

    glass = detect_layer_weight_glass(tree)
    if glass is not None:
        entry["glass"] = glass
        warnings.append(
            f"材质 `{material.name}` 是 Layer Weight 多层玻璃："
            "玻璃层颜色 / 折射细节需在 Blender 里调好后以节点常量导出，"
            "前端按 glass(layer-weight) 扩展渲染"
        )
    elif principled is None:
        warnings.append(
            f"材质 `{material.name}` 的活动表面不是 Principled BSDF："
            "程序节点图无法进 glTF，请烘焙成贴图后重新导出"
        )
    return entry


def export_materials(registry: IdRegistry, warnings: list[str]) -> list[dict[str, Any]]:
    return [export_material(material, registry, warnings) for material in bpy.data.materials]


def export_objects(scene: Any, registry: IdRegistry, warnings: list[str]) -> list[dict[str, Any]]:
    objects = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        warn_auto_rename("对象", obj.name, warnings)
        entry: dict[str, Any] = {
            "id": registry.register("object", obj.name),
            "name": obj.name,
            "visible": not obj.hide_render,
        }
        # Blender 4.x Cycles 可见性属性；取不到（引擎差异）时省略字段，
        # 不硬编码 True。
        visible_shadow = property_value(obj, "visible_shadow")
        if visible_shadow is not None:
            entry["castShadow"] = bool(visible_shadow)
            entry["receiveShadow"] = bool(visible_shadow)
        objects.append(entry)
    return objects


def export_environment(scene: Any, warnings: list[str]) -> dict[str, Any] | None:
    world = scene.world
    if world is None or not world.use_nodes or world.node_tree is None:
        return None
    tree = world.node_tree

    # 体积：World Output 的 Volume 输入挂了 Volume Scatter / Absorption
    # 且密度 > 0 → glTF 不支持体积雾，提醒到前端配置 fog。
    for node in tree.nodes:
        if node.type != "OUTPUT_MATERIAL":
            continue
        volume_socket = node.inputs.get("Volume")
        if volume_socket is None or not volume_socket.is_linked:
            continue
        volume_node = volume_socket.links[0].from_node
        if volume_node.type not in ("VOLUME_SCATTER", "VOLUME_ABSORPTION"):
            continue
        density_socket = volume_node.inputs.get("Density")
        density = None if density_socket is None or density_socket.is_linked else float(density_socket.default_value)
        if density_socket is not None and (density is None or density > 0.0):
            warnings.append(
                "World 挂载了体积散射 / 吸收节点：glTF 不支持体积雾，"
                "请在 schema 的 environment.fog 里由前端配置等效雾效"
            )

    # HDRI：Background 的 Color 输入挂了 Environment Texture
    background = next((node for node in tree.nodes if node.type == "BACKGROUND"), None)
    if background is None:
        return None
    color_socket = background.inputs.get("Color")
    if color_socket is None or not color_socket.is_linked:
        return None
    texture_node = color_socket.links[0].from_node
    if texture_node.type != "TEX_ENVIRONMENT" or texture_node.image is None:
        return None
    image = texture_node.image
    if image.filepath:
        url = Path(bpy.path.abspath(image.filepath)).name
    else:
        url = image.name
    strength = node_socket_constant(background, "Strength")
    return {
        "type": "hdri",
        "url": url,
        "strength": round5(strength) if strength is not None else 1.0,
        "rotation": [0.0, 0.0, 0.0],
    }


# ---------------------------------------------------------------------------
# GLB 导出与报告
# ---------------------------------------------------------------------------


def export_glb(glb_path: Path) -> None:
    # 官方 glTF 导出器默认 export_yup=True（glTF 标准 y-up），
    # 与 prism.json 里的 Blender 原始坐标并存：转换统一在前端 convert 层。
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB")


def build_report(
    registry: IdRegistry,
    warnings: list[str],
    cameras: list[dict[str, Any]],
    lights: list[dict[str, Any]],
    materials: list[dict[str, Any]],
    objects: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "exporterVersion": PRISM_EXPORTER_VERSION,
        "mapping": registry.entries,
        "warnings": warnings,
        "stats": {
            "cameras": len(cameras),
            "lights": len(lights),
            "materials": len(materials),
            "objects": len(objects),
            "warnings": len(warnings),
        },
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(round_floats(payload), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Prism 场景导出器")
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="输出目录，默认 <blend 同目录>/prism_export/",
    )
    return parser.parse_args(argv)


def resolve_output_dir(arg_out: Path | None) -> Path:
    if arg_out is not None:
        return arg_out.expanduser().resolve()
    if bpy.data.filepath:
        return Path(bpy.data.filepath).parent / "prism_export"
    return Path.cwd() / "prism_export"


def main() -> None:
    args = parse_args()
    out_dir = resolve_output_dir(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    scene = bpy.context.scene
    registry = IdRegistry()
    warnings: list[str] = []

    cameras = export_cameras(scene, registry, warnings)
    lights = export_lights(scene, registry, warnings)
    materials = export_materials(registry, warnings)
    objects = export_objects(scene, registry, warnings)
    environment = export_environment(scene, warnings)

    package: dict[str, Any] = {
        "format": SCENE_FORMAT,
        "version": SCENE_VERSION,
        "meta": export_meta(),
        "assets": {"model": {"url": GLB_FILENAME}},
        "renderer": export_renderer(scene, warnings),
        "cameras": cameras,
        "lights": lights,
        "materials": materials,
        "objects": objects,
    }
    if environment is not None:
        package["environment"] = environment

    glb_path = out_dir / GLB_FILENAME
    export_glb(glb_path)

    write_json(out_dir / JSON_FILENAME, package)
    report = build_report(registry, warnings, cameras, lights, materials, objects)
    write_json(out_dir / REPORT_FILENAME, report)

    print(f"PRISM_GLB_WRITTEN={glb_path}")
    print(f"PRISM_JSON_WRITTEN={out_dir / JSON_FILENAME}")
    print(f"PRISM_REPORT_WRITTEN={out_dir / REPORT_FILENAME}")
    print(f"PRISM_STATS={json.dumps(report['stats'], ensure_ascii=False)}")
    for warning in warnings:
        print(f"PRISM_WARNING={warning}")


if __name__ == "__main__":
    main()
