"""Domain tests for structural feature extraction.

The central property is the round trip: every primitive the extractor emits must
recompute to a finite, positive value through ``calculate_measurement`` with the
same unit. That is exactly what the export validator checks (to 1e-9), so a
primitive that round-trips here is one the auto measurement can be stored and
exported from without ever presenting a fabricated number.
"""

from __future__ import annotations

import numpy as np
from nanodb.domain.calculations import calculate_measurement
from nanodb.domain.entities import UNIT_BY_TYPE, MeasurementType
from nanodb.domain.features import (
    FEATURE_BOTTOM_CURVATURE,
    FEATURE_CIRCLE_RADIUS,
    FEATURE_HEIGHT,
    FEATURE_SIDEWALL_LEFT,
    FEATURE_SIDEWALL_RIGHT,
    FEATURE_SPACING,
    FEATURE_WIDTH,
    _pick_region,
    extract_features,
)

_H = 200
_W = 200
_CALIB = 0.5


def _trapezoid(center_x: int = 100) -> np.ndarray:
    """A vertical structure with inward-tilted walls and a flat bottom.

    Class 0 is the structure, class 1 the background. Yields width, height and
    both sidewalls; the flat bottom makes curvature degenerate (collinear).
    """
    labels = np.ones((_H, _W), dtype=np.uint8)
    top, bottom = 40, 160
    for y in range(top, bottom):
        frac = (y - top) / (bottom - top)
        half = int(round(40 - 15 * frac))
        labels[y, center_x - half : center_x + half] = 0
    return labels


def _rectangle() -> np.ndarray:
    """Vertical walls and a flat bottom -- both curvature and tilt degenerate."""
    labels = np.ones((_H, _W), dtype=np.uint8)
    labels[40:160, 70:130] = 0
    return labels


def _dome() -> np.ndarray:
    """The lower half of a disc: a rounded bottom that yields curvature."""
    labels = np.ones((_H, _W), dtype=np.uint8)
    yy, xx = np.ogrid[:_H, :_W]
    disc = (xx - 100) ** 2 + (yy - 100) ** 2 <= 50**2
    labels[disc & (yy >= 100)] = np.uint8(0)
    return labels


def _two_trapezoids() -> np.ndarray:
    labels = np.ones((_H, _W), dtype=np.uint8)
    for center in (60, 140):
        top, bottom = 40, 160
        for y in range(top, bottom):
            frac = (y - top) / (bottom - top)
            half = int(round(20 - 6 * frac))
            labels[y, center - half : center + half] = 0
    return labels


def _disc(center_x: int, center_y: int, radius: int) -> np.ndarray:
    """A single filled disc of class 0 on a class-1 background."""
    labels = np.ones((_H, _W), dtype=np.uint8)
    yy, xx = np.ogrid[:_H, :_W]
    labels[(xx - center_x) ** 2 + (yy - center_y) ** 2 <= radius**2] = np.uint8(0)
    return labels


def _disc_row(centers_x: tuple[int, ...], center_y: int, radius: int) -> np.ndarray:
    """A row of like-sized discs -- a simple repeated pattern."""
    labels = np.ones((_H, _W), dtype=np.uint8)
    yy, xx = np.ogrid[:_H, :_W]
    for center_x in centers_x:
        labels[(xx - center_x) ** 2 + (yy - center_y) ** 2 <= radius**2] = np.uint8(0)
    return labels


def _disc_grid(
    centers_x: tuple[int, ...], centers_y: tuple[int, ...], radius: int
) -> np.ndarray:
    """An N×M grid of like-sized discs."""
    labels = np.ones((_H, _W), dtype=np.uint8)
    yy, xx = np.ogrid[:_H, :_W]
    for center_y in centers_y:
        for center_x in centers_x:
            labels[
                (xx - center_x) ** 2 + (yy - center_y) ** 2 <= radius**2
            ] = np.uint8(0)
    return labels


def _keys(extraction) -> set[str]:  # type: ignore[no-untyped-def]
    return {p.key for p in extraction.primitives}


def _skip_reason(extraction, key: str) -> str | None:  # type: ignore[no-untyped-def]
    for item in extraction.skipped:
        if item.key == key:
            return item.reason
    return None


def _assert_round_trips(extraction) -> None:  # type: ignore[no-untyped-def]
    for primitive in extraction.primitives:
        result = calculate_measurement(
            primitive.measurement_type,
            primitive.points,
            _CALIB,
            pixel_width=_W,
            pixel_height=_H,
        )
        assert np.isfinite(result.value)
        assert result.value > 0
        assert result.unit == UNIT_BY_TYPE[primitive.measurement_type]


