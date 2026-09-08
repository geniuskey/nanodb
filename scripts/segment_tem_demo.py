"""TEM 이미지 음영 기반 세그멘테이션 데모.

밝기(음영) 히스토그램을 multi-Otsu로 나누어 이미지를 K개 구획으로 분리한다.
학습 데이터 없이 동작하는 고전 영상처리 방식이며, NanoDB에서
"이 TEM 이미지를 자동으로 구획할 수 있는가"를 확인하기 위한 예시다.

사용법:
    python scripts/segment_tem_demo.py data/demo/images/demo_tem_001.png
    python scripts/segment_tem_demo.py data/samples/tem/images/tem_007.tif --classes 5

출력은 var/segmentation/<sample_id>/ 아래에 생성한다(git 추적 대상 아님).
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from PIL import Image
from skimage.color import label2rgb, rgb2gray
from skimage.filters import threshold_multiotsu
from skimage.morphology import remove_small_holes, remove_small_objects
from skimage.restoration import denoise_tv_chambolle
from skimage.segmentation import find_boundaries
from skimage.util import img_as_float

REPO_ROOT = Path(__file__).resolve().parent.parent
METADATA_CSV = REPO_ROOT / "data" / "samples" / "tem" / "metadata.csv"
DEMO_MANIFEST = REPO_ROOT / "data" / "demo" / "manifest.csv"
DEFAULT_OUT_ROOT = REPO_ROOT / "var" / "segmentation"


def load_gray(path: Path) -> np.ndarray:
    """TIFF/PNG를 [0, 1] 범위 grayscale float 배열로 읽는다."""
    image = Image.open(path)
    array = img_as_float(np.array(image))
    if array.ndim == 3:
        array = rgb2gray(array[..., :3])
    return array


def load_scale(filename: str) -> float | None:
    """metadata.csv 또는 demo manifest에서 해당 파일의 nm/pixel 값을 찾는다."""
    lookups = [
        (METADATA_CSV, "filename", "length_nm_per_pixel"),
        (DEMO_MANIFEST, "demo_filename", "calibration_nm_per_pixel"),
    ]
    for csv_path, name_col, value_col in lookups:
        if not csv_path.exists():
            continue
        with csv_path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                if row.get(name_col) == filename:
                    try:
                        return float(row[value_col])
                    except (KeyError, TypeError, ValueError):
                        return None
    return None


def segment(
    gray: np.ndarray,
    classes: int,
    denoise_weight: float,
    min_size: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """음영 기준 multi-Otsu 세그멘테이션.

    반환값은 (라벨맵, 임계값 배열, 평활화된 이미지)이다.
    라벨은 0=가장 어두움 ... classes-1=가장 밝음 순서다.
    """
    # TEM은 shot noise가 강해서 임계값이 픽셀 단위로 흔들린다.
    # 경계는 살리면서 평탄부만 고르게 만드는 total-variation 평활화를 먼저 적용한다.
    smooth = denoise_tv_chambolle(gray, weight=denoise_weight)

    thresholds = threshold_multiotsu(smooth, classes=classes)
    labels = np.digitize(smooth, bins=thresholds)

    # 클래스별로 잔점(salt) 제거. 한 클래스의 작은 조각은 주변 클래스에 흡수시킨다.
    cleaned = labels.copy()
    for value in range(classes):
        mask = labels == value
        mask = remove_small_objects(mask, min_size=min_size)
        mask = remove_small_holes(mask, area_threshold=min_size)
        cleaned[mask] = value

    return cleaned, thresholds, smooth


def summarize(
    labels: np.ndarray,
    gray: np.ndarray,
    thresholds: np.ndarray,
    nm_per_px: float | None,
) -> list[dict[str, object]]:
    """클래스별 면적/평균 밝기 통계."""
    total = labels.size
    edges = [0.0, *thresholds.tolist(), 1.0]
    rows: list[dict[str, object]] = []
    for value in range(int(labels.max()) + 1):
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


def render(
    gray: np.ndarray,
    smooth: np.ndarray,
    labels: np.ndarray,
    thresholds: np.ndarray,
    out_dir: Path,
    title: str,
) -> None:
    """원본/히스토그램/구획맵/경계 오버레이 4분할 그림과 개별 PNG 저장."""
    # 어두운 클래스 -> 밝은 클래스 순서가 눈에 보이도록 색을 명시한다.
    n_classes = int(labels.max()) + 1
    palette = plt.get_cmap("viridis")(np.linspace(0.05, 0.95, n_classes))[:, :3]
    colored = label2rgb(labels, colors=palette, bg_label=-1)
    boundaries = find_boundaries(labels, mode="outer")
    overlay = np.dstack([gray] * 3)
    overlay[boundaries] = [1.0, 0.25, 0.0]

    fig, axes = plt.subplots(2, 2, figsize=(13, 10))
    fig.suptitle(title, fontsize=13)

    axes[0, 0].imshow(gray, cmap="gray")
    axes[0, 0].set_title("1) original (grayscale)")

    axes[0, 1].hist(smooth.ravel(), bins=256, color="#444")
    for value in thresholds:
        axes[0, 1].axvline(value, color="#e34a33", linestyle="--")
    axes[0, 1].set_title(
        "2) intensity histogram + multi-Otsu thresholds\n"
        f"{np.round(thresholds, 3).tolist()}"
    )
    axes[0, 1].set_xlabel("normalized intensity")
    axes[0, 1].set_ylabel("pixel count")

    axes[1, 0].imshow(colored)
    axes[1, 0].set_title(f"3) segmentation map ({n_classes} classes)")
    edges = [0.0, *np.round(thresholds, 3).tolist(), 1.0]
    axes[1, 0].legend(
        handles=[
            plt.Rectangle(
                (0, 0),
                1,
                1,
                fc=palette[i],
                label=f"class {i}: {edges[i]}-{edges[i + 1]}",
            )
            for i in range(len(palette))
        ],
        loc="lower right",
        fontsize=8,
        framealpha=0.85,
    )

    axes[1, 1].imshow(overlay)
    axes[1, 1].set_title("4) class boundaries over original")

    for ax in (axes[0, 0], axes[1, 0], axes[1, 1]):
        ax.set_xticks([])
        ax.set_yticks([])

    fig.tight_layout()
    fig.savefig(out_dir / "panel.png", dpi=140)
    plt.close(fig)

    plt.imsave(out_dir / "segmentation_map.png", colored)
    plt.imsave(out_dir / "boundary_overlay.png", overlay)
    plt.imsave(out_dir / "label_index.png", labels, cmap="viridis")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("image", type=Path, help="TEM 이미지 경로 (TIFF/PNG)")
    parser.add_argument(
        "--classes", type=int, default=4, help="음영 구획 개수 (기본 4)"
    )
    parser.add_argument(
        "--denoise", type=float, default=0.08, help="TV 평활화 강도 (기본 0.08)"
    )
    parser.add_argument(
        "--min-size",
        type=int,
        default=400,
        help="제거할 잔점 최대 픽셀 수 (기본 400)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="출력 디렉터리 (기본 var/segmentation/<이름>)",
    )
    args = parser.parse_args()

    image_path = args.image if args.image.is_absolute() else (REPO_ROOT / args.image)
    if not image_path.exists():
        raise SystemExit(f"이미지를 찾을 수 없다: {image_path}")

    out_dir = args.out or (DEFAULT_OUT_ROOT / image_path.stem)
    out_dir.mkdir(parents=True, exist_ok=True)

    gray = load_gray(image_path)
    nm_per_px = load_scale(image_path.name)
    labels, thresholds, smooth = segment(
        gray, args.classes, args.denoise, args.min_size
    )
    stats = summarize(labels, gray, thresholds, nm_per_px)

    title = f"{image_path.name}  |  multi-Otsu k={args.classes}"
    if nm_per_px is not None:
        title += f"  |  {nm_per_px} nm/px"
    render(gray, smooth, labels, thresholds, out_dir, title)

    np.save(out_dir / "labels.npy", labels.astype(np.uint8))
    if image_path.is_relative_to(REPO_ROOT):
        image_ref = str(image_path.relative_to(REPO_ROOT))
    else:
        image_ref = str(image_path)
    report = {
        "image": image_ref,
        "size_px": [int(gray.shape[1]), int(gray.shape[0])],
        "method": "TV denoise -> multi-Otsu -> small-object cleanup",
        "classes": args.classes,
        "denoise_weight": args.denoise,
        "min_size": args.min_size,
        "nm_per_pixel": nm_per_px,
        "thresholds": [round(float(t), 4) for t in thresholds],
        "class_stats": stats,
    }
    report_json = json.dumps(report, indent=2, ensure_ascii=False)
    (out_dir / "report.json").write_text(report_json, encoding="utf-8")

    print(report_json)
    print(f"\n출력: {out_dir}")


if __name__ == "__main__":
    main()
