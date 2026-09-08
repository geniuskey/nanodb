"""Allowlisted deterministic UTF-8 context export builder."""

from __future__ import annotations

import io
import json
from datetime import datetime
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from nanodb.domain.entities import ExportSnapshot

ENTRY_NAMES = ("context.md", "data.json", "task.md", "checks.json")
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def _iso(value: datetime) -> str:
    return value.isoformat()


def _data_json(snapshot: ExportSnapshot) -> str:
    image = snapshot.image
    payload = {
        "schema_version": snapshot.schema_version,
        "exported_at": _iso(snapshot.exported_at),
        "image": {
            "id": image.id,
            "original_filename": image.original_filename,
            "image_type": image.image_type,
            "product_id": image.product_id,
            "lot_id": image.lot_id,
            "wafer_id": image.wafer_id,
            "process_step": image.process_step,
            "pixel_width": image.pixel_width,
            "pixel_height": image.pixel_height,
            "calibration_nm_per_pixel": image.calibration_nm_per_pixel,
        },
        "measurements": [
            {
                "id": item.id,
                "image_id": item.image_id,
                "item_id": item.item_id,
                "measurement_type": item.measurement_type.value,
                "points": [[point.x, point.y] for point in item.points],
                "calibration_nm_per_pixel": item.calibration_nm_per_pixel,
                "value": item.value,
                "unit": item.unit,
                "label": item.label,
                "note": item.note,
                "measurement_method": item.measurement_method,
                "reference_status": item.reference_status.value,
                "created_at": _iso(item.created_at),
            }
            for item in snapshot.measurements
        ],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def _context_markdown() -> str:
    return """# NANoDB Measurement Context

This export contains one selected image record and all of its saved measurements.
Coordinates use the original image pixels: origin at top-left, X to the right, Y down.
Valid points satisfy 0 <= x < pixel_width and 0 <= y < pixel_height.
Each measurement has a measurement_type and an ordered points list:
- length: 2 points; value is the pixel distance times calibration_nm_per_pixel, in nm.
- angle: 3 points (vertex first, then the two arm ends); value is the angle at the
  vertex, in degrees; calibration does not affect it.
- curvature: 3 points on an arc; a circle is fitted through them and value is the
  fitted radius times calibration_nm_per_pixel, in nm.
unit is nm for length and curvature, deg for angle.
Stored precision is used for calculations.
Display values use decimal half-up to 2 places.
item_id links to a per-product measurement item definition, or is null for ad-hoc.
measurement_method is manual and reference_status is unreviewed.
Measurements are references, not certified ground truth or automatic boundary detection.

Every measurement is annotated by its own two fields, both optional and both free
text written by the user. label names what was measured (for example "Gate CD") and
is the caption drawn beside the shape; note is an observation memo about that same
measurement. Neither field changes value, and neither is a substitute for
measurement_type when grouping. image.process_step names the process step the whole
image was taken at, and is null when the user did not record one.

The image binary is not included; inspect it in NANoDB when visual context is required.
"""


def _task_markdown() -> str:
    return """# Development Task

Read data.json and write a CSV with columns measurement_type,unit,count,mean.
Group by measurement_type, not by the free-text label.
Output only measurement types with measurements, ordered length, angle, curvature.
Means are only comparable within a measurement_type because units differ across types.
Calculate means with stored precision and display mean to two decimal places.
Do not call external services and do not infer image boundaries.
"""


def _checks_json(snapshot: ExportSnapshot) -> str:
    payload = {
        "schema_version": snapshot.schema_version,
        "tolerance": 0.000001,
        "expected_summary": [
            {
                "measurement_type": row.measurement_type.value,
                "unit": row.unit,
                "count": row.count,
                "mean": row.mean,
            }
            for row in snapshot.expected_summary
        ],
        "synthetic_calculation": {
            "measurement_type": "length",
            "image_size_px": [1000, 800],
            "points": [[100, 100], [400, 500]],
            "calibration_nm_per_pixel": 0.2,
            "expected_distance_px": 500,
            "expected_value": 100,
            "unit": "nm",
            "purpose": "coordinate arithmetic only; not image boundary ground truth",
        },
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def build_context_zip(snapshot: ExportSnapshot) -> bytes:
    contents = {
        "context.md": _context_markdown(),
        "data.json": _data_json(snapshot),
        "task.md": _task_markdown(),
        "checks.json": _checks_json(snapshot),
    }
    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as archive:
        for name in ENTRY_NAMES:
            info = ZipInfo(name, ZIP_TIMESTAMP)
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            archive.writestr(info, contents[name].encode("utf-8"))
    return buffer.getvalue()