def test_trapezoid_yields_width_height_and_both_sidewalls() -> None:
    extraction = extract_features(_trapezoid(), target_class=0)

    assert extraction is not None
    assert {
        FEATURE_WIDTH,
        FEATURE_HEIGHT,
        FEATURE_SIDEWALL_LEFT,
        FEATURE_SIDEWALL_RIGHT,
    } <= _keys(extraction)


def test_every_primitive_round_trips_through_calculate_measurement() -> None:
    for builder in (_trapezoid, _dome, _two_trapezoids):
        extraction = extract_features(builder(), target_class=0)
        assert extraction is not None
        assert extraction.primitives  # something was produced
        _assert_round_trips(extraction)


def test_width_and_height_are_lengths_sidewalls_are_angles() -> None:
    extraction = extract_features(_trapezoid(), target_class=0)
    assert extraction is not None
    by_key = {p.key: p for p in extraction.primitives}

    assert by_key[FEATURE_WIDTH].measurement_type is MeasurementType.LENGTH
    assert by_key[FEATURE_HEIGHT].measurement_type is MeasurementType.LENGTH
    assert by_key[FEATURE_SIDEWALL_LEFT].measurement_type is MeasurementType.ANGLE


def test_dome_yields_curvature_that_recovers_the_radius() -> None:
    extraction = extract_features(_dome(), target_class=0)

    assert extraction is not None
    assert FEATURE_BOTTOM_CURVATURE in _keys(extraction)
    curvature = next(
        p for p in extraction.primitives if p.key == FEATURE_BOTTOM_CURVATURE
    )
    result = calculate_measurement(
        curvature.measurement_type,
        curvature.points,
        _CALIB,
        pixel_width=_W,
        pixel_height=_H,
    )
    # Disc radius is 50 px; the three-point fit should land near 50 * calibration.
    assert abs(result.value - 50 * _CALIB) < 50 * _CALIB * 0.2


def test_flat_bottom_skips_curvature_with_a_reason() -> None:
    extraction = extract_features(_rectangle(), target_class=0)

    assert extraction is not None
    assert FEATURE_BOTTOM_CURVATURE not in _keys(extraction)
    reason = _skip_reason(extraction, FEATURE_BOTTOM_CURVATURE)
    assert reason is not None and "flat" in reason


def test_vertical_walls_skip_sidewalls_with_a_reason() -> None:
    extraction = extract_features(_rectangle(), target_class=0)

    assert extraction is not None
    assert FEATURE_SIDEWALL_LEFT not in _keys(extraction)
    reason = _skip_reason(extraction, FEATURE_SIDEWALL_LEFT)
    assert reason is not None and "vertical" in reason


def test_single_region_skips_spacing() -> None:
    extraction = extract_features(_trapezoid(), target_class=0)

    assert extraction is not None
    assert FEATURE_SPACING not in _keys(extraction)
    assert _skip_reason(extraction, FEATURE_SPACING) is not None


def test_two_regions_produce_spacing() -> None:
    extraction = extract_features(_two_trapezoids(), target_class=0)

    assert extraction is not None
    assert FEATURE_SPACING in _keys(extraction)


def test_spacing_ignores_border_clipped_noise() -> None:
    # A single interior structure plus a large blob jammed into the bottom-right
    # corner (touching both borders): the corner is a segmentation artefact, not
    # a neighbouring structure, so spacing must not run a line out to it.
    labels = _trapezoid(center_x=100)
    labels[180:_H, 180:_W] = 0  # 20x20 corner blob, above min_area, border-clipped

    extraction = extract_features(labels, target_class=0)

    assert extraction is not None
    assert FEATURE_SPACING not in _keys(extraction)
    assert _skip_reason(extraction, FEATURE_SPACING) is not None


def test_no_region_of_target_class_returns_none() -> None:
    labels = np.ones((_H, _W), dtype=np.uint8)  # all background, class 0 absent
    assert extract_features(labels, target_class=0) is None


def test_region_below_min_area_returns_none() -> None:
    labels = np.ones((_H, _W), dtype=np.uint8)
    labels[10:14, 10:14] = 0  # 16 px, well under the default 200
    assert extract_features(labels, target_class=0) is None


def test_extraction_is_deterministic() -> None:
    first = extract_features(_trapezoid(), target_class=0)
    second = extract_features(_trapezoid(), target_class=0)

    assert first is not None and second is not None
    assert [(p.key, p.points, p.confidence) for p in first.primitives] == [
        (p.key, p.points, p.confidence) for p in second.primitives
    ]


