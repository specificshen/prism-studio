"""视觉回归对比：Cycles 参考图 vs 前端同机位截图。

仅依赖 Pillow：

  pip install Pillow

用法：

  python3 compare.py reference.png shot.png --json report.json
  python3 compare.py reference.png shot.png --threshold 28

输出指标：PSNR（dB）、MAE（0~1 平均绝对误差）、亮度均值、
亮度直方图分位数（P5/P25/P50/P75/P95，sRGB 亮度加权）。

退出码：PSNR ≥ 阈值（默认 28dB，--threshold 可配）为 0，否则为 1，供 CI 判定。
两图分辨率不一致时，截图按参考图尺寸 LANCZOS 缩放后对比，并在报告中标注。
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

from PIL import Image

DEFAULT_THRESHOLD_DB = 28.0

# sRGB 亮度系数（Rec. 709）
LUMA_R = 0.2126
LUMA_G = 0.7152
LUMA_B = 0.0722

PERCENTILES = (5, 25, 50, 75, 95)

CHANNEL_MAX = 255.0
CHANNEL_COUNT = 3


def load_rgb(path: Path, target_size: tuple[int, int] | None = None) -> tuple[bytes, tuple[int, int]]:
    """读图转 RGB 字节流；给定 target_size 且尺寸不符时 LANCZOS 缩放。"""
    image = Image.open(path).convert("RGB")
    if target_size is not None and image.size != target_size:
        image = image.resize(target_size, Image.Resampling.LANCZOS)
    return image.tobytes(), image.size


def compare_pixels(reference: bytes, candidate: bytes) -> dict[str, float]:
    """逐像素统计 MSE / MAE 与两张图的亮度序列。"""
    pixel_count = len(reference) // CHANNEL_COUNT
    squared_error = 0.0
    absolute_error = 0.0
    ref_luminance: list[float] = []
    shot_luminance: list[float] = []
    for offset in range(0, len(reference), CHANNEL_COUNT):
        r_diff = reference[offset] - candidate[offset]
        g_diff = reference[offset + 1] - candidate[offset + 1]
        b_diff = reference[offset + 2] - candidate[offset + 2]
        squared_error += r_diff * r_diff + g_diff * g_diff + b_diff * b_diff
        absolute_error += abs(r_diff) + abs(g_diff) + abs(b_diff)
        ref_luminance.append(
            LUMA_R * reference[offset] + LUMA_G * reference[offset + 1] + LUMA_B * reference[offset + 2]
        )
        shot_luminance.append(
            LUMA_R * candidate[offset] + LUMA_G * candidate[offset + 1] + LUMA_B * candidate[offset + 2]
        )
    channel_count = pixel_count * CHANNEL_COUNT
    mse = squared_error / channel_count
    return {
        "mse": mse,
        "psnrDb": 10.0 * math.log10(CHANNEL_MAX * CHANNEL_MAX / mse) if mse > 0.0 else float("inf"),
        "mae": absolute_error / channel_count / CHANNEL_MAX,
        "refLuminance": ref_luminance,
        "shotLuminance": shot_luminance,
    }


def percentile(sorted_values: list[float], q: float) -> float:
    """线性插值分位数（输入必须已排序）。"""
    if not sorted_values:
        return 0.0
    position = q / 100.0 * (len(sorted_values) - 1)
    lower = math.floor(position)
    upper = min(lower + 1, len(sorted_values) - 1)
    fraction = position - lower
    return sorted_values[lower] * (1.0 - fraction) + sorted_values[upper] * fraction


def luminance_summary(luminance: list[float]) -> dict[str, Any]:
    ordered = sorted(luminance)
    return {
        "mean": round(sum(luminance) / max(len(luminance), 1) / CHANNEL_MAX, 5),
        "percentiles": [round(p / CHANNEL_MAX, 5) for p in (percentile(ordered, q) for q in PERCENTILES)],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prism 视觉回归对比（reference vs 前端截图）")
    parser.add_argument("reference", type=Path, help="Cycles 参考图 PNG")
    parser.add_argument("candidate", type=Path, help="前端同机位截图 PNG")
    parser.add_argument("--json", type=Path, default=None, help="报告 JSON 输出路径")
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD_DB,
        help=f"PSNR 判定阈值（dB），默认 {DEFAULT_THRESHOLD_DB}",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    reference, size = load_rgb(args.reference.expanduser().resolve())
    candidate, original_size = load_rgb(args.candidate.expanduser().resolve(), size)

    metrics = compare_pixels(reference, candidate)
    ref_luma = luminance_summary(metrics.pop("refLuminance"))
    shot_luma = luminance_summary(metrics.pop("shotLuminance"))
    passed = metrics["psnrDb"] >= args.threshold

    report = {
        "reference": str(args.reference),
        "candidate": str(args.candidate),
        "comparisonSize": list(size),
        "candidateResized": original_size != size,
        "psnrDb": None if math.isinf(metrics["psnrDb"]) else round(metrics["psnrDb"], 5),
        "meanAbsoluteError": round(metrics["mae"], 5),
        "thresholdDb": args.threshold,
        "pass": passed,
        "luminance": {"reference": ref_luma, "candidate": shot_luma},
    }

    if args.json is not None:
        json_path = args.json.expanduser().resolve()
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    psnr_text = "inf" if math.isinf(metrics["psnrDb"]) else f"{metrics['psnrDb']:.2f}"
    print(f"PSNR={psnr_text}dB (阈值 {args.threshold}dB)  MAE={metrics['mae']:.5f}")
    print(f"亮度 P5/P50/P95 参考={ref_luma['percentiles'][0]}/{ref_luma['percentiles'][2]}/{ref_luma['percentiles'][4]} "
          f"截图={shot_luma['percentiles'][0]}/{shot_luma['percentiles'][2]}/{shot_luma['percentiles'][4]}")
    print("判定：通过" if passed else "判定：不通过（PSNR 低于阈值）")
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
