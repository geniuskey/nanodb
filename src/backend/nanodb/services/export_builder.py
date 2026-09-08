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
            "image_type": image.image_type.value,
            "product_id": image.product_id,
            "lot_id": image.lot_id,
            "wafer_id": image.wafer_id,
            "pixel_width": image.pixel_width,
            "pixel_height": image.pixel_height,
            "calibration_nm_per_pixel": image.calibration_nm_per_pixel,
        },
        "measurements": [
            {
                "id": item.id,
                "image_id": item.image_id,
                "parameter_type": item.parameter_type.value,
                "start_x": item.start.x,
                "start_y": item.start.y,
                "end_x": item.end.x,
                "end_y": item.end.y,
                "distance_px": item.distance_px,
                "calibration_nm_per_pixel": item.calibration_nm_per_pixel,
                "value_nm": item.value_nm,
                "note": item.note,
                "measurement_method": item.measurement_method,
                "reference_status": item.reference_status.value,
                "created_at": _iso(item.created_at),
            }
            for item in snapshot.measurements
        ],
        "annotations": [
            {
                "id": shape.id,
                "image_id": shape.image_id,
                "kind": shape.kind.value,
                "start_x": shape.start.x,
                "start_y": shape.start.y,
                "end_x": shape.end.x,
                "end_y": shape.end.y,
                "product": shape.product.value if shape.product else None,
                "step": shape.step,
                "measurement_name": shape.measurement_name,
                "created_at": _iso(shape.created_at),
            }
            for shape in snapshot.annotations
        ],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def _context_markdown() -> str:
    return """# NANoDB Measurement Context

This export contains one selected image record and all of its saved measurements.
Coordinates use the original image pixels: origin at top-left, X to the right, Y down.
Valid points satisfy 0 <= x < pixel_width and 0 <= y < pixel_height.
Distance is sqrt((end_x-start_x)^2 + (end_y-start_y)^2).
value_nm is distance_px multiplied by the measurement calibration_nm_per_pixel.
Stored precision is used for calculations.
Display values use decimal half-up to 2 places.
parameter_type is a user choice among CD, Depth and Thickness.
measurement_method is manual_two_point and reference_status is unreviewed.
Measurements are references, not certified ground truth or automatic boundary detection.

annotations are shapes a user drew to mark where they looked, in the same original
pixel coordinates. kind is arrow or circle. For an arrow, start is the tail and end
is the head. For a circle, start is the centre and end is a point on the circumference,
so the radius is the distance between them. product, step and measurement_name are
free user labels and may be empty.
annotations carry no calculated value: they are not measurements, they have no nm
value, and they must not be counted in any measurement summary.

The image binary is not included; inspect it in NANoDB when visual context is required.
"""


def _task_markdown() -> str:
    return """# Development Task

Read data.json and write a CSV with columns parameter_type,count,mean_nm.
Use the measurements array only; ignore annotations, which are labels without values.
Output only parameter types with measurements, ordered CD, Depth, Thickness.
Calculate means with stored precision and display mean_nm to two decimal places.
Do not call external services and do not infer image boundaries.
"""


def _checks_json(snapshot: ExportSnapshot) -> str:
    payload = {
        "schema_version": snapshot.schema_version,
        "tolerance_nm": 0.000001,
        "expected_summary": [
            {
                "parameter_type": row.parameter_type.value,
                "count": row.count,
                "mean_nm": row.mean_nm,
            }
            for row in snapshot.expected_summary
        ],
        "synthetic_calculation": {
            "image_size_px": [1000, 800],
            "start": [100, 100],
            "end": [400, 500],
            "calibration_nm_per_pixel": 0.2,
            "expected_distance_px": 500,
            "expected_value_nm": 100,
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
