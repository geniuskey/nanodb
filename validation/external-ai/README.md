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
grouping the `measurements` array by `parameter_type` rather than by each
measurement's free-text `label`, including only parameter types that have
measurements, ordered CD, Depth, Thickness, with means computed at stored
precision and `mean_nm` displayed half-up to two decimal places.

## Files

| Path | Purpose |
| --- | --- |
| `prompts/manual-prompt.md` | Baseline arm: hand-written explanation to paste into the tool. |
| `prompts/context-prompt.md` | Context arm: instructions for attaching the exported files. |
| `schema-version.txt` | Input schema version (`2.0`) current exports carry. |
| `generated/summarize_measurements.py` | Example generated solution, replaced by the actual generated code per run. |
| `compare_summary.py` | Offline runner comparing a summary CSV against `checks.json`. |
| `results/run-log-template.md` | Per-run recording format (prep time, follow-ups, verdict, verbatim output). |
| `results/metrics.csv` | Aggregated metrics across recorded runs. |
| `results/run-<date>-<arm>.md` | Recorded run logs, with verbatim runner output. |
| `exports/<date>-image-<id>/` | Preserved exports the recorded runs ran against. |

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

## Recorded runs

| Run | Arm | Tool | Prep time | Follow-ups | Checks | Verdict |
| --- | --- | --- | --- | ---: | ---: | --- |
| [`2026-09-08-context-1`](results/run-2026-09-08-context-1.md) | context | claude-opus-5 via Claude Code | `unmeasured` | 0 | 3/3 | `pass` |
| [`2026-09-08-manual-1`](results/run-2026-09-08-manual-1.md) | manual | claude-opus-5 via Claude Code | `unmeasured` | 0 | 2/3 | `fail` |

Both runs used the same image (id 1) and the same task. The export they ran
against is preserved under [`exports/2026-09-08-image-1/`](exports/2026-09-08-image-1/)
so the verdicts reproduce without a running app. That preserved export carries
`schema_version` `1.1`, the contract in force when the runs were recorded, and is
left exactly as it was run. Schema `2.0` dropped the separate `annotations` array
and moved annotation onto each measurement as `label` and `note`; the summary
task is unchanged, because it always grouped by `parameter_type`.

**What these two runs do and do not show.**

The manual arm failed on one of three parameter types. The cause is double
rounding, not a coding mistake: the app UI renders `value_nm` to two decimal
places, the operator transcribes those displayed values, and the mean of rounded
values can land on the other side of a rounding boundary from the rounded mean of
stored values. Here Thickness gave `11.18` against an expected `11.17`, while CD
and Depth happened to survive the same transcription. The context arm never
touches the question, because it reads stored precision straight out of
`data.json`.

That is a real and reproducible failure mode of hand-transcribed context. It is
**not** evidence that hand-written explanations are worse in general, and it is
not a performance or token claim. Two further limits are recorded in the logs and
repeated here so they are not lost:

- **Preparation time is `unmeasured`.** No human was timed. EVL-006's
  headline comparison — how long a person spends preparing each arm — still
  needs a human-operated run, and no number here should be read as one.
- **The two arms are not independent.** The same model ran both, in one session.
  The verdicts are genuine; the pair is not a controlled A/B trial.

## Verdict meaning

- `pass` — every expected parameter type is present with the correct count and a
  displayed mean matching the expected mean (rounded half-up to two places,
  within `tolerance_nm`), in CD, Depth, Thickness order, with no extra rows.
- `fail` — the CSV was read but at least one check did not hold.
- `unverified` — the CSV or `checks.json` could not be read or parsed.
