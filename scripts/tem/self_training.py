"""요구사항 4 — self-training 자동 개선 루프.

라벨이 없는 새 이미지를 자동으로 학습에 흡수한다. 요구사항 3의 픽셀
분류기를 재사용한다.

루프:
1. 사람이 라벨링한(여기선 임시 라벨) 이미지로 분류기를 학습한다.
2. 라벨 없는 새 이미지를 예측하고 클래스 확률로 픽셀별 확신도를 얻는다.
3. 확신도가 임계값 이상인 픽셀만 의사 라벨로 학습 데이터에 추가한다.
4. 재학습하고 2번으로 돌아간다(반복 횟수는 인자).

반드시 지키는 것:
- 확신도 임계값 기본값 0.9. 낮으면 틀린 예측이 섞여 정확도가 오히려 떨어진다.
- 검증용 이미지를 처음부터 완전히 격리한다. 의사 라벨은 절대 여기 안 섞인다.
- 매 반복마다 검증 정확도, 추가된 의사 라벨 픽셀 수, 임계값을 넘긴 픽셀 비율을
  CSV로 기록한다.
- 검증 정확도가 이전보다 떨어지면 경고하고, --stop-on-drop 시 멈춘다.
- 마지막에 반복 횟수 대비 검증 정확도 그래프를 그린다.

정확도는 임시 라벨(multi-Otsu) 기준 일치도다. 실제 마스크가 생기면
var/tem/labels/<stem>.npy 로 덮어써서 같은 파이프라인을 그대로 쓴다.

사용법:
    python scripts/tem/self_training.py --iterations 4 --threshold 0.9
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from numpy.typing import NDArray  # noqa: E402
from sklearn.ensemble import RandomForestClassifier  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

from classifier import (  # noqa: E402
    DEFAULT_SCALES,
    feature_stack,
    resolve_labels,
)
from common import (  # noqa: E402
    DEFAULT_OUT_ROOT,
    REPO_ROOT,
    iter_images,
    load_gray,
    load_labelmap,
    resolve,
)


def labeled_pixels(
    stem: str,
    images: dict[str, Path],
    scales: tuple[float, ...],
    samples: int,
    rng: np.random.Generator,
) -> tuple[NDArray[np.float64], NDArray[np.uint8]] | None:
    """라벨 이미지에서 샘플 픽셀 특징/라벨."""
    label_path = resolve_labels(stem)
    if label_path is None:
        return None
    gray = load_gray(images[stem])
    labels = load_labelmap(label_path).ravel()
    features = feature_stack(gray, scales)
    if samples < features.shape[0]:
        idx = rng.choice(features.shape[0], size=samples, replace=False)
        return features[idx], labels[idx]
    return features, labels


def val_accuracy(
    model: RandomForestClassifier,
    stems: list[str],
    images: dict[str, Path],
    scales: tuple[float, ...],
) -> float:
    """격리된 검증 이미지 전체 픽셀의 평균 정확도."""
    accs: list[float] = []
    for stem in stems:
        label_path = resolve_labels(stem)
        if label_path is None:
            continue
        gray = load_gray(images[stem])
        labels = load_labelmap(label_path).ravel()
        pred = model.predict(feature_stack(gray, scales))
        accs.append(float((pred == labels).mean()))
    return float(np.mean(accs)) if accs else float("nan")


def pseudo_label(
    model: RandomForestClassifier,
    stem: str,
    images: dict[str, Path],
    scales: tuple[float, ...],
    threshold: float,
    samples: int,
    rng: np.random.Generator,
) -> tuple[NDArray[np.float64], NDArray[np.uint8], int, float]:
    """라벨 없는 이미지 예측→확신도 임계값 이상 픽셀만 의사 라벨로.

    반환 (특징, 의사라벨, 임계 통과 픽셀 수, 임계 통과 비율).
    """
    gray = load_gray(images[stem])
    features = feature_stack(gray, scales)
    proba = model.predict_proba(features)
    confidence = proba.max(axis=1)
    pred = model.classes_[proba.argmax(axis=1)].astype(np.uint8)
    keep = np.where(confidence >= threshold)[0]
    frac = float(keep.size / confidence.size)
    if keep.size == 0:
        empty_f: NDArray[np.float64] = np.empty((0, features.shape[1]))
        empty_l: NDArray[np.uint8] = np.empty((0,), dtype=np.uint8)
        return empty_f, empty_l, 0, frac
    if samples < keep.size:
        keep = rng.choice(keep, size=samples, replace=False)
    return features[keep], pred[keep], int((confidence >= threshold).sum()), frac


def default_split(stems: list[str]) -> tuple[list[str], list[str], list[str]]:
    """라벨/무라벨/검증 기본 분할. 검증은 처음부터 완전히 격리한다."""
    val = [s for s in ("tem_003", "tem_007") if s in stems]
    labeled = [s for s in ("tem_001", "tem_002", "tem_004") if s in stems]
    rest = [s for s in stems if s not in val and s not in labeled]
    return labeled or rest[:1], rest, val or stems[-1:]


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
    parser.add_argument("--labeled", nargs="*", default=None, help="초기 라벨 이미지")
    parser.add_argument("--unlabeled", nargs="*", default=None, help="의사라벨 대상")
    parser.add_argument("--val", nargs="*", default=None, help="격리 검증 이미지")
    parser.add_argument("--iterations", type=int, default=4, help="반복 횟수")
    parser.add_argument(
        "--threshold", type=float, default=0.9, help="의사라벨 확신도 임계값(기본 0.9)"
    )
    parser.add_argument("--samples", type=int, default=8000, help="이미지당 샘플 수")
    parser.add_argument("--trees", type=int, default=150, help="랜덤포레스트 트리 수")
    parser.add_argument(
        "--stop-on-drop",
        action="store_true",
        help="검증 정확도가 떨어지면 거기서 멈춘다",
    )
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_ROOT / "self_training")
    args = parser.parse_args()

    folder = resolve(args.folder)
    scales = tuple(DEFAULT_SCALES)
    rng = np.random.default_rng(args.seed)
    images = {p.stem: p for p in iter_images(folder)}
    stems = list(images)

    d_lab, d_unlab, d_val = default_split(stems)
    labeled = args.labeled if args.labeled is not None else d_lab
    val = args.val if args.val is not None else d_val
    unlabeled = args.unlabeled if args.unlabeled is not None else [
        s for s in d_unlab if s not in val
    ]
    # 검증 격리 보장.
    unlabeled = [s for s in unlabeled if s not in val and s not in labeled]

    print(f"labeled={labeled}\nunlabeled={unlabeled}\nval={val} (격리)")

    # 초기 라벨 데이터.
    base_feats: list[NDArray[np.float64]] = []
    base_labs: list[NDArray[np.uint8]] = []
    for stem in labeled:
        sampled = labeled_pixels(stem, images, scales, args.samples, rng)
        if sampled is not None:
            base_feats.append(sampled[0])
            base_labs.append(sampled[1])
    if not base_feats:
        raise SystemExit("초기 라벨 데이터가 없다.")

    pseudo_feats: list[NDArray[np.float64]] = []
    pseudo_labs: list[NDArray[np.uint8]] = []

    out_dir = resolve(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    log: list[dict[str, object]] = []
    prev_acc: float | None = None

    for iteration in range(args.iterations + 1):
        x = np.concatenate(base_feats + pseudo_feats)
        y = np.concatenate(base_labs + pseudo_labs)
        model = RandomForestClassifier(
            n_estimators=args.trees, random_state=args.seed, n_jobs=-1
        )
        model.fit(x, y)

        acc = val_accuracy(model, val, images, scales)

        added_total = 0
        frac_total: list[float] = []
        if iteration < args.iterations:
            for stem in unlabeled:
                pf, pl, added, frac = pseudo_label(
                    model, stem, images, scales,
                    args.threshold, args.samples, rng,
                )
                if pf.shape[0]:
                    pseudo_feats.append(pf)
                    pseudo_labs.append(pl)
                added_total += added
                frac_total.append(frac)

        frac_mean = float(np.mean(frac_total)) if frac_total else 0.0
        row = {
            "iteration": iteration,
            "threshold": args.threshold,
            "val_accuracy": round(acc, 4),
            "added_pseudo_pixels": added_total,
            "frac_above_threshold": round(frac_mean, 4),
            "train_pixels": int(x.shape[0]),
        }
        log.append(row)
        warn = ""
        if prev_acc is not None and acc < prev_acc:
            warn = "  [경고] 검증 정확도가 이전보다 하락"
        print(
            f"iter {iteration}: val_acc={acc:.4f} "
            f"added={added_total} frac>={args.threshold}={frac_mean:.3f}{warn}"
        )
        if warn and args.stop_on_drop:
            print("검증 정확도 하락으로 중단(--stop-on-drop).")
            break
        prev_acc = acc

    tag = f"{args.threshold:g}".replace(".", "")
    csv_path = out_dir / f"metrics_t{tag}.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(log[0]))
        writer.writeheader()
        writer.writerows(log)

    fig, ax = plt.subplots(figsize=(7, 4.5))
    ax.plot(
        [r["iteration"] for r in log],
        [r["val_accuracy"] for r in log],
        marker="o",
    )
    ax.set_xlabel("iteration")
    ax.set_ylabel("validation accuracy")
    ax.set_title(f"self-training (threshold={args.threshold})")
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    plot_path = out_dir / f"accuracy_t{tag}.png"
    fig.savefig(plot_path, dpi=140)
    plt.close(fig)

    print(f"\n지표 CSV: {csv_path}\n그래프: {plot_path}")


if __name__ == "__main__":
    main()
