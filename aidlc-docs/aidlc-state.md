# AI-DLC State Tracking

## Project Information

- **Project Type**: Greenfield
- **Start Date**: 2026-09-07T11:50:01Z
- **Current Stage**: CONSTRUCTION complete for the 2026-09-08 UI/UX amendment. Every requirement in it (P0 reconciliation, P1 and P2) is implemented, and every runnable path — make demo, quality gates, browser e2e, evidence site build and preview — has been executed end to end. Only the container stack remains unverified, blocked by this environment rather than by the project. The Pages deploy is verified: the workflow's build and deploy jobs both succeeded on the main merge commit. The 2026-09-08 UI/UX requirements amendment was approved on the same day. Prior state: CONSTRUCTION complete for both units (NANoDB Core US-01~US-07 + Evidence Site US-08); Evidence Site Code Generation approved 2026-09-08. Remaining deferred: the container stack in a Docker environment. Operations phase is a placeholder.

## Workspace State

- **Existing Code**: Python sample metadata/verification utilities only; no web application implementation
- **Programming Languages**: Python (sample utilities)
- **Build System**: None detected
- **Project Structure**: Greenfield web application with requirements and prepared sample utilities
- **Reverse Engineering Needed**: No
- **Workspace Root**: `/Users/edwin/git/nanodb_mvp`

## Code Location Rules

- **Application Code**: Workspace root (never in `aidlc-docs/`)
- **Documentation**: AI-DLC artifacts in `aidlc-docs/`
- **Structure patterns**: See `construction/code-generation.md`

## Extension Configuration

| Extension | Enabled | Decided At |
| --- | --- | --- |
| Resiliency Baseline | No | Requirements Analysis |
| Security Baseline | No | Requirements Analysis |
| Property-Based Testing | No | Requirements Analysis |

## Auto-Feature Visualisation Fix (2026-09-09)

The measurement overlay was reviewed against real auto-extracted features and
corrected. The blocking defect was a CSS `circle` rule that outranked the
`fill="none"` attribute on the fitted curvature circle and painted an opaque
disc over the image, hiding every measurement drawn before it. Beyond that the
overlay now draws a curvature as its measured arc plus a clipped radius line
rather than a whole circle, lays captions out so six auto features on one region
stay apart and on the image, sizes the angle mark to its arms, distinguishes a
derived reference point from a placed one, keeps auto geometry dashed and manual
solid, and can be stripped back to the selected measurement from the viewer
toolbar. New modules: `measurement/arc.ts`, `measurement/labels.ts`. All gates
green against a throwaway PostgreSQL and the running stack (pytest 212, vitest
115, playwright 9, ruff/mypy/tsc clean). Backend untouched.

## Hackathon Demo — Auto Analysis Feature (2026-09-09)

New requirement: automatic TEM/SEM analysis in the app (multi-Otsu brightness
segmentation, per-class statistics, six boundary structural features, TIFF
private-tag derivative copies, a web UI distinguishing auto vs manual
measurements, and batch processing). Split into three units:

- **Unit A — Segmentation + TIFF Tag**: DONE and verified 2026-09-09. Ported
  `load_gray`/`segment`/`summarize` from `scripts/segment_tem_demo` (Pillow for
  PNGs, never matplotlib), added `DerivedStore` (atomic writes under
  `<upload_root>/derived/{image_id}/`, originals never touched), private-tag TIFF
  derivation (65010-65013), `SegmentationResultModel` + migration 0007,
  `SegmentationService`, and the segmentation/tagged routes. `uv run pytest`
  (149 passed, 26 DB-skipped), `uv run mypy` (strict) and `uv run ruff` all green.
