# Context-export arm prompt

This is the **context** arm of the US-07 comparison. Here the person attaches
NANoDB's exported context ZIP instead of writing the explanation by hand. The
ZIP is produced from an image detail page via `GET /api/images/{id}/context-export`
and contains exactly four UTF-8 files:

- `context.md` — the coordinate system, calculation rules and data caveats.
- `data.json` — the selected image and all of its saved measurements
  (`schema_version` `2.0`). Each measurement carries its own `label` (what was
  measured) and `note` (what the operator observed); both are free text and
  neither changes the summary, which groups by `parameter_type`.
- `task.md` — the development task to perform.
- `checks.json` — the ground truth used only for later verification.

Steps:

1. Unzip the export.
2. Attach `context.md`, `data.json` and `task.md` to the external AI tool.
   **Do not** attach `checks.json` — it holds the expected answers and is for the
   comparison runner only.
3. Use the prompt below.

Record preparation time and every follow-up request needed to reach a usable
answer, exactly as in the manual arm.

---

Attached are `context.md`, `data.json` and `task.md` exported from NANoDB.

Read `context.md` for the coordinate system and calculation rules, read the
measurements in `data.json`, and complete the task described in `task.md`.

Produce a program (standard library only, no network access, no image-boundary
inference) that reads `data.json` and writes the requested CSV, and show the CSV
it produces for this export.

Save the generated program under `generated/` and record the exact command used
to run it in the run log.
