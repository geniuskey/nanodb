# External AI verification run log — TEMPLATE

Copy this file to `results/run-YYYY-MM-DD-<arm>.md` for each recorded run and
fill in every field. Record results **verbatim**. Do not adjust, retry silently
or summarize away failures. If a step was not actually performed, say so and use
the `unverified` verdict — never guess a `pass`.

## Run identity

- **Run ID**: <e.g. 2026-09-08-context-1>
- **Date (UTC)**: <YYYY-MM-DDTHH:MM:SSZ>
- **Arm**: `manual` | `context`
- **Operator**: <who ran it>
- **External tool / model**: <name and version, recorded by the operator>
- **Export used**: <image id / export filename, or "hand-authored" for manual arm>
- **Input schema version**: 1.0 (see `../schema-version.txt`)

## Preparation

- **Preparation time (minutes)**: <wall-clock time to prepare the prompt/context>
- **Follow-up requests (count)**: <number of extra clarifying turns needed>
- **Follow-up notes**: <what had to be clarified, if anything>

## Generated code

- **Generated program path**: <e.g. generated/summarize_measurements.py or a saved copy>
- **Notes on the generated code**: <deviations from the task, if any>

## Execution

- **Run command**:

  ```
  python generated/<program>.py <path-to-data.json> --out results/<run>.csv
  ```

- **Compare command**:

  ```
  python compare_summary.py --csv results/<run>.csv \
      --checks <path-to-checks.json> --json results/<run>.report.json
  ```

- **Checks passed / total**: <n> / <total expected_summary rows>
- **Overall verdict**: `pass` | `fail` | `unverified`

## Verbatim runner output

```
<paste the exact stdout of compare_summary.py here>
```

## Notes

<Anything else relevant: environment, anomalies, why a verdict was unverified.>
