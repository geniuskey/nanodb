"""Extract structural features from a segmentation label map.

The geometry is ported from ``scripts/tem/measure.py`` (median scan-line width,
bbox height, centroid spacing, least-squares bottom-circle radius, least-squares
sidewall tilt). Unlike the offline tool it emits nothing itself: each feature is
expressed as the *points* of an app measurement (length / angle / curvature), so
the stored value is whatever :func:`calculate_measurement` derives from those
points. That keeps auto measurements byte-for-byte consistent with the export
validator, which recomputes every value from its coordinates.

Everything here is deterministic -- least-squares fits, no random state -- and
free of matplotlib. A feature that would be degenerate (a flat bottom has no
curvature, a vertical wall has no tilt) is dropped with a reason rather than
forced into a meaningless number.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Protocol, cast

import numpy as np
from numpy.typing import NDArray
from scipy import ndimage as ndi
from skimage.measure import label as cc_label
from skimage.measure import regionprops
from skimage.segmentation import find_boundaries

from nanodb.domain.entities import MeasurementType, Point


class _Region(Protocol):
    """The subset of a scikit-image ``RegionProperties`` used here.

    scikit-image ships no type information, so its regions arrive as ``Any``;
    this protocol pins down the attributes the extractor reads.
    """

    @property
    def area(self) -> float: ...
    @property
    def bbox(self) -> tuple[int, int, int, int]: ...
    @property
    def image(self) -> NDArray[np.bool_]: ...
    @property
    def centroid(self) -> tuple[float, float]: ...


# Feature keys are stable identifiers used in the TIFF ``features`` tag and as
# the auto-measurement label suffix; the human label pairs each with a name.
FEATURE_WIDTH = "width_cd"
FEATURE_HEIGHT = "height"
FEATURE_SPACING = "spacing"
FEATURE_CIRCLE_RADIUS = "circle_radius"
FEATURE_CIRCLE_DIAMETER = "circle_diameter"
FEATURE_BOTTOM_CURVATURE = "bottom_curvature"
FEATURE_SIDEWALL_LEFT = "sidewall_angle_left"
FEATURE_SIDEWALL_RIGHT = "sidewall_angle_right"

_LABELS: dict[str, str] = {
    FEATURE_WIDTH: "auto: 폭(CD)",
    FEATURE_HEIGHT: "auto: 높이",
    FEATURE_SPACING: "auto: 간격",
    FEATURE_CIRCLE_RADIUS: "auto: 원 반경",
    FEATURE_CIRCLE_DIAMETER: "auto: 원 지름",
    FEATURE_BOTTOM_CURVATURE: "auto: 바닥 곡률 반경",
    FEATURE_SIDEWALL_LEFT: "auto: 좌측 측벽 각도",
    FEATURE_SIDEWALL_RIGHT: "auto: 우측 측벽 각도",
}

# The order features are emitted in, so output is stable across runs.
FEATURE_ORDER: tuple[str, ...] = (
    FEATURE_WIDTH,
    FEATURE_HEIGHT,
    FEATURE_SPACING,
    FEATURE_CIRCLE_RADIUS,
    FEATURE_CIRCLE_DIAMETER,
    FEATURE_BOTTOM_CURVATURE,
    FEATURE_SIDEWALL_LEFT,
    FEATURE_SIDEWALL_RIGHT,
)

_MIN_TILT_PX = 1.0  # below this horizontal run a sidewall counts as vertical

# A class often appears as a repeated array of like-sized units (a row of cells,
# an N×M grid, a field of contact holes). When two or more comparable units are
# present the extractor measures the one nearest the image centre -- the cleanest
# representative -- rather than the largest, which is often a cropped edge unit.
_PATTERN_AREA_FRAC = 0.5  # a unit this fraction of the largest counts as comparable

# Circle detection. A unit is treated as a full circle (round cell / contact
# hole / ring / annulus) when its *outer* outline fits a circle tightly, that
# outer circle is filled like a disc once interior holes are closed (so a hollow
# ring counts, but a bare open arc does not), and its bounding box is roughly
# square. Curvature is then the fitted radius and the diameter is 2r --
# "곡률은 원형이 보이면 그때만". Holes are filled before fitting so a ring is
# measured from its rim, not rejected as "not a filled disc".
_CIRCLE_MAX_RMS_FRAC = 0.14  # outer outline points must sit within this fraction of r
_CIRCLE_FILL_RANGE = (0.72, 1.28)  # filled area / (π r²): a full circle, not an arc
_CIRCLE_ASPECT_RANGE = (0.72, 1.39)  # bbox width / height near 1

# Bottom-arc curvature (trench / dome bottom) is emitted only when the sampled
# bottom is a clean circular arc: it must bow by at least this many pixels and
# fit a circle at least this tightly. A near-flat or ragged bottom is skipped.
_MIN_ARC_SAGITTA_PX = 2.0
_ARC_MAX_RMS_FRAC = 0.2


@dataclass(frozen=True, slots=True)
class FeaturePrimitive:
    """One structural feature, ready to become an auto measurement."""

    key: str
    label: str
    measurement_type: MeasurementType
    points: tuple[Point, ...]
    confidence: float


@dataclass(frozen=True, slots=True)
class SkippedFeature:
    key: str
    reason: str


@dataclass(frozen=True, slots=True)
class FeatureExtraction:
    """The features found for one representative region of a class."""

    target_class: int
    region_area_px: int
    region_clipped: bool
    primitives: tuple[FeaturePrimitive, ...] = field(default_factory=tuple)
    skipped: tuple[SkippedFeature, ...] = field(default_factory=tuple)


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _fit_circle(
    xs: NDArray[np.float64], ys: NDArray[np.float64]
) -> tuple[float, float, float] | None:
    """Least-squares circle fit; returns ``(cx, cy, radius)`` or None.

    Solves ``x^2 + y^2 = 2a*x + 2b*y + c`` linearly (ported from measure.py).
    """
    if xs.size < 3:
        return None
    matrix = np.column_stack([2 * xs, 2 * ys, np.ones_like(xs)])
    target = xs**2 + ys**2
    solution = np.linalg.lstsq(matrix, target, rcond=None)[0]
    cx, cy, c = float(solution[0]), float(solution[1]), float(solution[2])
    disc = c + cx**2 + cy**2
    if disc <= 0:
        return None
    return cx, cy, float(np.sqrt(disc))


def _circle_rms(
    xs: NDArray[np.float64], ys: NDArray[np.float64], cx: float, cy: float, r: float
) -> float:
    distances = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    return float(np.sqrt(np.mean((distances - r) ** 2)))


def _line_rms(ys: NDArray[np.float64], xs: NDArray[np.float64]) -> float | None:
    """RMS residual of ``x = m*y + c`` fitted to the edge points."""
    if ys.size < 2:
        return None
    matrix = np.column_stack([ys, np.ones_like(ys)])
    solution = np.linalg.lstsq(matrix, xs, rcond=None)[0]
    predicted = matrix @ solution
    return float(np.sqrt(np.mean((predicted - xs) ** 2)))


def _pick_region(
    labels: NDArray[np.uint8], target_class: int, min_area: int
) -> tuple[_Region, list[_Region]] | None:
    """Return the representative region and every kept region of the class.

    Preferring interior (non-clipped) components -- an interior structure
    measures cleanly -- the representative is chosen so a repeated pattern is
    handled well: when two or more comparably-sized units are present (a row of
    cells, an N×M grid, a field of holes) the unit nearest the image centre is
    measured, since edge units are often cropped or distorted. With a single
    dominant structure the largest is used. If every component touches the
    border the largest overall is used and flagged clipped by the caller.
    """
    mask = np.asarray(labels == target_class, dtype=np.int32)
    components = cc_label(mask, connectivity=2)
    regions = cast("list[_Region]", regionprops(components))
    kept = [r for r in regions if int(r.area) >= min_area]
    if not kept:
        return None
    height, width = labels.shape

    def clipped(region: _Region) -> bool:
        min_row, min_col, max_row, max_col = region.bbox
        return min_row == 0 or min_col == 0 or max_row == height or max_col == width

    interior = [r for r in kept if not clipped(r)]
    pool = interior or kept
    max_area = max(int(r.area) for r in pool)
    comparable = [r for r in pool if int(r.area) >= _PATTERN_AREA_FRAC * max_area]
    if len(comparable) >= 2:
        # A repeated pattern: measure the unit whose centroid is closest to the
        # image centre. Ties break toward the larger unit, then (via ``min``
        # returning the first minimum) the earliest label, so the pick is stable.
        center_row, center_col = (height - 1) / 2.0, (width - 1) / 2.0
        representative = min(
            comparable,
            key=lambda r: (
                (float(r.centroid[0]) - center_row) ** 2
                + (float(r.centroid[1]) - center_col) ** 2,
                -int(r.area),
            ),
        )
    else:
        representative = max(pool, key=lambda r: int(r.area))
    return representative, kept


def _width_feature(region: _Region) -> tuple[FeaturePrimitive | None, str | None]:
    min_row, min_col = region.bbox[0], region.bbox[1]
    local = np.asarray(region.image, dtype=np.bool_)
    widths = np.count_nonzero(local, axis=1)
    positive = widths[widths > 0]
    if positive.size == 0:
        return None, "no foreground rows"
    median = float(np.median(positive))
    # Row whose width is closest to the median -- the representative scan line.
    penalty = (widths == 0).astype(np.float64) * 1e9
    row = int(np.argmin(np.abs(widths.astype(np.float64) - median) + penalty))
    cols = np.where(local[row])[0]
    if cols.size < 2 or int(cols.max() - cols.min()) < 1:
        return None, "row too narrow to span"
    left = Point(float(min_col + int(cols.min())), float(min_row + row))
    right = Point(float(min_col + int(cols.max())), float(min_row + row))
    mean = float(positive.mean())
    cv = float(positive.std() / mean) if mean > 0 else 1.0
    confidence = _clamp01(1.0 / (1.0 + cv))
    return (
        FeaturePrimitive(
            key=FEATURE_WIDTH,
            label=_LABELS[FEATURE_WIDTH],
            measurement_type=MeasurementType.LENGTH,
            points=(left, right),
            confidence=confidence,
        ),
        None,
    )


def _height_feature(
    region: _Region, width: int, height: int
) -> tuple[FeaturePrimitive | None, str | None]:
    min_row, min_col, max_row, max_col = region.bbox
    if max_row - min_row < 2:
        return None, "region too short"
    cx = int(round(region.centroid[1]))
    cx = max(min_col, min(max_col - 1, cx))
    top = Point(float(cx), float(min_row))
    bottom = Point(float(cx), float(max_row - 1))
    bbox_area = (max_row - min_row) * (max_col - min_col)
    fill = float(region.area) / bbox_area if bbox_area else 0.0
    return (
        FeaturePrimitive(
            key=FEATURE_HEIGHT,
            label=_LABELS[FEATURE_HEIGHT],
            measurement_type=MeasurementType.LENGTH,
            points=(top, bottom),
            confidence=_clamp01(fill),
        ),
        None,
    )


def _spacing_feature(
    representative: _Region,
    kept: list[_Region],
    width: int,
    height: int,
    min_area_frac: float = 0.3,
) -> tuple[FeaturePrimitive | None, str | None]:
    others = [r for r in kept if r is not representative]
    if not others:
        return None, "needs two or more regions"

    def clipped(region: _Region) -> bool:
        min_row, min_col, max_row, max_col = region.bbox
        return min_row == 0 or min_col == 0 or max_row == height or max_col == width

    # Pitch is only meaningful between two comparable, fully-visible structures.
    # Drop border-clipped fragments (a partly-visible neighbour has an unreliable
    # centroid) and speckle far smaller than the subject, so a stray noise blob
    # in a corner cannot hijack the measurement -- as it did on synthetic TEM #10,
    # where the spacing line ran off to the image edge.
    rep_area = float(representative.area)
    candidates = [
        r
        for r in others
        if not clipped(r) and float(r.area) >= min_area_frac * rep_area
    ]
    if not candidates:
        return None, "no comparable interior neighbour"

    rcx, rcy = float(representative.centroid[1]), float(representative.centroid[0])
    nearest = min(
        candidates,
        key=lambda r: (float(r.centroid[1]) - rcx) ** 2
        + (float(r.centroid[0]) - rcy) ** 2,
    )
    ncx, ncy = float(nearest.centroid[1]), float(nearest.centroid[0])
    if abs(ncx - rcx) < 1e-6 and abs(ncy - rcy) < 1e-6:
        return None, "coincident centroids"
    return (
        FeaturePrimitive(
            key=FEATURE_SPACING,
            label=_LABELS[FEATURE_SPACING],
            measurement_type=MeasurementType.LENGTH,
            points=(Point(rcx, rcy), Point(ncx, ncy)),
            confidence=1.0,
        ),
        None,
    )


def _region_outline(
    region: _Region,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Outline pixel coordinates of the region, in image pixels."""
    local = np.asarray(region.image, dtype=np.bool_)
    outline = np.asarray(find_boundaries(local, mode="inner"), dtype=np.bool_)
    rows, cols = np.where(outline)
    min_row, min_col = region.bbox[0], region.bbox[1]
    xs = np.asarray(cols, dtype=np.float64) + float(min_col)
    ys = np.asarray(rows, dtype=np.float64) + float(min_row)
    return xs, ys


