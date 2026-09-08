# External AI development verification (US-07)

This directory holds the evidence assets for comparing two ways of driving an
external AI coding tool on the **same task**:

- the **manual** arm — a person writes the explanation by hand, and
- the **context** arm — the person attaches NANoDB's exported context ZIP.

The comparison metrics are **preparation time**, **follow-up requests** and
**validation results**. There is no promise of improvement or token savings;
whatever the runs show is what gets recorded.

> **Boundaries.** These assets are a manual, offline verification activity that
> lives entirely outside the NANoDB Core runtime. Nothing here is wired into the
> application, and nothing here makes an automatic model call. Manual
> measurements are unreviewed references, not certified ground truth; the
> synthetic arithmetic case in `checks.json` is a separate coordinate-arithmetic
> sanity check. Results are recorded verbatim as `pass`, `fail` or `unverified`.

## The task

Both arms ask the external tool to perform the task in the export's `task.md`:
read `data.json` and write a CSV with columns `parameter_type,count,mean_nm`,
including only parameter types that have measurements, ordered CD, Depth,
Thickness, with means computed at stored precision and `mean_nm` displayed
half-up to two decimal places.

## Files

| Path | Purpose |
| --- | --- |
| `prompts/manual-prompt.md` | Baseline arm: hand-written explanation to paste into the tool. |
| `prompts/context-prompt.md` | Context arm: instructions for attaching the exported files. |
| `schema-version.txt` | Input schema version (`1.0`) the exports are expected to carry. |
| `generated/summarize_measurements.py` | Example generated solution, replaced by the actual generated code per run. |
| `compare_summary.py` | Offline runner comparing a summary CSV against `checks.json`. |
| `results/run-log-template.md` | Per-run recording format (prep time, follow-ups, verdict, verbatim output). |
| `results/metrics.csv` | Aggregated metrics across recorded runs (header only until runs exist). |

All Python here uses the standard library only, imports nothing from the NANoDB
application, and performs no network access.

## How to record a run

1. Produce an export ZIP for one image from NANoDB
   (`GET /api/images/{id}/context-export`) and unzip it.
2. Run either arm using the matching prompt file, in a fresh external AI session.
   Track preparation time and count every follow-up request.
3. Save the generated program under `generated/` and run it against the
   export's `data.json`:

   ```
   python generated/<program>.py path/to/data.json --out results/<run>.csv
   ```

4. Compare the produced CSV against the export's ground truth:

   ```
   python compare_summary.py --csv results/<run>.csv \
       --checks path/to/checks.json --json results/<run>.report.json
   ```

   The runner prints `verdict: pass|fail|unverified` and exits 0, 1 or 2.
   `unverified` means the CSV or checks could not be read or parsed — no
   correctness claim is made.

5. Copy `results/run-log-template.md` to `results/run-<date>-<arm>.md`, fill in
   every field, and paste the runner's verbatim output. Add one aggregation row
   to `results/metrics.csv`.

## Verdict meaning

- `pass` — every expected parameter type is present with the correct count and a
  displayed mean matching the expected mean (rounded half-up to two places,
  within `tolerance_nm`), in CD, Depth, Thickness order, with no extra rows.
- `fail` — the CSV was read but at least one check did not hold.
- `unverified` — the CSV or `checks.json` could not be read or parsed.
