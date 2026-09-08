"""Shade-based multi-Otsu segmentation of TEM/SEM images.

The algorithm is ported verbatim in behaviour from ``scripts/segment_tem_demo``
(``load_gray`` / ``segment`` / ``summarize``): total-variation denoise, then a
multi-Otsu split of the intensity histogram, then per-class small-object
cleanup. It is fully deterministic -- no random state is used -- so the same
image and parameters always yield the same thresholds and statistics.

Rendering of derived PNGs is done with Pillow (never matplotlib) so the module
is safe to import on the server. matplotlib stays confined to the offline CLI.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from PIL import Image as PillowImage
from skimage.color import rgb2gray
from skimage.filters import threshold_multiotsu
from skimage.morphology import remove_small_holes, remove_small_objects
from skimage.restoration import denoise_tv_chambolle
from skimage.segmentation import find_boundaries
from skimage.transform import resize
from skimage.util import img_as_float

from nanodb.domain.entities import SegmentationClassStat
from nanodb.domain.errors import DomainError

METHOD = "multi-otsu"

# Above this pixel count the image is segmented at reduced resolution to stay
# within the time budget, then the label map is scaled back to full size. A
# 1200x1000 image (1.2M px) sits on the boundary and is processed as-is.
_MAX_WORKING_PIXELS = 1_200_000

# Deterministic class palette (dark -> light), enough for the 2..6 class range.
_PALETTE: tuple[tuple[int, int, int], ...] = (
    (68, 1, 84),
    (59, 82, 139),
    (33, 145, 140),
    (94, 201, 98),
    (253, 231, 37),
    (240, 249, 33),
)
_BOUNDARY_COLOR: tuple[int, int, int] = (255, 64, 0)

_MIN_CLASSES = 2
_MAX_CLASSES = 6


@dataclass(frozen=True, slots=True)
class SegmentationOutput:
    """The full-resolution result of one segmentation run."""

    labels: NDArray[np.uint8]
    thresholds: tuple[float, ...]
    class_stats: tuple[SegmentationClassStat, ...]
    downscaled: bool


def load_gray(path: Path) -> NDArray[np.float64]:
    """Read a TIFF/PNG/JPEG as a [0, 1] grayscale float array."""
    with PillowImage.open(path) as image:
        image.load()
        array = np.asarray(img_as_float(np.asarray(image)), dtype=np.float64)
    if array.ndim == 3:
        array = np.asarray(rgb2gray(array[..., :3]), dtype=np.float64)
    return array


def _validate_classes(classes: int) -> None:
    if not _MIN_CLASSES <= classes <= _MAX_CLASSES:
        raise DomainError(
            "INVALID_SEGMENTATION_CLASSES",
            f"classes must be between {_MIN_CLASSES} and {_MAX_CLASSES}.",
            field="classes",
        )


def segment(
    gray: NDArray[np.float64],
    classes: int,
    denoise_weight: float,
    min_size: int,
) -> tuple[NDArray[np.uint8], NDArray[np.float64]]:
    """Shade-based multi-Otsu segmentation.

    Returns ``(labels, thresholds)`` where labels run 0 (darkest) .. classes-1
    (brightest). Raises ``DomainError`` for images whose histogram cannot be
    split into the requested number of classes (e.g. a near-uniform image).
    """
    smooth = np.asarray(
        denoise_tv_chambolle(gray, weight=denoise_weight), dtype=np.float64
    )
    try:
        thresholds = np.asarray(
            threshold_multiotsu(smooth, classes=classes), dtype=np.float64
        )
    except ValueError as error:
        # multi-Otsu fails when the image has fewer distinct intensity levels
        # than requested classes -- a flat or near-uniform image cannot be split.
        raise DomainError(
            "UNSEGMENTABLE_IMAGE",
            "Image intensity cannot be split into the requested number of "
            "classes. It may be blank or nearly uniform.",
        ) from error

    labels = np.asarray(np.digitize(smooth, bins=thresholds), dtype=np.uint8)

    cleaned = labels.copy()
    if min_size > 0:
        # scikit-image >= 0.26 replaced ``min_size``/``area_threshold`` with
        # ``max_size`` (removes/fills components of size <= the value). To keep
        # the ported behaviour -- drop components smaller than ``min_size`` --
        # the threshold is ``min_size - 1``. Reached only when min_size > 0.
        max_size = min_size - 1
        for value in range(classes):
            mask = np.asarray(labels == value, dtype=np.bool_)
            mask = np.asarray(
                remove_small_objects(mask, max_size=max_size), dtype=np.bool_
            )
            mask = np.asarray(
                remove_small_holes(mask, max_size=max_size), dtype=np.bool_
            )
            cleaned[mask] = value

    return cleaned, thresholds


def summarize(
    labels: NDArray[np.uint8],
    gray: NDArray[np.float64],
    thresholds: NDArray[np.float64],
    nm_per_px: float | None,
) -> tuple[SegmentationClassStat, ...]:
    """Per-class pixel/area/mean-intensity statistics at full resolution."""
    total = int(labels.size)
    edges = [0.0, *(float(t) for t in thresholds), 1.0]
    stats: list[SegmentationClassStat] = []
    for value in range(len(edges) - 1):
        mask = labels == value
        pixels = int(mask.sum())
        stats.append(
            SegmentationClassStat(
                class_index=value,
                intensity_range=(round(edges[value], 4), round(edges[value + 1], 4)),
                pixels=pixels,
                area_fraction=round(pixels / total, 6) if total else 0.0,
                mean_intensity=(
                    round(float(gray[mask].mean()), 4) if pixels else None
                ),
                area_nm2=(
                    round(pixels * nm_per_px**2, 2) if nm_per_px is not None else None
                ),
            )
        )
    return tuple(stats)


def _downscale_factor(width: int, height: int) -> float:
    pixels = width * height
    if pixels <= _MAX_WORKING_PIXELS:
        return 1.0
    return float((_MAX_WORKING_PIXELS / pixels) ** 0.5)


def run_segmentation(
    gray: NDArray[np.float64],
    *,
    classes: int,
    denoise_weight: float,
    min_size: int,
    nm_per_pixel: float | None,
) -> SegmentationOutput:
    """Segment an image, downscaling first if it exceeds the pixel budget.

    The returned label map is always at the original resolution: a downscaled
    run is upscaled back with nearest-neighbour so stored coordinates and areas
    stay in original pixels. ``downscaled`` records whether that happened.
    """
    _validate_classes(classes)
    if gray.ndim != 2:
        raise DomainError(
            "UNSEGMENTABLE_IMAGE", "Image could not be read as a 2D grayscale array."
        )
    height, width = gray.shape
    if width < 2 or height < 2:
        raise DomainError(
            "UNSEGMENTABLE_IMAGE",
            "Image is too small to segment.",
        )

    factor = _downscale_factor(width, height)
    downscaled = factor < 1.0
    if downscaled:
        work_height = max(2, int(round(height * factor)))
        work_width = max(2, int(round(width * factor)))
        working = np.asarray(
            resize(
                gray,
                (work_height, work_width),
                order=1,
                mode="reflect",
                anti_aliasing=True,
                preserve_range=True,
            ),
            dtype=np.float64,
        )
    else:
        working = gray

    work_labels, thresholds = segment(working, classes, denoise_weight, min_size)

    if downscaled:
        labels = np.asarray(
            resize(
                work_labels,
                (height, width),
                order=0,
                mode="edge",
                anti_aliasing=False,
                preserve_range=True,
            ),
            dtype=np.uint8,
        )
    else:
        labels = work_labels

    class_stats = summarize(labels, gray, thresholds, nm_per_pixel)
    return SegmentationOutput(
        labels=labels,
        thresholds=tuple(round(float(t), 4) for t in thresholds),
        class_stats=class_stats,
        downscaled=downscaled,
    )


def _class_colors(class_count: int) -> NDArray[np.uint8]:
    chosen = _PALETTE[:class_count] if class_count <= len(_PALETTE) else _PALETTE
    return np.asarray(chosen, dtype=np.uint8)


def render_map_png(labels: NDArray[np.uint8], class_count: int) -> bytes:
    """Colour each class with the fixed palette and return PNG bytes."""
    colors = _class_colors(max(class_count, int(labels.max()) + 1))
    indices = np.clip(labels, 0, len(colors) - 1)
    colored = colors[indices]
    return _png_bytes(colored)


def render_boundary_png(
    gray: NDArray[np.float64], labels: NDArray[np.uint8]
) -> bytes:
    """Paint class boundaries over the grayscale original and return PNG bytes."""
    base = np.clip(gray, 0.0, 1.0)
    rgb = np.stack([base, base, base], axis=-1)
    rgb_u8 = np.asarray(np.round(rgb * 255.0), dtype=np.uint8)
    boundaries = np.asarray(find_boundaries(labels, mode="outer"), dtype=np.bool_)
    rgb_u8[boundaries] = np.asarray(_BOUNDARY_COLOR, dtype=np.uint8)
    return _png_bytes(rgb_u8)


def _png_bytes(rgb: NDArray[np.uint8]) -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    PillowImage.fromarray(rgb).save(buffer, format="PNG")
    return buffer.getvalue()
