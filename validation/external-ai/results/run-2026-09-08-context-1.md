# External AI verification run log — 2026-09-08-context-1

## Run identity

- **Run ID**: 2026-09-08-context-1
- **Date (UTC)**: 2026-09-08T12:41:51Z
- **Arm**: `context`
- **Operator**: repository maintainer, driving Claude Code in this session
- **External tool / model**: Claude Opus 5 (`claude-opus-5`) via Claude Code CLI
- **Export used**: image id 1 (`demo_tem_001.png`), export produced at
  `2026-09-08T12:39:14.031260+00:00`, `data.json` sha256 prefix `168a49884b831f73`
- **Input schema version**: 1.1 (see `../schema-version.txt`)
- **App build under test**: working tree at `f038f80`, stack started with
  `docker compose up --build --wait`
- **Screen recording**: none. This log and the committed artifacts are the record.

## Preparation

- **Preparation time (minutes)**: `unmeasured` — no human authored the prompt for
  this run, so there is no human preparation time to report. The context arm's
  preparation is mechanical (call the export endpoint and unzip: the four files
  are attached as-is with no hand-written explanation), but the human wall-clock
  comparison that EVL-006 asks for still needs a human-operated run.
- **Follow-up requests (count)**: 0
- **Follow-up notes**: none. `context.md` supplied the coordinate system, the
  `value_nm = distance_px * calibration_nm_per_pixel` rule, the stored-precision
  and half-up-to-2-places display rule, and the statement that annotations carry
  no nm value and must not be counted. `task.md` supplied the output columns,
  the CD/Depth/Thickness ordering and the "only types that have measurements"
  rule. Nothing had to be asked back.

## Generated code

- **Generated program path**: `generated/run-2026-09-08-context-1.py`
- **Notes on the generated code**: reads `data.json` directly. Uses the
  `measurements` array only and ignores `annotations` as `context.md` instructs
  (the array is empty in this export, so that rule is followed but not exercised
  by the data). Means are accumulated with `math.fsum` at stored precision and
  only the displayed value is rounded half-up to two places. Standard library
  only, no network access, no image-boundary inference.

## Execution

- **Run command**:

  ```
  python generated/run-2026-09-08-context-1.py <export>/data.json \
      --out results/run-2026-09-08-context-1.csv
  ```

- **Compare command**:

  ```
  python compare_summary.py --csv results/run-2026-09-08-context-1.csv \
      --checks <export>/checks.json --json results/run-2026-09-08-context-1.report.json
  ```

- **Produced CSV**:

  ```
  parameter_type,count,mean_nm
  CD,3,30.32
  Depth,2,72.55
  Thickness,2,11.17
  ```

- **Checks passed / total**: 3 / 3
- **Overall verdict**: `pass` (runner exit code 0)

## Verbatim runner output

```
verdict: pass
reason: all checks passed
  - {'parameter_type': 'CD', 'status': 'pass', 'expected_count': 3, 'actual_count': 3, 'expected_mean_nm': 30.32, 'actual_mean_nm': 30.32}
  - {'parameter_type': 'Depth', 'status': 'pass', 'expected_count': 2, 'actual_count': 2, 'expected_mean_nm': 72.55, 'actual_mean_nm': 72.55}
  - {'parameter_type': 'Thickness', 'status': 'pass', 'expected_count': 2, 'actual_count': 2, 'expected_mean_nm': 11.17, 'actual_mean_nm': 11.17}
```

## Notes

- The seven measurements on image 1 were created through the running app's API
  before exporting, so the export is a real app artifact rather than a fixture.
- **Limitation on independence**: this arm and `2026-09-08-manual-1` were both
  executed by the same model in the same session, not by two independent
  operators or two fresh tool sessions. The verdicts below are real, but the
  pair is not an independent A/B trial and must not be presented as one.
- Environment: Python 3.11.15 on Windows for the validation runner; the app
  itself ran in the Compose stack (`python:3.12.12-slim-bookworm` image).