def test_confidences_are_within_the_unit_interval() -> None:
    for builder in (_trapezoid, _dome, _two_trapezoids):
        extraction = extract_features(builder(), target_class=0)
        assert extraction is not None
        for primitive in extraction.primitives:
            assert 0.0 <= primitive.confidence <= 1.0


def test_interior_region_is_not_flagged_clipped() -> None:
    extraction = extract_features(_trapezoid(), target_class=0)
    assert extraction is not None
    assert extraction.region_clipped is False
    assert extraction.region_area_px > 0


def test_border_touching_region_is_flagged_clipped() -> None:
    labels = np.ones((_H, _W), dtype=np.uint8)
    labels[0:120, 40:120] = 0  # touches the top edge (row 0)
    extraction = extract_features(labels, target_class=0)

    assert extraction is not None
    assert extraction.region_clipped is True


def test_circle_unit_yields_circle_radius_recovering_the_radius() -> None:
    extraction = extract_features(_disc(100, 100, 40), target_class=0)

    assert extraction is not None
    assert FEATURE_CIRCLE_RADIUS in _keys(extraction)
    circle = next(
        p for p in extraction.primitives if p.key == FEATURE_CIRCLE_RADIUS
    )
    assert circle.measurement_type is MeasurementType.CURVATURE
    result = calculate_measurement(
        circle.measurement_type,
        circle.points,
        _CALIB,
        pixel_width=_W,
        pixel_height=_H,
    )
    assert abs(result.value - 40 * _CALIB) < 40 * _CALIB * 0.15


def test_circle_unit_skips_bottom_curvature_and_sidewalls() -> None:
    extraction = extract_features(_disc(100, 100, 40), target_class=0)

    assert extraction is not None
    assert FEATURE_BOTTOM_CURVATURE not in _keys(extraction)
    assert FEATURE_SIDEWALL_LEFT not in _keys(extraction)
    assert FEATURE_SIDEWALL_RIGHT not in _keys(extraction)
    for key in (FEATURE_SIDEWALL_LEFT, FEATURE_SIDEWALL_RIGHT):
        reason = _skip_reason(extraction, key)
        assert reason is not None and "circular" in reason


def test_non_circular_unit_skips_circle_radius_with_reason() -> None:
    extraction = extract_features(_trapezoid(), target_class=0)

    assert extraction is not None
    assert FEATURE_CIRCLE_RADIUS not in _keys(extraction)
    reason = _skip_reason(extraction, FEATURE_CIRCLE_RADIUS)
    assert reason is not None and "circular" in reason


def test_dome_is_not_treated_as_a_full_circle() -> None:
    # The lower half of a disc is a rounded bottom, not a round unit: it must
    # still be measured as bottom curvature, not a full-circle radius.
    extraction = extract_features(_dome(), target_class=0)

    assert extraction is not None
    assert FEATURE_BOTTOM_CURVATURE in _keys(extraction)
    assert FEATURE_CIRCLE_RADIUS not in _keys(extraction)


def test_circle_unit_round_trips() -> None:
    extraction = extract_features(_disc(100, 100, 35), target_class=0)
    assert extraction is not None
    assert extraction.primitives
    _assert_round_trips(extraction)


def test_pattern_row_measures_the_central_unit() -> None:
    labels = _disc_row((40, 100, 160), center_y=100, radius=20)
    picked = _pick_region(labels, target_class=0, min_area=200)

    assert picked is not None
    representative, kept = picked
    assert len(kept) == 3
    # The unit nearest the image centre (x≈100) is the representative.
    assert abs(float(representative.centroid[1]) - 100.0) < 5.0


def test_pattern_grid_measures_the_central_unit() -> None:
    labels = _disc_grid((40, 100, 160), (40, 100, 160), radius=18)
    picked = _pick_region(labels, target_class=0, min_area=200)

    assert picked is not None
    representative, kept = picked
    assert len(kept) == 9
    assert abs(float(representative.centroid[0]) - 100.0) < 5.0
    assert abs(float(representative.centroid[1]) - 100.0) < 5.0


def test_single_dominant_region_is_still_picked_over_speckle() -> None:
    # One large trench plus a small comparable-but-not blob: the large one wins.
    labels = _trapezoid(center_x=100)
    picked = _pick_region(labels, target_class=0, min_area=200)

    assert picked is not None
    representative, _ = picked
    # The trapezoid is centred on x=100; a stray pick would sit elsewhere.
    assert abs(float(representative.centroid[1]) - 100.0) < 8.0


def test_points_stay_within_image_bounds() -> None:
    extraction = extract_features(_dome(), target_class=0)
    assert extraction is not None
    for primitive in extraction.primitives:
        for point in primitive.points:
            assert 0 <= point.x < _W
            assert 0 <= point.y < _H
