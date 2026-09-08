"""요구사항 2 — 영역 기준 자동 계측.

세그멘테이션 라벨맵에서 형상 계측값을 자동으로 뽑는다. 입력은 라벨맵 배열,
원본 이미지, 픽셀당 실제 길이(nm/pixel)다.

계측 항목:
- 폭(CD)   : 각 연결 요소마다 가로 스캔라인으로 폭을 재고, 높이별 폭 배열과
             대표값(중앙값)을 낸다.
- 높이     : 경계 상자 세로 길이.
- 간격     : 인접(무게중심 x 순서) 영역 무게중심 사이의 거리.
- 바닥 곡률 : 영역 하단 경계점에 원을 최소자승으로 피팅한 반지름.
- 측벽 각도 : 좌우 측벽 경계점에 직선을 최소자승으로 피팅한 수직 대비 기울기.

곡률/반경과 측벽 각도는 자동 계산하되, 아래 인자로 수동 미세조정할 수 있다.
원 피팅과 직선 피팅은 최소자승(결정론)이며 학습이나 난수를 쓰지 않는다.
경계에 닿은(잘린) 영역은 플래그를 달고 대표값 집계에서 제외한다.

이 스크립트는 NanoDB 앱 밖에서 도는 오프라인 계측 도구다.

사용법:
    python scripts/tem/measure.py \
        var/tem/segmentation/tem_007/labels.npy \
        data/samples/tem/images/tem_007.tif --label 0
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.patches import Circle  # noqa: E402
from skimage.measure import label as cc_label  # noqa: E402
from skimage.measure import regionprops  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    DEFAULT_OUT_ROOT,
    load_gray,
    load_labelmap,
    load_scale,
    resolve,
)


def fit_circle(
    xs: np.ndarray, ys: np.ndarray
) -> tuple[float, float, float] | None:
    """점집합에 원을 최소자승으로 피팅. 반환 (cx, cy, r). 실패 시 None.

    x^2 + y^2 = 2a*x + 2b*y + c 를 선형 최소자승으로 풀어 중심 (a, b)와
    반지름 r = sqrt(c + a^2 + b^2)을 얻는다. 난수 없음, 결정론적이다.
    """
    if xs.size < 3:
        return None
    matrix = np.column_stack([2 * xs, 2 * ys, np.ones_like(xs)])
    target = xs**2 + ys**2
    solution, *_ = np.linalg.lstsq(matrix, target, rcond=None)
    cx, cy, c = solution
    disc = c + cx**2 + cy**2
    if disc <= 0:
        return None
    return float(cx), float(cy), float(np.sqrt(disc))


def fit_sidewall(ys: np.ndarray, xs: np.ndarray) -> tuple[float, float] | None:
    """측벽 경계점에 x = m*y + c 직선을 최소자승 피팅. 반환 (기울기 m, 절편 c).

    수직 대비 각도는 atan(m)이다(측벽이 수직이면 m=0, 각도 0).
    """
    if ys.size < 2:
        return None
    matrix = np.column_stack([ys, np.ones_like(ys)])
    solution, *_ = np.linalg.lstsq(matrix, xs, rcond=None)
    return float(solution[0]), float(solution[1])


def to_nm(value: float | None, nm_per_px: float | None) -> float | None:
    """픽셀 값을 실제 길이(nm)로 변환. nm/pixel이 없으면 None."""
    if value is None or nm_per_px is None:
        return None
    return round(value * nm_per_px, 3)


def measure_region(
    region: object,
    mask: np.ndarray,
    shape: tuple[int, int],
    curvature_frac: float,
    sidewall_band: tuple[float, float],
    max_radius_factor: float,
) -> dict[str, object]:
    """연결 요소 하나의 계측값(픽셀 단위 원시값)."""
    min_row, min_col, max_row, max_col = region.bbox  # type: ignore[attr-defined]
    height_px = max_row - min_row
    local = region.image  # type: ignore[attr-defined]  # bbox 크롭 boolean

    # 폭(CD): 각 행의 전경 픽셀 수 = 가로 스캔라인 폭.
    widths = local.sum(axis=1)
    widths = widths[widths > 0]
    cd_median = float(np.median(widths)) if widths.size else None

    # 바닥 경계점: 각 열의 가장 아래(local 최대 행). 중앙 프레임만 원 피팅에 쓴다.
    cols = np.where(local.any(axis=0))[0]
    bottom_xs: list[float] = []
    bottom_ys: list[float] = []
    for col in cols:
        rows = np.where(local[:, col])[0]
        bottom_xs.append(min_col + col)
        bottom_ys.append(min_row + rows.max())
    circle = None
    if cols.size:
        span = cols.max() - cols.min()
        center = (cols.max() + cols.min()) / 2.0
        half = max(1.0, span * curvature_frac / 2.0)
        keep = [
            i
            for i, col in enumerate(cols)
            if abs(col - center) <= half
        ]
        if len(keep) >= 3:
            circle = fit_circle(
                np.array([bottom_xs[i] for i in keep]),
                np.array([bottom_ys[i] for i in keep]),
            )
    # 바닥이 거의 일직선이면 최소자승 원의 반지름이 폭발한다. 영역 폭의
    # max_radius_factor 배를 넘으면 곡률을 신뢰하지 않고 '평평'으로 본다.
    width_px = max_col - min_col
    bottom_flat = False
    if circle is not None and circle[2] > max_radius_factor * max(width_px, 1):
        bottom_flat = True
        circle = None

    # 측벽 경계점: 세로 대역(top/bottom 잘라냄) 안에서 각 행의 좌/우 끝.
    lo = int(round(sidewall_band[0] * height_px))
    hi = int(round(sidewall_band[1] * height_px))
    left_x: list[float] = []
    left_y: list[float] = []
    right_x: list[float] = []
    right_y: list[float] = []
    for row in range(lo, max(lo + 1, hi)):
        if row >= local.shape[0]:
            break
        present = np.where(local[row])[0]
        if present.size == 0:
            continue
        left_x.append(min_col + present.min())
        left_y.append(min_row + row)
        right_x.append(min_col + present.max())
        right_y.append(min_row + row)
    left_fit = fit_sidewall(np.array(left_y), np.array(left_x))
    right_fit = fit_sidewall(np.array(right_y), np.array(right_x))
    left_angle = np.degrees(np.arctan(left_fit[0])) if left_fit else None
    right_angle = np.degrees(np.arctan(right_fit[0])) if right_fit else None

    touches = (
        min_row == 0
        or min_col == 0
        or max_row == shape[0]
        or max_col == shape[1]
    )

    return {
        "bbox": [int(min_col), int(min_row), int(max_col), int(max_row)],
        "centroid": [float(region.centroid[1]), float(region.centroid[0])],  # type: ignore[attr-defined]
        "area_px": int(region.area),  # type: ignore[attr-defined]
        "clipped": bool(touches),
        "cd_px": cd_median,
        "cd_profile_px": [int(w) for w in widths.tolist()],
        "height_px": int(height_px),
        "bottom_circle": (
            {"cx": round(circle[0], 3), "cy": round(circle[1], 3),
             "radius_px": round(circle[2], 3)}
            if circle
            else None
        ),
        "bottom_flat": bottom_flat,
        "sidewall_angle_deg": {
            "left": round(float(left_angle), 3) if left_angle is not None else None,
            "right": round(float(right_angle), 3)
            if right_angle is not None
            else None,
        },
        "_left_pts": (left_x, left_y),
        "_right_pts": (right_x, right_y),
    }


def add_units(
    region_data: list[dict[str, object]], nm_per_px: float | None
) -> None:
    """픽셀 계측값 옆에 실제 길이(nm) 값을 추가한다."""
    for data in region_data:
        data["cd_nm"] = to_nm(data["cd_px"], nm_per_px)  # type: ignore[arg-type]
        data["height_nm"] = to_nm(float(data["height_px"]), nm_per_px)
        circle = data["bottom_circle"]
        if isinstance(circle, dict):
            circle["radius_nm"] = to_nm(circle["radius_px"], nm_per_px)


def compute_spacing(
    region_data: list[dict[str, object]], nm_per_px: float | None
) -> None:
    """무게중심 x 순서로 정렬해 인접 영역 중심 간 거리를 채운다."""
    order = sorted(
        range(len(region_data)),
        key=lambda i: region_data[i]["centroid"][0],  # type: ignore[index]
    )
    for pos, idx in enumerate(order):
        if pos + 1 < len(order):
            nxt = order[pos + 1]
            c1 = region_data[idx]["centroid"]
            c2 = region_data[nxt]["centroid"]
            dist = float(np.hypot(c2[0] - c1[0], c2[1] - c1[1]))  # type: ignore[index]
            region_data[idx]["spacing_to_next_px"] = round(dist, 3)
            region_data[idx]["spacing_to_next_nm"] = to_nm(dist, nm_per_px)
        else:
            region_data[idx]["spacing_to_next_px"] = None
            region_data[idx]["spacing_to_next_nm"] = None


def summary_stats(
    region_data: list[dict[str, object]], nm_per_px: float | None
) -> dict[str, object]:
    """잘리지 않은 영역만으로 이미지 단위 대표 통계를 낸다."""

    def med(key: str) -> float | None:
        vals = [
            r[key]
            for r in region_data
            if not r["clipped"] and isinstance(r.get(key), int | float)
        ]
        return round(float(np.median(vals)), 3) if vals else None

    kept = [r for r in region_data if not r["clipped"]]
    return {
        "regions_total": len(region_data),
        "regions_used": len(kept),
        "regions_clipped": len(region_data) - len(kept),
        "cd_median_px": med("cd_px"),
        "cd_median_nm": to_nm(med("cd_px"), nm_per_px),
        "height_median_px": med("height_px"),
        "height_median_nm": to_nm(med("height_px"), nm_per_px),
    }


def render_overlay(
    gray: np.ndarray,
    region_data: list[dict[str, object]],
    out_path: Path,
    scanlines: int,
) -> None:
    """원본 위에 스캔라인, 피팅 원/직선, 영역 번호를 그린다."""
    fig, ax = plt.subplots(figsize=(11, 9))
    ax.imshow(gray, cmap="gray")
    for num, data in enumerate(region_data, start=1):
        x0, y0, x1, y1 = data["bbox"]  # type: ignore[misc]
        clipped = data["clipped"]
        color = "#f03b20" if clipped else "#2c7fb8"

        # 피팅 도형(스캔라인/원/측벽)은 대표값에 쓰는 비경계 영역에만 그린다.
        if not clipped:
            for frac in np.linspace(0.2, 0.8, scanlines):
                ys = int(y0 + frac * (y1 - y0))
                ax.plot([x0, x1], [ys, ys], color="#fdae61", lw=0.8, alpha=0.8)

            circle = data["bottom_circle"]
            if isinstance(circle, dict):
                ax.add_patch(
                    Circle(
                        (circle["cx"], circle["cy"]),
                        circle["radius_px"],
                        fill=False,
                        ec="#31a354",
                        lw=1.2,
                        alpha=0.9,
                    )
                )
            for pts in (data["_left_pts"], data["_right_pts"]):
                xs, ys2 = pts  # type: ignore[misc]
                if len(xs) >= 2:
                    ax.plot(xs, ys2, color="#756bb1", lw=1.4)

        cx, cy = data["centroid"]  # type: ignore[misc]
        tag = f"{num}*" if clipped else str(num)
        ax.text(
            cx, cy, tag, color="white", fontsize=11, ha="center", va="center",
            bbox={"facecolor": color, "alpha": 0.8, "pad": 1, "edgecolor": "none"},
        )
    ax.set_title(
        "measurement overlay: scanlines, bottom circle, "
        "sidewall lines, region no. (*=clipped)"
    )
    ax.set_xticks([])
    ax.set_yticks([])
    fig.tight_layout()
    fig.savefig(out_path, dpi=140)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("labelmap", type=Path, help="라벨맵 .npy 경로")
    parser.add_argument("image", type=Path, help="원본 이미지 경로")
    parser.add_argument(
        "--label", type=int, default=0, help="계측 대상 클래스 값 (기본 0)"
    )
    parser.add_argument(
        "--min-area", type=int, default=200, help="노이즈로 볼 최소 면적(px)"
    )
    parser.add_argument(
        "--nm-per-px",
        type=float,
        default=None,
        help="픽셀당 nm. 미지정 시 metadata에서 파일명으로 찾음",
    )
    parser.add_argument(
        "--curvature-frac",
        type=float,
        default=0.6,
        help="바닥 원 피팅에 쓸 중앙 폭 비율(수동 미세조정, 기본 0.6)",
    )
    parser.add_argument(
        "--sidewall-band",
        type=float,
        nargs=2,
        default=(0.2, 0.8),
        metavar=("LO", "HI"),
        help="측벽 직선 피팅에 쓸 세로 대역 비율(수동 미세조정, 기본 0.2 0.8)",
    )
    parser.add_argument(
        "--max-radius-factor",
        type=float,
        default=3.0,
        help="바닥 원 반지름이 영역 폭의 이 배수를 넘으면 평평으로 처리(수동 조정)",
    )
    parser.add_argument("--scanlines", type=int, default=3, help="오버레이 스캔라인 수")
    parser.add_argument("--out", type=Path, default=None, help="출력 디렉터리")
    args = parser.parse_args()

    labelmap_path = resolve(args.labelmap)
    image_path = resolve(args.image)
    labels = load_labelmap(labelmap_path)
    gray = load_gray(image_path)
    nm_per_px = args.nm_per_px
    if nm_per_px is None:
        nm_per_px = load_scale(image_path.name)

    mask = labels == args.label
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
    summary = summary_stats(region_data, nm_per_px)

    out_dir = args.out or (DEFAULT_OUT_ROOT / "measure" / image_path.stem)
    out_dir = resolve(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    render_overlay(gray, region_data, out_dir / "overlay.png", args.scanlines)

    # 내부 피팅 점들은 JSON에서 제외한다.
    clean = []
    for data in region_data:
        clean.append({k: v for k, v in data.items() if not k.startswith("_")})
    result = {
        "image": image_path.name,
        "labelmap": str(labelmap_path.name),
        "measured_label": args.label,
        "nm_per_pixel": nm_per_px,
        "min_area": args.min_area,
        "curvature_frac": args.curvature_frac,
        "max_radius_factor": args.max_radius_factor,
        "sidewall_band": list(args.sidewall_band),
        "summary": summary,
        "regions": clean,
    }
    (out_dir / "measurements.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(json.dumps({"summary": summary, "regions": len(clean)},
                     indent=2, ensure_ascii=False))
    print(f"\n출력: {out_dir}")


if __name__ == "__main__":
    main()
