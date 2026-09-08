"""Generated for run 2026-09-08-context-1 (context arm).

Produced from the exported context.md, data.json and task.md. context.md states
that coordinates are original image pixels, that value_nm is distance_px times
calibration_nm_per_pixel, that calculations use stored precision and that
displayed values are rounded half-up to two places. It also states that
annotations are drawn labels that carry no nm value and must not be counted in a
measurement summary, so this program reads the measurements array only.

Standard library only, no network access, nothing imported from NANoDB, and no
image-boundary inference.

Usage::

    python run-2026-09-08-context-1.py DATA_JSON [--out OUTPUT_CSV]
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

PARAMETER_ORDER = ("CD", "Depth", "Thickness")
FIELDNAMES = ["parameter_type", "count", "mean_nm"]


def _display_half_up(value: float, digits: int = 2) -> str:
    """Round for display only, half-up, as context.md specifies."""
    quantum = Decimal(1).scaleb(-digits)
    return str(Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP))


def summarize(data: dict) -> list[dict[str, str]]:
    # measurements only; annotations carry no nm value (context.md).
    grouped: dict[str, list[float]] = {}
    for measurement in data.get("measurements", []):
        grouped.setdefault(measurement["parameter_type"], []).append(
            float(measurement["value_nm"])
        )

    rows: list[dict[str, str]] = []
    for parameter_type in PARAMETER_ORDER:
        values = grouped.get(parameter_type)
        if not values:
            continue  # only parameter types that have measurements
        # Mean at stored precision; only the displayed value is rounded.
        mean_nm = math.fsum(values) / len(values)
        rows.append(
            {
                "parameter_type": parameter_type,
                "count": str(len(values)),
                "mean_nm": _display_half_up(mean_nm),
            }
        )
    return rows


def _write_csv(rows: list[dict[str, str]], stream) -> None:
    writer = csv.DictWriter(stream, fieldnames=FIELDNAMES)
    writer.writeheader()
    writer.writerows(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Summarize NANoDB measurements.")
    parser.add_argument("data", type=Path, help="Path to the exported data.json")
    parser.add_argument("--out", type=Path, default=None, help="CSV output path")
    args = parser.parse_args(argv)

    data = json.loads(args.data.read_text(encoding="utf-8"))
    rows = summarize(data)

    if args.out is None:
        _write_csv(rows, sys.stdout)
    else:
        with args.out.open("w", encoding="utf-8", newline="") as stream:
            _write_csv(rows, stream)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
