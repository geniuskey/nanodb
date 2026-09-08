"""요구사항 1 — 폴더 통째 배치 세그멘테이션.

<이미지 폴더>의 모든 이미지를 multi-Otsu로 배치 세그멘테이션한다.
- nm/pixel은 metadata.csv / demo manifest에서 파일명으로 매칭한다. 없으면 None.
- 이미지마다 별도 폴더에 라벨맵(labels.npy)과 리포트(report.json)를 남긴다.
- 전체가 끝나면 요약 CSV(이미지 식별자, 분류 그룹, 클래스별 면적 비율, 임계값)를
  한 행씩 만든다.
- 실패한 이미지가 있어도 중단하지 않고, 마지막에 실패 목록과 사유를 출력한다.
- 원본 이미지는 절대 수정하지 않는다. 결과물은 출력 디렉터리에만 만든다.

사용법:
    python scripts/tem/segment_batch.py data/samples/tem/images --classes 4
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    DEFAULT_OUT_ROOT,
    iter_images,
    load_gray,
    load_metadata_field,
    load_scale,
    resolve,
    save_labelmap,
    segment_multiotsu,
)


def class_stats(
    labels: np.ndarray,
    gray: np.ndarray,
    thresholds: np.ndarray,
    classes: int,
    nm_per_px: float | None,
) -> list[dict[str, object]]:
    """클래스별 면적/밝기 통계."""
    total = labels.size
    edges = [0.0, *thresholds.tolist(), 1.0]
    rows: list[dict[str, object]] = []
    for value in range(classes):
        mask = labels == value
        pixels = int(mask.sum())
        row: dict[str, object] = {
            "class": value,
            "intensity_range": [round(edges[value], 4), round(edges[value + 1], 4)],
            "pixels": pixels,
            "area_fraction": round(pixels / total, 4),
            "mean_intensity": round(float(gray[mask].mean()), 4) if pixels else None,
        }
        if nm_per_px is not None:
            row["area_nm2"] = round(pixels * nm_per_px**2, 2)
        rows.append(row)
    return rows


def process_one(
    image_path: Path,
    out_root: Path,
    classes: int,
    denoise: float,
    min_size: int,
    group_col: str,
) -> dict[str, object]:
    """이미지 한 장을 세그멘테이션하고 산출물을 저장한 뒤 요약 행을 만든다."""
    gray = load_gray(image_path)
    nm_per_px = load_scale(image_path.name)
    group = load_metadata_field(image_path.name, group_col) or "unknown"
    labels, thresholds = segment_multiotsu(gray, classes, denoise, min_size)
    stats = class_stats(labels, gray, thresholds, classes, nm_per_px)

    out_dir = out_root / image_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    save_labelmap(out_dir / "labels.npy", labels)
    report = {
        "image": image_path.name,
        "sample_id": image_path.stem,
        "group": group,
        "size_px": [int(gray.shape[1]), int(gray.shape[0])],
        "classes": classes,
        "denoise_weight": denoise,
        "min_size": min_size,
        "nm_per_pixel": nm_per_px,
        "thresholds": [round(float(t), 4) for t in thresholds],
        "class_stats": stats,
    }
    (out_dir / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    summary_row: dict[str, object] = {
        "sample_id": image_path.stem,
        "group": group,
        "nm_per_pixel": nm_per_px if nm_per_px is not None else "",
        "thresholds": ";".join(f"{t:.4f}" for t in thresholds),
    }
    for stat in stats:
        summary_row[f"class_{stat['class']}_frac"] = stat["area_fraction"]
    return summary_row


def write_summary(path: Path, rows: list[dict[str, object]], classes: int) -> None:
    """요약 CSV를 한 행씩 쓴다."""
    fields = ["sample_id", "group", "nm_per_pixel"]
    fields += [f"class_{i}_frac" for i in range(classes)]
    fields += ["thresholds"]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("folder", type=Path, help="이미지 폴더")
    parser.add_argument("--classes", type=int, default=4, help="음영 구획 개수")
    parser.add_argument("--denoise", type=float, default=0.08, help="TV 평활화 강도")
    parser.add_argument("--min-size", type=int, default=400, help="잔점 제거 픽셀 수")
    parser.add_argument(
        "--group-col", default="device", help="분류 그룹으로 쓸 metadata 컬럼"
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT_ROOT / "segmentation",
        help="출력 루트 (기본 var/tem/segmentation)",
    )
    args = parser.parse_args()

    folder = resolve(args.folder)
    if not folder.is_dir():
        raise SystemExit(f"폴더를 찾을 수 없다: {folder}")

    out_root = resolve(args.out)
    images = iter_images(folder)
    if not images:
        raise SystemExit(f"이미지가 없다: {folder}")

    rows: list[dict[str, object]] = []
    failures: list[tuple[str, str]] = []
    for image_path in images:
        try:
            row = process_one(
                image_path,
                out_root,
                args.classes,
                args.denoise,
                args.min_size,
                args.group_col,
            )
            rows.append(row)
            print(f"[ok]   {image_path.name}  group={row['group']}")
        except Exception as exc:  # noqa: BLE001 - 실패해도 배치를 멈추지 않는다
            failures.append((image_path.name, f"{type(exc).__name__}: {exc}"))
            print(f"[fail] {image_path.name}  {type(exc).__name__}: {exc}")

    summary_path = out_root / "summary.csv"
    write_summary(summary_path, rows, args.classes)

    print(f"\n처리 완료: {len(rows)}장 성공, {len(failures)}장 실패")
    print(f"요약 CSV: {summary_path}")
    if failures:
        print("\n실패 목록:")
        for name, reason in failures:
            print(f"  - {name}: {reason}")


if __name__ == "__main__":
    main()
