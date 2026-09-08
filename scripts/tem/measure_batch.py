"""요구사항 2 확대 — 전체 이미지 배치 계측.

대표 1장 검증(measure.py) 후, 세그멘테이션된 모든 이미지의 모든 클래스에
대해 계측을 자동으로 돌린다. measure.py의 계측 함수를 그대로 재사용한다.

- 입력: var/tem/segmentation/<stem>/labels.npy 임시 라벨(또는 사람 마스크
  var/tem/labels/<stem>.npy — resolve_labels 규약과 동일하게 후자 우선).
- 클래스마다 연결 요소를 계측하고, 잘리지 않은 영역만으로 대표 통계를 낸다.
- 원본은 절대 수정하지 않고 var/tem/measure/ 아래로만 출력한다.
- 이미지별 measurements.json + 오버레이, 그리고 (이미지, 클래스)당 한 줄인
  요약 CSV(summary.csv)를 만든다.
- 실패한 (이미지, 클래스)는 건너뛰고 마지막에 실패 목록/사유를 출력한다.

사용법:
    python scripts/tem/measure_batch.py --min-area 200
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np
from skimage.measure import label as cc_label
from skimage.measure import regionprops

sys.path.insert(0, str(Path(__file__).resolve().parent))

from classifier import resolve_labels  # noqa: E402
from common import (  # noqa: E402
    DEFAULT_OUT_ROOT,
    REPO_ROOT,
    iter_images,
    load_gray,
    load_labelmap,
    load_metadata_field,
    load_scale,
    resolve,
)
from measure import (  # noqa: E402
    add_units,
    compute_spacing,
    measure_region,
    render_overlay,
    summary_stats,
)


def measure_label(
    labels: np.ndarray,
    gray: np.ndarray,
    value: int,
    nm_per_px: float | None,
    args: argparse.Namespace,
) -> tuple[list[dict[str, object]], dict[str, object]]:
    """한 클래스의 연결 요소를 계측하고 (영역 목록, 요약)을 반환한다."""
    mask = labels == value
    components = cc_label(mask, connectivity=2)
    region_data: list[dict[str, object]] = []
    for region in regionprops(components):
        if region.area < args.min_area:
            continue
        region_data.append(
            measure_region(
                region,
                mask,
                (labels.shape[0], labels.shape[1]),
                args.curvature_frac,
                tuple(args.sidewall_band),
                args.max_radius_factor,
            )
        )
    add_units(region_data, nm_per_px)
    compute_spacing(region_data, nm_per_px)
    return region_data, summary_stats(region_data, nm_per_px)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--folder",
        type=Path,
        default=REPO_ROOT / "data" / "samples" / "tem" / "images",
    )
    parser.add_argument(
        "--min-area", type=int, default=200, help="노이즈로 볼 최소 면적(px)"
    )
    parser.add_argument("--curvature-frac", type=float, default=0.6)
    parser.add_argument(
        "--sidewall-band", type=float, nargs=2, default=(0.2, 0.8),
        metavar=("LO", "HI"),
    )
    parser.add_argument("--max-radius-factor", type=float, default=3.0)
    parser.add_argument("--scanlines", type=int, default=3)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_ROOT / "measure")
    args = parser.parse_args()

    folder = resolve(args.folder)
    images = {p.stem: p for p in iter_images(folder)}
    out_root = resolve(args.out)
    out_root.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, object]] = []
    failures: list[tuple[str, str]] = []

    for stem, image_path in images.items():
        label_path = resolve_labels(stem)
        if label_path is None:
            failures.append((stem, "라벨 없음"))
            continue
        try:
            labels = load_labelmap(label_path)
            gray = load_gray(image_path)
            nm_per_px = load_scale(image_path.name)
            group = load_metadata_field(image_path.name, "device") or "unknown"

            image_out = out_root / stem
            image_out.mkdir(parents=True, exist_ok=True)
            per_label: dict[str, object] = {}
            overlay_regions: list[dict[str, object]] = []
            for value in sorted(int(v) for v in np.unique(labels)):
                region_data, summary = measure_label(
                    labels, gray, value, nm_per_px, args
                )
                per_label[str(value)] = {
                    "summary": summary,
                    "regions": [
                        {k: v for k, v in r.items() if not k.startswith("_")}
                        for r in region_data
                    ],
                }
                overlay_regions.extend(region_data)
                rows.append(
                    {
                        "sample_id": stem,
                        "group": group,
                        "label": value,
                        "nm_per_pixel": nm_per_px,
                        "regions_total": summary["regions_total"],
                        "regions_used": summary["regions_used"],
                        "regions_clipped": summary["regions_clipped"],
                        "cd_median_px": summary["cd_median_px"],
                        "cd_median_nm": summary["cd_median_nm"],
                        "height_median_px": summary["height_median_px"],
                        "height_median_nm": summary["height_median_nm"],
                    }
                )

            render_overlay(
                gray, overlay_regions, image_out / "overlay.png", args.scanlines
            )
            (image_out / "measurements.json").write_text(
                json.dumps(
                    {
                        "image": image_path.name,
                        "group": group,
                        "nm_per_pixel": nm_per_px,
                        "min_area": args.min_area,
                        "labels": per_label,
                    },
                    indent=2,
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            print(f"[ok]   {stem} (labels={sorted(int(v) for v in np.unique(labels))})")
        except Exception as exc:  # noqa: BLE001
            failures.append((stem, repr(exc)))
            print(f"[fail] {stem}: {exc}")

    summary_csv = out_root / "summary.csv"
    with summary_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "sample_id", "group", "label", "nm_per_pixel",
                "regions_total", "regions_used", "regions_clipped",
                "cd_median_px", "cd_median_nm",
                "height_median_px", "height_median_nm",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n요약 CSV: {summary_csv} ({len(rows)}행)")
    if failures:
        print(f"\n실패 {len(failures)}건:")
        for stem, reason in failures:
            print(f"  {stem}: {reason}")
    else:
        print("실패 없음.")


if __name__ == "__main__":
    main()
