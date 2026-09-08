"""Generated for run 2026-09-08-manual-1 (manual arm).

Produced from the hand-written explanation in prompts/manual-prompt.md with the
measurement rows pasted in by the operator. No exported files were attached, so
this program has no data.json to read: the pasted rows are the input, embedded
below exactly as they were pasted.

The operator read the values off the NANoDB measurement page, which displays
value_nm with two decimal places, so the pasted values are the displayed
(already rounded) numbers rather than stored precision.

Standard library only, no network access, no image-boundary inference.

Usage::

    python run-2026-09-08-manual-1.py [--out OUTPUT_CSV]
"""

from __future__ import annotations

import argparse
import csv
import math
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

PARAMETER_ORDER = ("CD", "Depth", "Thickness")
FIELDNAMES = ["parameter_type", "count", "mean_nm"]

# Rows pasted by the operator as "parameter_type, value_nm", transcribed from
# the NANoDB measurement page (displayed to two decimal places).
PASTED_ROWS: list[tuple[str, float]] = [
    ("CD", 30.22),
    ("CD", 31.16),
    ("CD", 29.59),
    ("Depth", 70.50),
    ("Depth", 74.60),
    ("Thickness", 11.33),
    ("Thickness", 11.02),
]


def _display_half_up(value: float, digits: int = 2) -> str:
    quantum = Decimal(1).scaleb(-digits)
    return str(Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP))


def summarize(rows: list[tuple[str, float]]) -> list[dict[str, str]]:
    grouped: dict[str, list[float]] = {}
    for parameter_type, value_nm in rows:
        grouped.setdefault(parameter_type, []).append(float(value_nm))

    out: list[dict[str, str]] = []
    for parameter_type in PARAMETER_ORDER:
        values = grouped.get(parameter_type)
        if not values:
            continue
        mean_nm = math.fsum(values) / len(values)
        out.append(
            {
                "parameter_type": parameter_type,
                "count": str(len(values)),
                "mean_nm": _display_half_up(mean_nm),
            }
        )
    return out


def _write_csv(rows: list[dict[str, str]], stream) -> None:
    writer = csv.DictWriter(stream, fieldnames=FIELDNAMES)
    writer.writeheader()
    writer.writerows(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Summarize pasted measurements.")
    parser.add_argument("--out", type=Path, default=None, help="CSV output path")
    args = parser.parse_args(argv)

    rows = summarize(PASTED_ROWS)

    if args.out is None:
        _write_csv(rows, sys.stdout)
    else:
        with args.out.open("w", encoding="utf-8", newline="") as stream:
            _write_csv(rows, stream)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
