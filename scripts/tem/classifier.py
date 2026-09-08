"""요구사항 3 — 픽셀 단위 세그멘테이션 분류기 학습 (ilastik 방식).

- 특징: 직접 만들지 않고 표준 필터 뱅크를 쓴다. 가우시안(intensity),
  소벨(edges), 헤시안 고윳값(texture)을 여러 스케일(기본 1~16)로 뽑는다.
- 분류기: 랜덤포레스트.
- 이미지마다 노출/대비가 달라, 특징 계산 전에 퍼센타일 정규화를 한다.
- 이미지당 픽셀 샘플링 수를 인자로 조절해 학습 데이터 증가에 대비한다.
- 학습 후 특징 중요도 상위 항목을 출력한다.

라벨 규약(라벨 부재 시 임시 라벨):
    var/tem/labels/<stem>.npy 에 사람이 만든 마스크가 있으면 그것을 쓰고,
    없으면 var/tem/segmentation/<stem>/labels.npy(multi-Otsu 임시 라벨)로
    대체한다. 임시 라벨은 나중에 실제 마스크로 덮어쓸 수 있다.

검증 원칙:
    학습에 쓴 이미지의 정확도는 '재현(reproduction)'이며 일반화가 아니다.
    --holdout 로 지정한 이미지는 학습에서 제외하고 정확도를 따로 찍는다.
    결과 표에 학습에 쓴 이미지(train)와 안 쓴 이미지(holdout)를 구분한다.

이 스크립트는 NanoDB 앱 밖에서 도는 오프라인 도구다. 학습 이미지가 수십 장
수준이면 U-Net 같은 딥러닝은 데이터가 부족하므로 쓰지 않는다.

사용법:
    python scripts/tem/classifier.py --holdout tem_009 tem_012
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from skimage.feature import hessian_matrix, hessian_matrix_eigvals
from skimage.filters import gaussian, sobel
from sklearn.ensemble import RandomForestClassifier

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import (  # noqa: E402
    DEFAULT_OUT_ROOT,
    REPO_ROOT,
    iter_images,
    load_gray,
    load_labelmap,
    load_metadata_field,
    percentile_normalize,
    resolve,
)

DEFAULT_SCALES = (1.0, 2.0, 4.0, 8.0, 16.0)
SEG_ROOT = DEFAULT_OUT_ROOT / "segmentation"
LABELS_DIR = DEFAULT_OUT_ROOT / "labels"


def feature_names(scales: tuple[float, ...]) -> list[str]:
    """필터 뱅크 특징 이름(중요도 출력에 쓴다)."""
    names: list[str] = []
    for sigma in scales:
        names.append(f"gaussian_s{sigma:g}")
        names.append(f"sobel_s{sigma:g}")
        names.append(f"hessian_eig1_s{sigma:g}")
        names.append(f"hessian_eig2_s{sigma:g}")
    return names


def feature_stack(
    gray: NDArray[np.float64], scales: tuple[float, ...]
) -> NDArray[np.float64]:
    """퍼센타일 정규화 후 스케일별 필터 뱅크를 쌓아 (H*W, F)로 반환한다.

    스케일마다 intensity(가우시안), edges(소벨), texture(헤시안 고윳값 2개).
    """
    norm = percentile_normalize(gray)
    planes: list[NDArray[np.float64]] = []
    for sigma in scales:
        smoothed = gaussian(norm, sigma=sigma)
        planes.append(smoothed)
        planes.append(sobel(smoothed))
        hrr, hrc, hcc = hessian_matrix(
            norm, sigma=sigma, order="rc", use_gaussian_derivatives=True
        )
        eig_large, eig_small = hessian_matrix_eigvals([hrr, hrc, hcc])
        planes.append(eig_large)
        planes.append(eig_small)
    stack = np.stack(planes, axis=-1)
    return stack.reshape(-1, stack.shape[-1]).astype(np.float64)


def resolve_labels(stem: str) -> Path | None:
    """사람이 만든 마스크가 있으면 우선, 없으면 임시 multi-Otsu 라벨."""
    user_mask = LABELS_DIR / f"{stem}.npy"
    if user_mask.exists():
        return user_mask
    temp = SEG_ROOT / stem / "labels.npy"
    return temp if temp.exists() else None


def sample_pixels(
    features: NDArray[np.float64],
    labels: NDArray[np.uint8],
    n: int,
    rng: np.random.Generator,
) -> tuple[NDArray[np.float64], NDArray[np.uint8]]:
    """이미지당 n개 픽셀을 층화 없이 무작위 샘플링(시드 고정으로 재현 가능)."""
    total = features.shape[0]
    if n >= total:
        return features, labels
    idx = rng.choice(total, size=n, replace=False)
    return features[idx], labels[idx]


def build_dataset(
    stems: list[str],
    images: dict[str, Path],
    scales: tuple[float, ...],
    samples: int,
    rng: np.random.Generator,
) -> tuple[NDArray[np.float64], NDArray[np.uint8]]:
    """학습 이미지들에서 샘플 픽셀 특징/라벨을 모은다."""
    feats: list[NDArray[np.float64]] = []
    labs: list[NDArray[np.uint8]] = []
    for stem in stems:
        label_path = resolve_labels(stem)
        if label_path is None:
            print(f"[skip] {stem}: 라벨 없음")
            continue
        gray = load_gray(images[stem])
        labels = load_labelmap(label_path).ravel()
        features = feature_stack(gray, scales)
        fx, lx = sample_pixels(features, labels, samples, rng)
        feats.append(fx)
        labs.append(lx)
    if not feats:
        raise SystemExit("학습에 쓸 라벨이 하나도 없다.")
    return np.concatenate(feats), np.concatenate(labs)


def accuracy_on(
    model: RandomForestClassifier,
    stem: str,
    images: dict[str, Path],
    scales: tuple[float, ...],
) -> float | None:
    """이미지 전체 픽셀에 대한 라벨 재현/일반화 정확도."""
    label_path = resolve_labels(stem)
    if label_path is None:
        return None
    gray = load_gray(images[stem])
    labels = load_labelmap(label_path).ravel()
    features = feature_stack(gray, scales)
    pred = model.predict(features)
    return float((pred == labels).mean())


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
        "--holdout",
        nargs="*",
        default=[],
        help="학습에서 제외하고 일반화 정확도만 잴 이미지 stem 목록",
    )
    parser.add_argument(
        "--samples", type=int, default=20000, help="이미지당 픽셀 샘플 수"
    )
    parser.add_argument("--trees", type=int, default=200, help="랜덤포레스트 트리 수")
    parser.add_argument(
        "--scales",
        type=float,
        nargs="*",
        default=list(DEFAULT_SCALES),
        help="필터 스케일(sigma) 목록 (기본 1 2 4 8 16)",
    )
    parser.add_argument("--seed", type=int, default=0, help="샘플링/RF 시드")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_ROOT / "classifier")
    args = parser.parse_args()

    folder = resolve(args.folder)
    scales = tuple(args.scales)
    rng = np.random.default_rng(args.seed)

    images = {p.stem: p for p in iter_images(folder)}
    all_stems = list(images)
    holdout = [s for s in args.holdout if s in images]
    train_stems = [s for s in all_stems if s not in holdout]

    x_train, y_train = build_dataset(train_stems, images, scales, args.samples, rng)
    model = RandomForestClassifier(
        n_estimators=args.trees,
        random_state=args.seed,
        n_jobs=-1,
    )
    model.fit(x_train, y_train)

    # 특징 중요도 상위.
    names = feature_names(scales)
    importances = sorted(
        zip(names, model.feature_importances_, strict=True),
        key=lambda kv: kv[1],
        reverse=True,
    )
    print("특징 중요도 상위 10:")
    for name, imp in importances[:10]:
        print(f"  {name:22s} {imp:.4f}")

    # 정확도: train(재현)과 holdout(일반화)을 명확히 구분.
    out_dir = resolve(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, object]] = []
    print("\n이미지별 정확도 (train=재현, holdout=일반화):")
    for stem in all_stems:
        role = "holdout" if stem in holdout else "train"
        acc = accuracy_on(model, stem, images, scales)
        group = load_metadata_field(images[stem].name, "device") or "unknown"
        rows.append(
            {
                "sample_id": stem,
                "group": group,
                "role": role,
                "accuracy": round(acc, 4) if acc is not None else "",
            }
        )
        acc_str = f"{acc:.4f}" if acc is not None else "n/a"
        print(f"  [{role:7s}] {stem:10s} group={group:8s} acc={acc_str}")

    train_accs = [r["accuracy"] for r in rows if r["role"] == "train"]
    hold_accs = [r["accuracy"] for r in rows if r["role"] == "holdout"]
    if train_accs:
        print(f"\n재현 정확도(train) 평균: {np.mean(train_accs):.4f}")
    if hold_accs:
        print(f"일반화 정확도(holdout) 평균: {np.mean(hold_accs):.4f}")
    else:
        print("holdout 미지정 — 일반화 성능은 측정되지 않았다(재현만).")

    metrics_path = out_dir / "accuracy.csv"
    with metrics_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=["sample_id", "group", "role", "accuracy"]
        )
        writer.writeheader()
        writer.writerows(rows)
    print(f"\n정확도 CSV: {metrics_path}")


if __name__ == "__main__":
    main()
