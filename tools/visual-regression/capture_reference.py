"""Cycles 参考图捕获：用指定相机渲染一张 reference.png。

在 Blender 后台运行（必须用 Blender 自带 Python，不能用系统 Python）：

  blender --background scene.blend --python capture_reference.py -- \
      --camera Camera --out work/reference.png --samples 256 --resolution 1280x720

参数：
  --camera      相机对象名（必填），渲染时临时设为场景活动相机
  --out         输出 PNG 路径（必填）
  --samples     Cycles 采样数，默认 256（参考图建议不低于 256，避免噪点干扰对比）
  --resolution  宽x高，默认 1280x720

渲染使用 Cycles + 降噪，色彩管理沿用场景设置（AgX 等），
与 scene.prism.json 里的 renderer.toneMapping 对应。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy

DEFAULT_SAMPLES = 256
DEFAULT_RESOLUTION = "1280x720"


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Prism Cycles 参考图捕获")
    parser.add_argument("--camera", required=True, help="相机对象名")
    parser.add_argument("--out", required=True, type=Path, help="输出 PNG 路径")
    parser.add_argument("--samples", type=int, default=DEFAULT_SAMPLES, help="Cycles 采样数")
    parser.add_argument(
        "--resolution",
        default=DEFAULT_RESOLUTION,
        help="宽x高，如 1280x720",
    )
    return parser.parse_args(argv)


def parse_resolution(text: str) -> tuple[int, int]:
    try:
        width_text, height_text = text.lower().split("x", 1)
        width, height = int(width_text), int(height_text)
    except ValueError:
        raise SystemExit(f"--resolution 格式应为 宽x高（如 1280x720），收到 `{text}`")
    if width < 1 or height < 1:
        raise SystemExit(f"--resolution 宽高必须为正整数，收到 `{text}`")
    return width, height


def main() -> None:
    args = parse_args()
    width, height = parse_resolution(args.resolution)

    camera = bpy.data.objects.get(args.camera)
    if camera is None or camera.type != "CAMERA":
        names = [obj.name for obj in bpy.context.scene.objects if obj.type == "CAMERA"]
        raise SystemExit(f"找不到相机 `{args.camera}`，场景内可用相机：{names}")

    output_path = args.out.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(output_path)
    scene.cycles.samples = max(args.samples, 1)
    scene.cycles.use_denoising = True
    bpy.ops.render.render(write_still=True)

    print(f"PRISM_REFERENCE_WRITTEN={output_path} ({width}x{height}, {scene.cycles.samples} samples)")


if __name__ == "__main__":
    main()
