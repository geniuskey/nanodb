---
name: aidlc
description: Use the repository's AI-DLC v1.0.1 adaptive software-development workflow. Apply when the user explicitly requests AI-DLC/AIDLC or asks to run this project's structured inception, construction, or operations lifecycle.
---

# AI-DLC v1.0.1

Use the AI-DLC workflow installed at the repository root.

1. Treat `AGENTS.md` as the authoritative core workflow and follow it completely.
2. Resolve detailed rules from `.aidlc-rule-details/` and load only the files required by the core workflow for the current phase and stage.
3. Preserve the user's requested scope and current authorization boundaries while applying the workflow.
4. Store AI-DLC workflow artifacts in `aidlc-docs/` as directed by the core and detailed rules; keep application code in the project structure outside that directory.
5. Do not duplicate the core or detailed rules into this skill. If `AGENTS.md` or `.aidlc-rule-details/` is missing, report that the repository installation is incomplete before starting the workflow.

