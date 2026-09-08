"""TEM 분석 툴킷 공용 유틸리티.

이 패키지(scripts/tem/)는 NanoDB 앱 런타임 **밖에서** 도는 오프라인 분석
도구다. constraints.md가 앱 기능에서 제외한 자동 세그멘테이션·자동 계측을
여기서 다루지만, 앱 코드에서 import 하지 않으며 네트워크도 쓰지 않는다.

라벨맵 규약:
    라벨맵은 uint8 2차원 배열(.npy)로 저장한다. 0..K-1 정수 클래스이며,
    값이 클수록 밝은 음영이다. 사람이 만든 마스크가 있으면 같은 형식의
    .npy 로 덮어써서 임시 라벨을 대체할 수 있다.
"""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from PIL import Image
from skimage.color import rgb2gray
from skimage.filters import threshold_multiotsu
from skimage.morphology import remove_small_holes, remove_small_objects
from skimage.restoration import denoise_tv_chambolle
from skimage.util import img_as_float

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
METADATA_CSV = REPO_ROOT / "data" / "samples" / "tem" / "metadata.csv"
DEMO_MANIFEST = REPO_ROOT / "data" / "demo" / "manifest.csv"
DEFAULT_OUT_ROOT = REPO_ROOT / "var" / "tem"

IMAGE_SUFFIXES = {".tif", ".tiff", ".png", ".jpg", ".jpeg"}


def load_gray(path: Path) -> NDArray[np.float64]:
    """TIFF/PNG를 [0, 1] 범위 grayscale float 배열로 읽는다."""
    image = Image.open(path)
    array = img_as_float(np.array(image))
    if array.ndim == 3:
        array = rgb2gray(array[..., :3])
    return np.asarray(array, dtype=np.float64)


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


def load_metadata_field(filename: str, field: str) -> str | None:
    """metadata.csv에서 파일명으로 임의 필드(예: device)를 찾는다."""
    if not METADATA_CSV.exists():
        return None
    with METADATA_CSV.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            if row.get("filename") == filename:
                value = row.get(field)
                return value if value else None
    return None


def percentile_normalize(
    gray: NDArray[np.float64],
    low: float = 1.0,
    high: float = 99.0,
) -> NDArray[np.float64]:
    """퍼센타일 정규화. 노출/대비가 다른 이미지를 같은 척도로 맞춘다.

    절대 밝기를 그대로 쓰면 새 이미지에서 클래스 구조가 무너지므로,
    특징 계산 전에 항상 이 정규화를 거친다.
    """
    lo, hi = np.percentile(gray, [low, high])
    if hi <= lo:
        return np.zeros_like(gray)
    scaled = (gray - lo) / (hi - lo)
    return np.clip(scaled, 0.0, 1.0)


def segment_multiotsu(
    gray: NDArray[np.float64],
    classes: int = 4,
    denoise_weight: float = 0.08,
    min_size: int = 400,
) -> tuple[NDArray[np.uint8], NDArray[np.float64]]:
    """음영 기준 multi-Otsu 세그멘테이션.

    반환값은 (라벨맵 uint8, 임계값 배열)이다.
    라벨은 0=가장 어두움 ... classes-1=가장 밝음 순서다.
    """
    smooth = denoise_tv_chambolle(gray, weight=denoise_weight)
    thresholds = threshold_multiotsu(smooth, classes=classes)
    labels = np.digitize(smooth, bins=thresholds)

    cleaned = labels.copy()
    for value in range(classes):
        mask = labels == value
        mask = remove_small_objects(mask, max_size=min_size)
        mask = remove_small_holes(mask, max_size=min_size)
        cleaned[mask] = value

    return cleaned.astype(np.uint8), np.asarray(thresholds, dtype=np.float64)


def save_labelmap(path: Path, labels: NDArray[np.uint8]) -> None:
    """라벨맵을 uint8 .npy로 저장한다."""
    path.parent.mkdir(parents=True, exist_ok=True)
    np.save(path, labels.astype(np.uint8))


def load_labelmap(path: Path) -> NDArray[np.uint8]:
    """라벨맵 .npy를 읽는다."""
    return np.load(path).astype(np.uint8)


def resolve(path: Path) -> Path:
    """상대 경로를 REPO_ROOT 기준 절대 경로로 만든다."""
    return path if path.is_absolute() else (REPO_ROOT / path)


def iter_images(folder: Path) -> list[Path]:
    """폴더 안의 이미지 파일을 이름 순으로 결정론적으로 나열한다."""
    return sorted(
        p for p in folder.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES
    )