- **Unit B — Feature Extraction**: DONE and verified 2026-09-09. Pure
  matplotlib-free `domain/features.py` ports the geometry from
  `scripts/tem/measure.py` and extracts up to six structural features
  (width/CD, height, spacing, bottom curvature, left/right sidewall angle) from
  a target class's representative region. Each feature is emitted as measurement
  *points* (length/angle/curvature) so the stored value is whatever
  `calculate_measurement` derives — round-tripping exactly through the export
  validator (verified to 1e-9). Degenerate cases (flat bottom, vertical wall,
  single region) are `skipped` with a reason, never fabricated.
  `FeatureExtractionService` loads the stored label map from `DerivedStore`,
  replaces only AUTO measurements (`delete_auto_by_image`; manual rows never
  touched), persists each with `source=AUTO` + confidence + Korean label, and
  refreshes TIFF tag 65011. Added `POST /api/images/{id}/features` route,
  request/response schemas, mapper, and `confidence`/`source` on `MeasurementView`.
  Verified against a throwaway PostgreSQL: `uv run pytest` 203 passed (0 skipped
  with DB), `uv run mypy` (strict) clean, `uv run ruff check .` clean,
  `npm run typecheck` clean, `npm run test:frontend` 75 passed. Fixed a latent
  Unit A break: six `ImageService(...)` calls in the integration suite still used
  the pre-DerivedStore 3-arg constructor.
- **Unit C — UI & Batch**: DONE and verified 2026-09-09. Backend:
  `SegmentationBatchService` runs each image independently (dedup preserving
  order; one image's failure never aborts the rest; a feature-extraction failure
  leaves the image reported `ok` with its segmentation standing and the failure
  noted), `POST /api/segmentation/batch` route + request/response schemas +
  mapper, wired in `app.py` sharing the single `feature_service` into the batch
  service. Frontend: `MeasurementPage` gained a segmentation panel (run/re-run
  segmentation, class map + boundary PNG overlays, per-class stats table, tagged
  TIFF download, run auto feature extraction) and a source badge that keeps AUTO
  (with confidence %) visibly distinct from MANUAL in the saved list; auto values
  are never presented as human-verified. `ImageListPage` gained per-card
  selection + a batch bar ("자동 특징도 추출" toggle, run button, per-image error
  list). New `api` methods `getSegmentation`/`runSegmentation`/`extractFeatures`/
  `runSegmentationBatch` and the segmentation/feature/batch view types.
  All gates green (verified with a throwaway PostgreSQL and the full container
  stack): `uv run pytest` 180 passed + 32 integration passed with DB, `uv run
  mypy` (strict) clean, `uv run ruff check .` clean, `npm run typecheck` clean,
  `npm run test:frontend` 82 passed, `npx playwright test` 9 passed (added
  `auto-analysis.spec.ts`). Fixed two more latent pre-Unit-C breaks surfaced by
  running the real stack: `scripts/prepare_demo_samples.py` used the pre-
  DerivedStore 3-arg `ImageService`, and two e2e assertions in
  `measurement-ux.spec.ts` were stale since 2e0d122 (overlay caption now carries
  the value; export `schema_version` is `3.0`). `git push` intentionally not
  performed.

**Infrastructure Design skipped** (all units): no new infrastructure. The feature
reuses the existing FastAPI + PostgreSQL + local file store; derived artifacts
live under the existing upload root in a new `derived/` subtree owned by
`DerivedStore`, and the only schema change is additive migrations.

Approved deltas (2026-09-09): measurement `source`/`confidence` reconciled with
the existing `measurement_method`; new `DerivedStore` adapter; numpy/scikit-image
(>=0.26)/scipy promoted to main dependencies with matplotlib server-excluded;
mypy overrides for skimage/scipy with `NDArray` annotations; six features mapped
to length/angle/curvature; skimage `min_size`/`area_threshold` deprecation fixed
via `max_size`; image delete cascades segmentation + derived dir + auto
measurements. `git push` intentionally not performed.

## Stage Progress

### INCEPTION PHASE

