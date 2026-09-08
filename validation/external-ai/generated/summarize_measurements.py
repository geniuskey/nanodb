"""Reference solution for the exported NANoDB development task.

This is an example of code an external AI tool may produce from the exported
context. It reads ``data.json`` and writes a ``parameter_type,count,mean_nm``
CSV, keeping only parameter types that have measurements and ordering them
CD, Depth, Thickness. Means are accumulated at stored precision and only the
displayed ``mean_nm`` is rounded half-up to two decimal places, matching the
task in ``task.md``.

The script is intentionally self-contained: it uses the standard library only,
performs no network access, imports nothing from the NANoDB application, and
does not infer image boundaries. It exists so the harness can execute a real
generated program against a real export; replace it with the actual generated
code when recording a run.

Usage::

    python summarize_measurements.py DATA_JSON [--out OUTPUT_CSV]

With no ``--out`` the CSV is written to stdout.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

# Fixed display order for the summary CSV. Only types present in the data are
# emitted, but whichever are present keep this relative order.
PARAMETER_ORDER = ("CD", "Depth", "Thickness")


def _round_half_up(value: float, digits: int = 2) -> str:
    quantum = Decimal(1).scaleb(-digits)
    return str(Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP))


def summarize(data: dict) -> list[dict[str, str]]:
    """Return summary rows ordered CD, Depth, Thickness for present types."""
    grouped: dict[str, list[float]] = {}
    for measurement in data.get("measurements", []):
        parameter_type = measurement["parameter_type"]
        grouped.setdefault(parameter_type, []).append(float(measurement["value_nm"]))

    rows: list[dict[str, str]] = []
    for parameter_type in PARAMETER_ORDER:
        values = grouped.get(parameter_type)
        if not values:
            continue
        # Accumulate at stored precision; only the displayed value is rounded.
        mean_nm = math.fsum(values) / len(values)
        rows.append(
            {
                "parameter_type": parameter_type,
                "count": str(len(values)),
                "mean_nm": _round_half_up(mean_nm, 2),
            }
        )
    return rows


def _write_csv(rows: list[dict[str, str]], stream) -> None:
    writer = csv.DictWriter(stream, fieldnames=["parameter_type", "count", "mean_nm"])
    writer.writeheader()
    writer.writerows(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", type=Path, help="Path to the exported data.json")
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Optional CSV output path; defaults to stdout",
    )
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
