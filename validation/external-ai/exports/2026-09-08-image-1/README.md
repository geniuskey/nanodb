# Preserved export — image 1, 2026-09-08

The exact context export used by runs `2026-09-08-context-1` and
`2026-09-08-manual-1`, kept so both verdicts can be reproduced without a running
app. Produced by `GET /api/images/1/context-export` at
`2026-09-08T12:39:14.031260+00:00` from the Compose stack built at `f038f80`,
against demo data seeded by `scripts/prepare_demo_samples.py --load` plus seven
measurements created through the API.

`schema_version` is `1.1`. The data is demo-only; no proprietary content.

`checks.json` is the ground truth for the comparison runner. It is preserved here
for reproducibility and must **not** be attached to an AI tool when recording a
new run.

Reproduce:

```
cd validation/external-ai
python generated/run-2026-09-08-context-1.py \
    exports/2026-09-08-image-1/data.json --out /tmp/context.csv
python compare_summary.py --csv /tmp/context.csv \
    --checks exports/2026-09-08-image-1/checks.json
```
