"""Unit tests for the deterministic multi-Otsu segmentation pipeline.

The algorithm is ported from ``scripts/segment_tem_demo`` and must stay
deterministic and produce statistics in original-pixel/nm units. Tests use
synthetic images with known intensity bands so the expected class assignment
is unambiguous.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from nanodb.domain.errors import DomainError
from nanodb.domain.segmentation import (
    METHOD,
    load_gray,
    render_boundary_png,
    render_map_png,
    run_segmentation,
    segment,
    summarize,
)
from numpy.typing import NDArray
from PIL import Image as PillowImage


def _four_band_image() -> NDArray[np.float64]:
    """A 100x100 image split into four equal horizontal bands of rising
    brightness, so a four-class split lands one label per band."""
    array = np.zeros((100, 100), dtype=np.float64)
    array[0:25, :] = 0.1
    array[25:50, :] = 0.4
    array[50:75, :] = 0.65
    array[75:100, :] = 0.9
    return array


def test_segment_assigns_one_label_per_intensity_band() -> None:
    gray = _four_band_image()

    labels, thresholds = segment(gray, classes=4, denoise_weight=0.01, min_size=0)

    assert labels.dtype == np.uint8
    assert sorted(np.unique(labels).tolist()) == [0, 1, 2, 3]
    assert thresholds.shape == (3,)
    # Darkest band is label 0, brightest is label 3.
    assert labels[10, 10] == 0
    assert labels[90, 90] == 3


def test_segment_is_deterministic() -> None:
    gray = _four_band_image()

    first, first_thresholds = segment(gray, 4, 0.02, 50)
    second, second_thresholds = segment(gray, 4, 0.02, 50)

    assert np.array_equal(first, second)
    assert np.array_equal(first_thresholds, second_thresholds)


def test_segment_raises_for_a_uniform_image() -> None:
    flat = np.full((40, 40), 0.5, dtype=np.float64)

    with pytest.raises(DomainError) as caught:
        segment(flat, classes=4, denoise_weight=0.05, min_size=0)

    assert caught.value.code == "UNSEGMENTABLE_IMAGE"


def test_summarize_reports_pixels_area_and_mean_intensity() -> None:
    gray = _four_band_image()
    labels, thresholds = segment(gray, 4, 0.01, 0)

    stats = summarize(labels, gray, thresholds, nm_per_px=2.0)

    assert len(stats) == 4
    total = sum(stat.pixels for stat in stats)
    assert total == 100 * 100
    # Each band is a quarter of the image.
    for stat in stats:
        assert stat.area_fraction == pytest.approx(0.25, abs=0.05)
        # 1 px -> 2nm, so 1 px^2 -> 4 nm^2.
        assert stat.area_nm2 == pytest.approx(stat.pixels * 4.0, rel=1e-6)
    # Denoising blurs band edges, so per-class means sit near (not exactly at)
    # the source intensities; ordering from darkest to brightest is what holds.
    means = [stat.mean_intensity for stat in stats]
    assert means[0] is not None and means[3] is not None
    assert means[0] < means[3]
    assert means[0] == pytest.approx(0.1, abs=0.05)
    assert means[3] == pytest.approx(0.9, abs=0.05)


def test_summarize_leaves_area_none_without_calibration() -> None:
    gray = _four_band_image()
    labels, thresholds = segment(gray, 4, 0.01, 0)

    stats = summarize(labels, gray, thresholds, nm_per_px=None)

    assert all(stat.area_nm2 is None for stat in stats)


def test_summarize_reports_none_mean_for_an_absent_class() -> None:
    labels = np.zeros((10, 10), dtype=np.uint8)
    gray = np.full((10, 10), 0.3, dtype=np.float64)
    thresholds = np.array([0.25, 0.5, 0.75], dtype=np.float64)

    stats = summarize(labels, gray, thresholds, nm_per_px=1.0)

    assert stats[0].pixels == 100
    assert stats[1].pixels == 0
    assert stats[1].mean_intensity is None


def test_run_segmentation_keeps_labels_at_original_resolution() -> None:
    gray = _four_band_image()

    output = run_segmentation(
        gray, classes=4, denoise_weight=0.01, min_size=0, nm_per_pixel=1.5
    )

    assert output.labels.shape == gray.shape
    assert output.downscaled is False
    assert len(output.thresholds) == 3
    assert len(output.class_stats) == 4


def test_run_segmentation_downscales_large_images_but_returns_full_size() -> None:
    # 2000x2000 = 4M px exceeds the 1.2M px working budget.
    rng_free = np.linspace(0.0, 1.0, 2000, dtype=np.float64)
    gray = np.tile(rng_free, (2000, 1))

    output = run_segmentation(
        gray, classes=3, denoise_weight=0.02, min_size=0, nm_per_pixel=None
    )

    assert output.downscaled is True
    assert output.labels.shape == (2000, 2000)
    assert output.labels.dtype == np.uint8


def test_run_segmentation_rejects_out_of_range_class_count() -> None:
    gray = _four_band_image()

    with pytest.raises(DomainError) as caught:
        run_segmentation(
            gray, classes=7, denoise_weight=0.01, min_size=0, nm_per_pixel=None
        )

    assert caught.value.code == "INVALID_SEGMENTATION_CLASSES"


def test_run_segmentation_rejects_a_non_2d_array() -> None:
    rgb = np.zeros((10, 10, 3), dtype=np.float64)

    with pytest.raises(DomainError) as caught:
        run_segmentation(
            rgb, classes=4, denoise_weight=0.01, min_size=0, nm_per_pixel=None
        )

    assert caught.value.code == "UNSEGMENTABLE_IMAGE"


def test_run_segmentation_rejects_a_tiny_image() -> None:
    tiny = np.zeros((1, 1), dtype=np.float64)

    with pytest.raises(DomainError) as caught:
        run_segmentation(
            tiny, classes=4, denoise_weight=0.01, min_size=0, nm_per_pixel=None
        )

    assert caught.value.code == "UNSEGMENTABLE_IMAGE"


def test_run_segmentation_is_deterministic_end_to_end() -> None:
    gray = _four_band_image()

    first = run_segmentation(
        gray, classes=4, denoise_weight=0.03, min_size=25, nm_per_pixel=0.5
    )
    second = run_segmentation(
        gray, classes=4, denoise_weight=0.03, min_size=25, nm_per_pixel=0.5
    )

    assert np.array_equal(first.labels, second.labels)
    assert first.thresholds == second.thresholds
    assert first.class_stats == second.class_stats


def test_render_map_png_returns_decodable_rgb_png() -> None:
    gray = _four_band_image()
    output = run_segmentation(
        gray, classes=4, denoise_weight=0.01, min_size=0, nm_per_pixel=None
    )

    data = render_map_png(output.labels, 4)

    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    from io import BytesIO

    with PillowImage.open(BytesIO(data)) as image:
        assert image.mode == "RGB"
        assert image.size == (100, 100)


def test_render_boundary_png_marks_edges_over_the_original() -> None:
    gray = _four_band_image()
    output = run_segmentation(
        gray, classes=4, denoise_weight=0.01, min_size=0, nm_per_pixel=None
    )

    data = render_boundary_png(gray, output.labels)

    from io import BytesIO

    with PillowImage.open(BytesIO(data)) as image:
        rgb = np.asarray(image)
    # The boundary colour (255, 64, 0) appears where bands meet.
    boundary_pixels = np.all(rgb == np.array([255, 64, 0]), axis=-1)
    assert boundary_pixels.any()


def test_load_gray_reads_a_png_as_normalised_grayscale(tmp_path: Path) -> None:
    path = tmp_path / "sample.png"
    PillowImage.new("L", (8, 6), color=128).save(path, format="PNG")

    gray = load_gray(path)

    assert gray.shape == (6, 8)
    assert gray.dtype == np.float64
    assert 0.0 <= float(gray.min()) <= float(gray.max()) <= 1.0


def test_load_gray_flattens_rgb_to_a_single_channel(tmp_path: Path) -> None:
    path = tmp_path / "rgb.png"
    PillowImage.new("RGB", (8, 6), color=(10, 200, 30)).save(path, format="PNG")

    gray = load_gray(path)

    assert gray.ndim == 2
    assert gray.shape == (6, 8)


def test_method_constant_matches_reported_algorithm() -> None:
    assert METHOD == "multi-otsu"