- [x] Workspace Detection
- [x] Reverse Engineering (skipped: no source code)
- [x] Requirements Analysis (PostgreSQL amendment approved 2026-09-08)
- [x] User Stories (approved 2026-09-08)
- [x] Workflow Planning (approved 2026-09-08)
- [x] Application Design (PostgreSQL revision approved 2026-09-08)
- [x] Units Generation (approved 2026-09-08)

### CONSTRUCTION PHASE

- [x] Functional Design (NANoDB Core approved 2026-09-08)
- [x] NFR Requirements (NANoDB Core approved 2026-09-08)
- [x] NFR Design (NANoDB Core approved 2026-09-08)
- [x] Infrastructure Design (NANoDB Core approved 2026-09-08)
- [x] Code Generation (NANoDB Core approved 2026-09-08; Part 2 Steps 1-26/26 complete)
- [x] Build and Test (approved 2026-09-08; runnable gates green; integration/e2e/container deferred to a Docker/PostgreSQL environment)
- [x] Evidence Site (US-08) Code Generation (approved 2026-09-08; Part 2 Steps 1-10/10 complete, US-08 [x]). Functional/NFR/Infra Design skipped (logged). VitePress site builds locally (dead-link check on), preview serves both pages + screenshots, no localhost links/secrets; the GitHub Pages deploy has since run and succeeded on main ([run](https://github.com/geniuskey/nanodb_mvp/actions/runs/34225740216)).

## Current Request Assessment

- **Request**: "프로젝트 리뷰하고 ui/ux 미구현 된 부분들 어떻게 반영할지 고민하고 요구사항 업데이트해서 프로젝트 완성도 높여줘."
- **Request Type**: Enhancement — brownfield review of the implemented UI/UX against approved requirements, followed by a requirements amendment.
- **Scope**: Multiple components — frontend screens (home, catalog, register, measurement), the requirement documents (`requirements/nanodb-mvp-requirements.md`, `requirements/home-tab-requirements.md`, `requirements/constraints.md`, consolidated `requirements.md`), README and the stale Construction design artifacts.
- **Complexity**: Moderate — no new backend capability is implied, but requirement drift runs in both directions (code without requirements, and requirements without code).
- **Requirements Depth**: Standard
- **Review Result**: [ui-ux-review-2026-09-08.md](inception/requirements/ui-ux-review-2026-09-08.md) — 3 finding groups (A: implemented but unspecified, B: document conflicts, C: UI/UX quality gaps) and a 4-bundle amendment plan (R1 reconciliation, R2 decisions, R3 scope declarations, R4 common UX).
- **Decisions**: Questions 1-7 answered "추천" on 2026-09-08 — every recommended option (A) accepted. Added instruction: this is a hackathon, so do not add tight constraints; the value the app gives users comes first.
- **Grading rule applied**: New UI/UX requirements add no new hard gate. Items that raise user value are P1; accessibility, recovery and presentation polish are P2, and P2 gaps are explicitly not demo failures.
- **Authorization**: Requirements Analysis Step 7 executed. Requirement documents, constraints and README are updated. Awaiting approval before Workflow Planning.
- **Unknowns**: None blocking. Implementation sequencing for the new P1 items is a Workflow Planning decision.

## UI/UX Completeness Review Progress

- [x] Workspace Detection (resume from existing aidlc-state.md; brownfield with current artifacts, no re-run of Reverse Engineering)
- [x] Load prior artifacts (requirements, stories, application design, per-unit construction design, code summaries)
- [x] Compare implementation against the four requirement documents and README
- [x] Record findings: [ui-ux-review-2026-09-08.md](inception/requirements/ui-ux-review-2026-09-08.md)
- [x] Raise clarifying questions: [requirement-verification-questions.md](inception/requirements/requirement-verification-questions.md) Questions 1-7
- [x] Receive and validate answers (Step 6 gate; "추천" = all A, 2026-09-08)
- [x] Apply R1/R3/R4 requirement edits
- [x] Apply R2 requirement edits per the answers
- [x] Update README known limitations and demo flow
- [x] Requirements amendment approved 2026-09-08 ("4까지 진행. 승인")
- [x] Implement priority 1-4: MEA-012/013/014, UIX-001/002, ANN-005/006 — see [measurement-ux-code-generation-plan.md](construction/plans/measurement-ux-code-generation-plan.md)
- [x] Refresh stale Construction artifacts (`frontend-components.md`, `frontend-components-summary.md`)
- [x] ANN-008 (annotations in the context ZIP, contract version 1.1), RES-007 (note editing), CAT-008~009, UIX-008 — see [context-and-p1-completion-plan.md](construction/plans/context-and-p1-completion-plan.md)
- [x] HOM-040 (intro video caption, reduced-motion play button, offline path in README)
- [x] P2: UIX-006 (error boundary + catch-all route), UIX-004 (document titles), UIX-005 (skip link), UIX-007 (retry), IMG-009~010 (required marks and per-field errors) — see [p2-polish-plan.md](construction/plans/p2-polish-plan.md)
- [x] UIX-003 (numeric coordinate entry) and UIX-009 (loading placeholders) — the P2 group is now closed
- [x] Verify the demo path, container definitions and publishing path — see [demo-and-deploy-verification-plan.md](construction/plans/demo-and-deploy-verification-plan.md)
- [ ] Run `make up` once where Docker image layers are reachable
- [x] GitHub Pages deploy — already configured with the Actions source; build and deploy both succeeded on the main merge ([run](https://github.com/geniuskey/nanodb_mvp/actions/runs/34225740216)). DOC-012's admin step was already done.

### Applied requirement changes (2026-09-08)

| Document | Change |
| --- | --- |
| `requirements/nanodb-mvp-requirements.md` | Priority table rebuilt with P0/P1/P2 and implementation status; IMG-001/005 extended to TIFF; new IMG-007~010, CAT-006~009, MEA-012~014, RES-007; CAT-003/RES-005/SUM-002 marked implemented; SUM-002 extended to min/max; new section 3.7 (ANN-001~008 annotation labeling) and 3.8 (UIX-001~009 common UX); CTX-004/005/012 extended to carry annotations and bump `schema_version`; sections 5.1/5.2/5.3/5.5 and 7.1/7.2 updated |
| `requirements/home-tab-requirements.md` | HOM-005 now allows exactly one CTA pair in the usage-flow section (new HOM-034a); HOM-011 separates implemented arrow/circle labeling from roadmap polygon labeling; HOM-009 records the PNG hero asset; new section 3.9.1 with HOM-040 for the intro video; acceptance criteria and the v1-v2 table updated |
| `requirements/constraints.md` | Section 4 carves the implemented arrow/circle shapes and simple zoom out of the exclusion list; section 9 narrows "윤곽 라벨링" to free polygon plus review/versioning; section 12 adds touch-only measurement, dark mode and pointer-free measurement |
| `aidlc-docs/inception/requirements/requirements.md` | Decisions 4, 14-15 added or amended; home CTA rule reconciled with HOM v2; 4.4 demo features, 4.9 export scope, NFR summary, exclusions, acceptance criteria, timebox gates and the section 10 readiness table updated |
| `README.md` | Demo flow lists TIFF, search/filter, annotation labeling and the extended statistics; the stale "P1 not yet implemented" and "TIFF out of scope" claims corrected; known limitations now state the real gaps (no zoom, no measurement edit, no shape delete, no keyboard measurement, no touch or dark mode) |

## Current Requirements Decisions

- Preserve NANoDB brand, image registration, manual two-point measurement, coordinate restoration and original data protection.
- P0 has two gates: measurement foundation, then CTX-001 through CTX-012 plus actual external AI code generation and validation.
- Export one image's metadata and all saved measurements in a ZIP containing context.md, data.json, task.md and checks.json; no image binary or automatic external transmission.
- Manual measurements are unreviewed references, not certified ground truth. Synthetic arithmetic cases are separate.
- Compare manual explanation preparation with exported context using preparation time, follow-up requests and validation results; no promised improvement or token savings.
- Five people build independent tools over three days. The former eight-hour schedule and Role 1 through Role 5 support allocation are superseded.
- Keep the minimal VitePress evidence site and existing judging weights; separate product completion from external AI demo and publishing status.
- Use PostgreSQL for both the hackathon and initial internal beta; inject connection settings and manage schema changes through migrations.
- Keep image binaries in a local directory on the single application host. Multi-instance storage and high availability remain out of scope.
- Treat about 1,000 registered beta users as a target, not a verified concurrency guarantee.
- All three extension choices remain disabled (B/B/C), N/A; full rules were not loaded.
- Labelling is attached to the measurement, not to a separate figure: a measurement carries an optional `label` naming what was measured, drawn as a caption beside its own line (ANN-001~005). Standalone arrow and circle shapes were withdrawn on 2026-09-08 — see the amendment section below. Free-polygon labelling and label review stay on the roadmap.
- Registration accepts PNG, JPEG and TIFF. A TIFF original is preserved and served through a PNG derivative that keeps the original pixel dimensions, so stored coordinates map 1:1.
- Image delete is in scope with cascade disclosure and confirmation; a saved measurement's coordinates, parameter, value and calibration are immutable and only its label and note can be edited.
- Each measurement's label and note travel in the context ZIP at `schema_version` 2.0; there is no separate annotations array.
- The process step is an image attribute entered once at registration, not a per-figure choice.
- The home body stays a reading document; the only in-body CTAs are the pair at the end of the usage-flow section. `home-tab-requirements.md` is the source of truth for the home screen.
- The home intro video is a local file in the repository played through `<video controls>`; the home page has no external runtime dependency at all. The video stays supporting material, never evidence of a feature.
- Supported surface is mouse input on desktop at 1280px or wider in current Chrome or Edge. Touch-only measurement and dark mode are out of scope.

## Amendment Plan Progress

See [contest-alignment-plan.md](inception/requirements/contest-alignment-plan.md) for completed requirements edit and validation steps.

## User Stories Progress

- Need assessment completed: [user-stories-assessment.md](inception/plans/user-stories-assessment.md)
- Story generation plan completed: [story-generation-plan.md](inception/plans/story-generation-plan.md)
- Personas generated: [personas.md](inception/user-stories/personas.md)
- Stories generated: [stories.md](inception/user-stories/stories.md)
- User Stories artifacts approved on 2026-09-08.

## Application Design Progress

- Plan completed: [application-design-plan.md](inception/plans/application-design-plan.md)
- Consolidated design: [application-design.md](inception/application-design/application-design.md)
- Components, methods, services, dependencies and diagram are available under `inception/application-design/`.
- PostgreSQL-based artifacts approved on 2026-09-08.

## PostgreSQL Amendment Progress

- Plan completed: [postgresql-transition-plan.md](inception/requirements/postgresql-transition-plan.md)
- MVP, home, constraints, README, consolidated requirements, execution plan and Application Design synchronized.
- Local file storage and all other approved scope remain unchanged.
- Requirements amendment approved on 2026-09-08; returned to revised Application Design review.

## Units Generation Progress

- Part 1 plan ready: [unit-of-work-plan.md](inception/plans/unit-of-work-plan.md)
- Proposed minimal decomposition: NANoDB Core (US-01~US-07), then Evidence Site (US-08).
- Part 1 plan approved on 2026-09-08.
- Unit definitions: [unit-of-work.md](inception/application-design/unit-of-work.md)
- Dependency matrix: [unit-of-work-dependency.md](inception/application-design/unit-of-work-dependency.md)
- Story map: [unit-of-work-story-map.md](inception/application-design/unit-of-work-story-map.md)
- Part 2 artifacts approved on 2026-09-08; INCEPTION complete.

## NANoDB Core Progress

- Functional Design plan: [nanodb-core-functional-design-plan.md](construction/plans/nanodb-core-functional-design-plan.md)
- Business logic: [business-logic-model.md](construction/nanodb-core/functional-design/business-logic-model.md)
- Domain entities: [domain-entities.md](construction/nanodb-core/functional-design/domain-entities.md)
- Business rules: [business-rules.md](construction/nanodb-core/functional-design/business-rules.md)
- Frontend components: [frontend-components.md](construction/nanodb-core/functional-design/frontend-components.md)
- Functional Design approved on 2026-09-08.
- NFR Requirements plan: [nanodb-core-nfr-requirements-plan.md](construction/plans/nanodb-core-nfr-requirements-plan.md)
- NFR requirements: [nfr-requirements.md](construction/nanodb-core/nfr-requirements/nfr-requirements.md)
- Tech stack decisions: [tech-stack-decisions.md](construction/nanodb-core/nfr-requirements/tech-stack-decisions.md)
- NFR Requirements approved on 2026-09-08.
- NFR Design plan: [nanodb-core-nfr-design-plan.md](construction/plans/nanodb-core-nfr-design-plan.md)
- NFR design patterns: [nfr-design-patterns.md](construction/nanodb-core/nfr-design/nfr-design-patterns.md)
- Logical components: [logical-components.md](construction/nanodb-core/nfr-design/logical-components.md)
- NFR Design approved on 2026-09-08.
- Infrastructure Design plan: [nanodb-core-infrastructure-design-plan.md](construction/plans/nanodb-core-infrastructure-design-plan.md)
- Infrastructure mapping: [infrastructure-design.md](construction/nanodb-core/infrastructure-design/infrastructure-design.md)
- Deployment architecture: [deployment-architecture.md](construction/nanodb-core/infrastructure-design/deployment-architecture.md)
- Infrastructure Design approved on 2026-09-08.
- Code Generation Part 1 plan: [nanodb-core-code-generation-plan.md](construction/plans/nanodb-core-code-generation-plan.md)
- The plan contains 26 ordered generation steps for US-01~US-07 and was approved on 2026-09-08.

## Measurement UX Unit (2026-09-08)

- Plan: [measurement-ux-code-generation-plan.md](construction/plans/measurement-ux-code-generation-plan.md) — 22/22 steps complete. Functional, NFR and Infrastructure Design were skipped with reasons recorded in the plan.
- Delivered: `DELETE /api/images/{id}/annotations/{id}`; an in-app confirmation dialog replacing all three `window.confirm` sites; success announcements via `role="status"`; the calibration, original pixel size and registration time on the measurement screen; zoom and pan with a fixed step ladder and a "screen 1px = N original px" readout; per-shape delete; and shape-to-row selection in both directions.
- Coordinate contract unchanged: zoom sets an explicit rendered width, and every conversion still goes through the rendered `<img>` rectangle, so stored coordinates stay in original pixels at any magnification.
- Verified: ruff clean, mypy clean (27 files), pytest 97 passed against a local PostgreSQL 16 with no skips, vitest 47 passed, vite build succeeded, Playwright e2e 6 passed against the running app in Chromium.
- Browser e2e ran for the first time in this session. It surfaced one stale assertion left from the earlier TIFF work (`PNG 또는 JPEG`), now corrected, and two layout defects found by screenshot (the zoomed viewer overflowing its grid column, and the annotation table's delete button wrapping) that were fixed before commit.

## Context Export + P1 Completion Unit (2026-09-08)

- Plan: [context-and-p1-completion-plan.md](construction/plans/context-and-p1-completion-plan.md) — 23/23 steps complete.
- The export contract changed: `data.json` now carries `annotations[]` and `schema_version` moved from 1.0 to 1.1. `context.md` explains the arrow and circle coordinate meanings and states that shapes carry no calculated value; `task.md` tells the generated code to ignore them; `checks.json` deliberately excludes them so a label is never counted as a measurement.
- A saved measurement's note is editable through `PATCH /api/images/{id}/measurements/{id}`. Coordinates, parameter, distance, value and calibration have no write path at all, so the evidence stays immutable by construction rather than by convention.
- The catalog keeps its results on screen through a filter refetch and reports the result count; the home empty state is Korean with a next action.
- Verified: ruff clean, mypy clean (27 files), pytest 104 passed against a local PostgreSQL 16, vitest 50 passed, vite build succeeded, Playwright e2e 7 passed. The new browser test unzips the downloaded archive and asserts on the real `data.json`, since this change altered an interface with an external consumer.

## HOM-040 + P2 Polish Unit (2026-09-08)

- Plan: [p2-polish-plan.md](construction/plans/p2-polish-plan.md) — 19/19 steps complete. Frontend only; the backend is untouched.
- A render crash and an unknown address now land on recovery screens instead of a white page and an empty shell. The boundary never shows the error itself, matching the server's error-envelope rule.
- Registration marks required fields and puts each message next to its input with `aria-invalid`/`aria-describedby`, focusing the first offender. Native `required` is deliberately avoided so the browser cannot pre-empt the app's own messages; the form carries `noValidate` instead.
- The intro video keeps autoplay for most viewers but always carries a caption explaining it comes from an external service, so a blocked network leaves a labelled area rather than a black box. A reduced-motion viewer gets a play button.
- Two defects were found while building this and fixed here: `/images/new` lit both the catalog and the register tab as the current location (a HOM-004 violation, now written into the requirement), and the skip link was positioned against the wrong ancestor.
- Verified: ruff clean, mypy clean, pytest 104 passed, vitest 62 passed, vite build, Playwright e2e 7 passed, plus browser screenshots of the form errors, the not-found screen and the skip link.
- Closed later the same day: UIX-003 adds typed original coordinates as a second route to a draft — the only pointer-free path to measuring, and the way to hit an exact pixel when the image is displayed smaller than its original. UIX-009 reserves the catalog grid and the home KPI row during a first load. Re-verified with vitest 66 and the browser: typing (40,40)-(300,200) on a 400x300 image produced a 305.29px / 152.64nm draft.

## Demo and Publishing Verification (2026-09-08)

- Plan and results: [demo-and-deploy-verification-plan.md](construction/plans/demo-and-deploy-verification-plan.md).
- Executed successfully: `uv sync --frozen`, `make preflight`, `make migrate`, `make seed-demo`, `make reset` (source samples untouched), `make lint`, `mypy`, `make test-backend` (104 passed, no skips), `make test-frontend` (63), `make build-frontend`, `make test-e2e` (7), `docs:build` with dead-link checking, and `docs:preview` serving under `/nanodb_mvp/`.
- Seven defects removed. The serious one: `.python-version` pinned 3.12.12, which uv cannot install on Linux (its newest build is 3.12.11), so `uv sync --frozen` failed on any machine without that exact system interpreter — `make install` was the first thing a new contributor would hit. `pyproject.toml` already allows any 3.12, so the pin is now `3.12`.
- The second notable one: HOM-034a, written into the requirements during this same amendment, had never been implemented. Regenerating the screenshots is what exposed it.
- The evidence screenshots were four commits stale, and the site's own copies could drift from the repository's; the capture script now writes both.
- Blocked by the environment and reported rather than worked around: the container stack (Docker Hub's layer host is denied by egress policy — compose config and all four image tags were validated instead).
- Correction, made after the merge: the Pages deploy was reported as unverified and needing an admin step. Checking the workflow history showed it was already configured and had succeeded on earlier main pushes, and it succeeded again on this merge ([run](https://github.com/geniuskey/nanodb_mvp/actions/runs/34225740216)). That claim was carried over from an older state note instead of being checked against the run history — the same drift this whole amendment was about. The published URL itself could not be fetched here because `geniuskey.github.io` is denied by egress policy.

## Next Stage Assessment

The UI/UX amendment is finished apart from UIX-003 (numeric coordinate entry, the remaining accessibility gap) and UIX-009 (loading placeholders). Both are recorded as unimplemented in the requirements and in the README's known limitations, and neither is a demo gate.

No code work remains in this amendment. One thing remains and cannot be closed from here: someone with Docker image access should run `make up` once to prove the container stack. It is recorded as `미검증` in the requirements and on the evidence site.

Separately, and by design, the external AI development demo (US-07, EVL-006~008) stays independent of app completeness: the prompts, generated code, run commands and pass/fail results still have to be produced and recorded by hand.

## Execution Plan Summary

- **Execute**: Application Design, Units Generation, applicable per-unit Functional Design, NFR Requirements, NFR Design, Infrastructure Design, Code Generation, Build and Test.
- **Skip**: Reverse Engineering (greenfield); Operations (placeholder).
- **Provisional units**: NANoDB Core followed by Evidence Site.

## Requirement Correction: Measurement Labelling (2026-09-08)

The user rejected the arrow/circle labelling requirements outright — a length-measuring tool that draws circles, and a per-shape product picker on an image that already has one product — and asked for every requirement behind those screens to be distrusted, not just the shape feature.

Four defects were verifiable in the code, not matters of taste:

1. `export_builder.py` told its own AI consumer to ignore annotations, so the P0 flagship export discarded exactly the data this P1 feature produced.
2. Circle geometry stored a centre and an edge point — a radius — while `constraints.md` section 4 bans radius and curvature calculation.
3. `ProductType` (DRAM/Flash/Logic/Sensor) existed only in a database CHECK and one component. No requirement mentioned it, and it contradicted the free-string `image.product_id`.
4. The root cause is recorded in the requirements themselves: the ANN section was back-filled from code that already existed, so the code was never checked against a requirement.

What changed. The standalone Annotation entity is gone (table, service, repository, routes, schemas, UI). Annotating survives on the thing being annotated: `Measurement.label` names what was measured and is drawn beside its own line, `Measurement.note` stays the observation memo, and `Image.process_step` is entered once at registration. The export contract moved to `schema_version` 2.0 and `task.md` no longer tells anyone to throw the labels away. Also removed in the same pass: the six unclickable P2 roadmap tabs, and the home page's `왜 지금인가` public-statistics section, which put external survey numbers beside measured KPIs. Recent-image cards became links to their own measurement screen, and the intro video became a local file.

The user's one correction to the plan is why `label` exists at all: the review had proposed deleting annotation entirely, and they interrupted to say annotating is needed — a measurement has to record what it is, not only how long it is.

Requirement documents amended: `requirements/nanodb-mvp-requirements.md` (section 3.7 rewritten as 측정 라벨링, ANN-006~008 withdrawn, the API table replaced with the 13 endpoints that actually exist, IMG-002/004, CAT-006/007, MEA-009, RES-002/007, CTX-004/005/012, UIX-001, the data model and the screen sections), `requirements/home-tab-requirements.md` (HOM-005/006/008/011/023/029/030/037/040, HOM-024~027 withdrawn, acceptance criteria and the v1/v2 table), `requirements/constraints.md`, and the consolidated `aidlc-docs/inception/requirements/requirements.md`. Design and code documents amended: the frontend design and summary, and `api-reference.md`, which was still describing `schema_version` 1.0 and was missing every delete and patch endpoint.

Historical evidence was deliberately left alone. The US-07 run artefacts under `validation/external-ai/exports/` and `results/run-*.md` still carry `schema_version` 1.1, the contract in force when those runs were recorded; rewriting them would falsify the evidence. Only the forward-looking contract files moved to 2.0, and the validation README explains the gap.