def _outer_outline(
    region: _Region,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Outline of the region's solid footprint (interior holes filled), in image
    pixels.

    Filling holes first means the outline traces only the *outer* perimeter, so a
    hollow ring yields its rim circle rather than both the inner and outer edges.
    For a solid disc this equals :func:`_region_outline`.
    """
    local = np.asarray(region.image, dtype=np.bool_)
    filled = np.asarray(ndi.binary_fill_holes(local), dtype=np.bool_)
    outline = np.asarray(find_boundaries(filled, mode="inner"), dtype=np.bool_)
    rows, cols = np.where(outline)
    min_row, min_col = region.bbox[0], region.bbox[1]
    xs = np.asarray(cols, dtype=np.float64) + float(min_col)
    ys = np.asarray(rows, dtype=np.float64) + float(min_row)
    return xs, ys


def _extreme_points(region: _Region) -> tuple[Point, Point, Point]:
    """Topmost, rightmost and bottommost foreground pixels, in image pixels.

    On a round unit these three lie on the circle and are never collinear, so a
    three-point fit recovers the radius. They are real pixels, not synthesised.
    """
    min_row, min_col = region.bbox[0], region.bbox[1]
    local = np.asarray(region.image, dtype=np.bool_)
    rows, cols = np.where(local)
    top = int(np.argmin(rows))
    bottom = int(np.argmax(rows))
    right = int(np.argmax(cols))
    return (
        Point(float(min_col + int(cols[top])), float(min_row + int(rows[top]))),
        Point(float(min_col + int(cols[right])), float(min_row + int(rows[right]))),
        Point(float(min_col + int(cols[bottom])), float(min_row + int(rows[bottom]))),
    )


def _circle_feature(
    region: _Region, clipped: bool
) -> tuple[FeaturePrimitive | None, FeaturePrimitive | None, str | None]:
    """Emit full-circle radius and diameter when the unit reads as a round disc
    or ring, else skip both with a shared reason.

    A clipped unit is never trusted as a circle (a cropped fragment is not round).
    The gate fills interior holes first, then combines a tight least-squares fit
    on the resulting *outer* outline, a disc-like fill of that outer circle, and a
    near-square bounding box. Filling holes is what lets a hollow ring/annulus
    (contact-hole rim, droplet edge) be measured from its rim circle instead of
    being rejected as "not a filled disc"; a bare open arc still fails the fill
    gate. The radius is the fitted curvature; the diameter is 2r, read from the
    topmost and bottommost outer pixels (the vertical extremes ``c ± r``).
    """
    if clipped:
        return None, None, "unit is clipped at the image border"
    local = np.asarray(region.image, dtype=np.bool_)
    box_h, box_w = local.shape
    if box_h < 3 or box_w < 3:
        return None, None, "unit too small for a circle fit"
    aspect = box_w / box_h
    aspect_lo, aspect_hi = _CIRCLE_ASPECT_RANGE
    if not aspect_lo <= aspect <= aspect_hi:
        return None, None, "unit is not circular (elongated)"
    xs, ys = _outer_outline(region)
    fit = _fit_circle(xs, ys)
    if fit is None or fit[2] <= 0:
        return None, None, "unit is not circular (no circle fit)"
    cx, cy, radius = fit
    rms = _circle_rms(xs, ys, cx, cy, radius)
    if rms / radius > _CIRCLE_MAX_RMS_FRAC:
        return None, None, "unit is not circular (edge deviates from a circle)"
    # Fill of the fitted *outer* circle by the solid footprint (holes closed): a
    # disc and a ring both fill it, an open arc does not.
    filled_area = float(np.asarray(ndi.binary_fill_holes(local)).sum())
    fill = filled_area / (math.pi * radius**2)
    fill_lo, fill_hi = _CIRCLE_FILL_RANGE
    if not fill_lo <= fill <= fill_hi:
        return None, None, "unit is not a full circle (open arc)"
    p_top, p_right, p_bottom = _extreme_points(region)
    area2 = (p_right.x - p_top.x) * (p_bottom.y - p_top.y) - (
        p_right.y - p_top.y
    ) * (p_bottom.x - p_top.x)
    if abs(area2) <= 1e-6:
        return None, None, "unit outline is degenerate"
    confidence = _clamp01(1.0 - rms / max(radius, 1.0))
    radius_primitive = FeaturePrimitive(
        key=FEATURE_CIRCLE_RADIUS,
        label=_LABELS[FEATURE_CIRCLE_RADIUS],
        measurement_type=MeasurementType.CURVATURE,
        points=(p_top, p_right, p_bottom),
        confidence=confidence,
    )
    diameter_primitive = FeaturePrimitive(
        key=FEATURE_CIRCLE_DIAMETER,
        label=_LABELS[FEATURE_CIRCLE_DIAMETER],
        measurement_type=MeasurementType.LENGTH,
        points=(p_top, p_bottom),
        confidence=confidence,
    )
    return radius_primitive, diameter_primitive, None


def _bottom_points(
    region: _Region, curvature_frac: float
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """Bottom-boundary coordinates within the central frame, in image pixels."""
    min_row, min_col = region.bbox[0], region.bbox[1]
    local = np.asarray(region.image, dtype=np.bool_)
    cols = np.where(local.any(axis=0))[0]
    if cols.size == 0:
        return np.empty(0), np.empty(0)
    center = (int(cols.max()) + int(cols.min())) / 2.0
    span = int(cols.max()) - int(cols.min())
    half = max(1.0, span * curvature_frac / 2.0)
    xs: list[float] = []
    ys: list[float] = []
    for col in cols:
        if abs(int(col) - center) > half:
            continue
        rows = np.where(local[:, col])[0]
        xs.append(float(min_col + int(col)))
        ys.append(float(min_row + int(rows.max())))
    return np.asarray(xs, dtype=np.float64), np.asarray(ys, dtype=np.float64)


def _curvature_feature(
    region: _Region, curvature_frac: float, max_radius_factor: float
) -> tuple[FeaturePrimitive | None, str | None]:
    xs, ys = _bottom_points(region, curvature_frac)
    if xs.size < 3:
        return None, "too few bottom points"
    # Three representative points on the arc: the two ends and the middle.
    order = np.argsort(xs)
    idx = (int(order[0]), int(order[order.size // 2]), int(order[-1]))
    p1 = Point(float(xs[idx[0]]), float(ys[idx[0]]))
    p2 = Point(float(xs[idx[1]]), float(ys[idx[1]]))
    p3 = Point(float(xs[idx[2]]), float(ys[idx[2]]))
    area2 = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)
    if abs(area2) <= 1e-6:
        return None, "bottom is flat (collinear)"
    # The bottom must actually bow: a near-flat bottom has no circular arc to
    # measure ("곡률은 원형이 보이면 그때만").
    if float(ys.max() - ys.min()) < _MIN_ARC_SAGITTA_PX:
        return None, "bottom is flat (no measurable curvature)"
    fit = _fit_circle(xs, ys)
    width_px = region.bbox[3] - region.bbox[1]
    if fit is not None and fit[2] > max_radius_factor * max(width_px, 1):
        return None, "bottom is flat (radius exceeds cap)"
    if fit is None:
        confidence = 0.5
    else:
        rms = _circle_rms(xs, ys, *fit)
        # Reject a ragged bottom that only loosely resembles a circular arc.
        if rms / max(fit[2], 1.0) > _ARC_MAX_RMS_FRAC:
            return None, "bottom is not a clean circular arc"
        confidence = _clamp01(1.0 - rms / max(fit[2], 1.0))
    return (
        FeaturePrimitive(
            key=FEATURE_BOTTOM_CURVATURE,
            label=_LABELS[FEATURE_BOTTOM_CURVATURE],
            measurement_type=MeasurementType.CURVATURE,
            points=(p1, p2, p3),
            confidence=confidence,
        ),
        None,
    )


def _sidewall_edges(
    region: _Region, band: tuple[float, float], side: str
) -> tuple[list[float], list[float]]:
    min_row, min_col = region.bbox[0], region.bbox[1]
    local = np.asarray(region.image, dtype=np.bool_)
    height_px = local.shape[0]
    lo = int(round(band[0] * height_px))
    hi = int(round(band[1] * height_px))
    xs: list[float] = []
    ys: list[float] = []
    for row in range(lo, max(lo + 1, hi)):
        if row >= height_px:
            break
        present = np.where(local[row])[0]
        if present.size == 0:
            continue
        edge = int(present.min()) if side == "left" else int(present.max())
        xs.append(float(min_col + edge))
        ys.append(float(min_row + row))
    return xs, ys


def _sidewall_feature(
    region: _Region, band: tuple[float, float], side: str
) -> tuple[FeaturePrimitive | None, str | None]:
    xs, ys = _sidewall_edges(region, band, side)
    if len(xs) < 2:
        return None, "too few sidewall points"
    top = Point(xs[0], ys[0])
    bottom = Point(xs[-1], ys[-1])
    if abs(bottom.x - top.x) < _MIN_TILT_PX:
        return None, "wall is vertical (no measurable tilt)"
    if abs(bottom.y - top.y) < 1.0:
        return None, "band too shallow"
    # Angle at the bottom point between the wall (to the top edge point) and the
    # vertical (straight up from the bottom point). That angle is the tilt.
    vertical_arm = Point(bottom.x, top.y)
    residual = _line_rms(np.asarray(ys), np.asarray(xs))
    run = abs(bottom.x - top.x)
    confidence = 1.0 if residual is None else _clamp01(1.0 - residual / max(run, 1.0))
    key = FEATURE_SIDEWALL_LEFT if side == "left" else FEATURE_SIDEWALL_RIGHT
    return (
        FeaturePrimitive(
            key=key,
            label=_LABELS[key],
            measurement_type=MeasurementType.ANGLE,
            points=(bottom, vertical_arm, top),
            confidence=confidence,
        ),
        None,
    )


def extract_features(
    labels: NDArray[np.uint8],
    *,
    target_class: int,
    min_area: int = 200,
    curvature_frac: float = 0.6,
    sidewall_band: tuple[float, float] = (0.2, 0.8),
    max_radius_factor: float = 3.0,
) -> FeatureExtraction | None:
    """Extract up to six structural features from a class's largest region.

    Returns ``None`` when the class has no region above ``min_area``. Each
    feature is emitted as measurement points; degenerate ones are recorded in
    ``skipped`` with a reason instead of being fabricated.
    """
    height, width = labels.shape
    picked = _pick_region(labels, target_class, min_area)
    if picked is None:
        return None
    representative, kept = picked
    min_row, min_col, max_row, max_col = representative.bbox
    clipped = (
        min_row == 0 or min_col == 0 or max_row == height or max_col == width
    )

    # A round unit (contact hole / circular cell / ring) is measured as a full
    # circle: its radius is the curvature and 2r the diameter, and it has no
    # bottom arc or vertical sidewalls to measure. A trench-like unit keeps the
    # bottom-arc + sidewall features.
    radius_primitive, diameter_primitive, circle_reason = _circle_feature(
        representative, clipped
    )
    circle_radius = (radius_primitive, circle_reason)
    circle_diameter = (diameter_primitive, circle_reason)
    is_circular = radius_primitive is not None
    if is_circular:
        curvature: tuple[FeaturePrimitive | None, str | None] = (
            None,
            "unit is circular (measured as full-circle radius)",
        )
        sidewall_left: tuple[FeaturePrimitive | None, str | None] = (
            None,
            "circular unit has no measurable sidewall",
        )
        sidewall_right: tuple[FeaturePrimitive | None, str | None] = (
            None,
            "circular unit has no measurable sidewall",
        )
    else:
        curvature = _curvature_feature(
            representative, curvature_frac, max_radius_factor
        )
        sidewall_left = _sidewall_feature(representative, sidewall_band, "left")
        sidewall_right = _sidewall_feature(representative, sidewall_band, "right")

    by_key: dict[str, tuple[FeaturePrimitive | None, str | None]] = {
        FEATURE_WIDTH: _width_feature(representative),
        FEATURE_HEIGHT: _height_feature(representative, width, height),
        FEATURE_SPACING: _spacing_feature(representative, kept, width, height),
        FEATURE_CIRCLE_RADIUS: circle_radius,
        FEATURE_CIRCLE_DIAMETER: circle_diameter,
        FEATURE_BOTTOM_CURVATURE: curvature,
        FEATURE_SIDEWALL_LEFT: sidewall_left,
        FEATURE_SIDEWALL_RIGHT: sidewall_right,
    }
    primitives: list[FeaturePrimitive] = []
    skipped: list[SkippedFeature] = []
    for key in FEATURE_ORDER:
        primitive, reason = by_key[key]
        if primitive is not None:
            primitives.append(primitive)
        else:
            skipped.append(SkippedFeature(key=key, reason=reason or "unavailable"))

    return FeatureExtraction(
        target_class=target_class,
        region_area_px=int(representative.area),
        region_clipped=clipped,
        primitives=tuple(primitives),
        skipped=tuple(skipped),
    )
