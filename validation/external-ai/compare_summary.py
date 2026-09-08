"""Offline comparison runner for the exported NANoDB development task.

This program compares a summary CSV (``parameter_type,count,mean_nm``) produced
by an external AI tool against the ground truth carried inside the export's
``checks.json``. It is a plain verifier: it uses the standard library only,
never touches the network, imports nothing from the NANoDB application, and
makes no model calls. It only reads the two files it is given and reports what
it finds.

Verdicts are recorded honestly and verbatim:

* ``pass``       — every expected parameter type is present with the correct
                   count and a displayed mean that matches the expected mean,
                   in the fixed CD, Depth, Thickness order, with no extra rows.
* ``fail``       — the CSV was read but at least one check did not hold.
* ``unverified`` — the CSV or checks file could not be read or parsed, so no
                   claim about correctness can be made.

The expected ``mean_nm`` in ``checks.json`` is stored at full precision. The
task asks the generated code to display ``mean_nm`` to two decimal places, so
the runner compares against the expected mean rounded half-up to two places and
allows ``tolerance_nm`` of slack around it.

Usage::

    python compare_summary.py --csv OUTPUT_CSV --checks checks.json [--json REPORT_JSON]

Exit code: 0 pass, 1 fail, 2 unverified.
"""

from __future__ import annotations

import argparse
import csv
import json
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

PARAMETER_ORDER = ("CD", "Depth", "Thickness")

PASS = "pass"
FAIL = "fail"
UNVERIFIED = "unverified"


def _round_half_up(value: float, digits: int = 2) -> float:
    quantum = Decimal(1).scaleb(-digits)
    return float(Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP))


def _order_index(parameter_type: str) -> int:
    try:
        return PARAMETER_ORDER.index(parameter_type)
    except ValueError:
        return len(PARAMETER_ORDER)


def _load_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        expected_fields = ["parameter_type", "count", "mean_nm"]
        if reader.fieldnames != expected_fields:
            raise ValueError(
                f"CSV header {reader.fieldnames!r} is not {expected_fields!r}"
            )
        return list(reader)


def compare(csv_rows: list[dict[str, str]], checks: dict[str, Any]) -> dict[str, Any]:
    """Compare parsed CSV rows against checks.json, returning a structured report."""
    tolerance = float(checks.get("tolerance_nm", 0.0))
    expected = checks.get("expected_summary", [])
    expected_by_type = {row["parameter_type"]: row for row in expected}

    findings: list[dict[str, Any]] = []
    errors: list[str] = []

    # Parse the CSV numeric fields once; a bad cell makes the run unverifiable.
    parsed: list[dict[str, Any]] = []
    seen_types: list[str] = []
    for index, row in enumerate(csv_rows):
        parameter_type = (row.get("parameter_type") or "").strip()
        try:
            count = int((row.get("count") or "").strip())
            mean_nm = float((row.get("mean_nm") or "").strip())
        except ValueError as exc:
            return {
                "verdict": UNVERIFIED,
                "reason": f"row {index} has a non-numeric count or mean_nm: {exc}",
                "findings": [],
            }
        parsed.append(
            {"parameter_type": parameter_type, "count": count, "mean_nm": mean_nm}
        )
        seen_types.append(parameter_type)

    # Order of present rows must follow CD, Depth, Thickness.
    ordered = sorted(seen_types, key=_order_index)
    if seen_types != ordered:
        errors.append(f"row order {seen_types} is not {ordered}")

    # Every expected parameter type must be present, counted and valued right.
    for parameter_type, expected_row in expected_by_type.items():
        match = next(
            (row for row in parsed if row["parameter_type"] == parameter_type), None
        )
        if match is None:
            findings.append(
                {
                    "parameter_type": parameter_type,
                    "status": FAIL,
                    "detail": "missing from CSV",
                }
            )
            errors.append(f"{parameter_type} missing from CSV")
            continue

        expected_count = int(expected_row["count"])
        expected_display = _round_half_up(float(expected_row["mean_nm"]), 2)
        count_ok = match["count"] == expected_count
        mean_ok = abs(match["mean_nm"] - expected_display) <= tolerance
        status = PASS if (count_ok and mean_ok) else FAIL
        finding = {
            "parameter_type": parameter_type,
            "status": status,
            "expected_count": expected_count,
            "actual_count": match["count"],
            "expected_mean_nm": expected_display,
            "actual_mean_nm": match["mean_nm"],
        }
        findings.append(finding)
        if not count_ok:
            errors.append(
                f"{parameter_type} count {match['count']} != {expected_count}"
            )
        if not mean_ok:
            errors.append(
                f"{parameter_type} mean_nm {match['mean_nm']} != "
                f"{expected_display} (tolerance {tolerance})"
            )

    # Rows present in the CSV but not expected are also failures.
    for parameter_type in seen_types:
        if parameter_type not in expected_by_type:
            findings.append(
                {
                    "parameter_type": parameter_type,
                    "status": FAIL,
                    "detail": "not expected",
                }
            )
            errors.append(f"{parameter_type} is not an expected parameter type")

    verdict = PASS if not errors else FAIL
    return {
        "verdict": verdict,
        "reason": "; ".join(errors) if errors else "all checks passed",
        "findings": findings,
    }


def run(csv_path: Path, checks_path: Path) -> dict[str, Any]:
    try:
        checks = json.loads(checks_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return {"verdict": UNVERIFIED, "reason": f"cannot read checks: {exc}",
                "findings": []}
    try:
        csv_rows = _load_csv_rows(csv_path)
    except (OSError, ValueError) as exc:
        return {"verdict": UNVERIFIED, "reason": f"cannot read CSV: {exc}",
                "findings": []}
    return compare(csv_rows, checks)


_EXIT_CODES = {PASS: 0, FAIL: 1, UNVERIFIED: 2}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, required=True, help="Generated CSV output")
    parser.add_argument(
        "--checks", type=Path, required=True, help="Exported checks.json"
    )
    parser.add_argument(
        "--json", type=Path, default=None, help="Optional path for a JSON report"
    )
    args = parser.parse_args(argv)

    report = run(args.csv, args.checks)

    if args.json is not None:
        args.json.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    print(f"verdict: {report['verdict']}")
    print(f"reason: {report['reason']}")
    for finding in report["findings"]:
        print(f"  - {finding}")
    return _EXIT_CODES[report["verdict"]]


if __name__ == "__main__":
    raise SystemExit(main())
