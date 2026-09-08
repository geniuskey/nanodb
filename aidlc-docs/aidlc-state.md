# AI-DLC State Tracking

## Project Information

- **Project Type**: Greenfield
- **Start Date**: 2026-09-07T11:50:01Z
- **Current Stage**: CONSTRUCTION - Measurement UX unit complete (MEA-012/013/014, UIX-001/002, ANN-005/006) with every gate green including browser e2e. The 2026-09-08 UI/UX requirements amendment was approved on the same day. Prior state: CONSTRUCTION complete for both units (NANoDB Core US-01~US-07 + Evidence Site US-08); Evidence Site Code Generation approved 2026-09-08. Remaining deferred: Core PostgreSQL integration test, browser e2e, and container stack in a Docker/PostgreSQL environment; actual GitHub Pages deploy after admin Pages setup + main push. Operations phase is a placeholder.

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
- [x] Evidence Site (US-08) Code Generation (approved 2026-09-08; Part 2 Steps 1-10/10 complete, US-08 [x]). Functional/NFR/Infra Design skipped (logged). VitePress site builds locally (dead-link check on), preview serves both pages + screenshots, no localhost links/secrets; GitHub Pages deploy actual run deferred to admin Pages setup + main push.

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
- [ ] Refresh stale Construction artifacts (`frontend-components.md`, `frontend-components-summary.md`)
- [ ] Remaining P1: ANN-008 (annotations in the context ZIP), RES-007 (note editing), CAT-008~009, UIX-008
- [ ] P2 group (optional; not a demo gate)

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
- Arrow and circle annotation labeling is an implemented P1 feature (ANN-001~008), separate from roadmap free-polygon labeling and label review.
- Registration accepts PNG, JPEG and TIFF. A TIFF original is preserved and served through a PNG derivative that keeps the original pixel dimensions, so stored coordinates map 1:1.
- Image delete is in scope with cascade disclosure and confirmation; a saved measurement's coordinates, parameter, value and calibration are immutable and only its note can be edited.
- Annotations travel in the context ZIP, which bumps the export `schema_version`.
- The home body stays a reading document; the only in-body CTAs are the pair at the end of the usage-flow section. `home-tab-requirements.md` is the source of truth for the home screen.
- The home intro video is the single permitted external runtime dependency and must degrade to readable text.
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

## Next Stage Assessment

Priorities 1-4 are delivered and verified. The next candidates, in the order proposed at the review, are ANN-008 (annotations in the context ZIP, which changes the CTX contract and its reproducibility test), then RES-007 (note editing), CAT-008~009 (keep results during a filter refetch, show the result count) and UIX-008 (consistent Korean copy). The stale Construction artifacts should be refreshed alongside whichever unit comes next. The P2 group stays optional and is not a demo gate.

## Execution Plan Summary

- **Execute**: Application Design, Units Generation, applicable per-unit Functional Design, NFR Requirements, NFR Design, Infrastructure Design, Code Generation, Build and Test.
- **Skip**: Reverse Engineering (greenfield); Operations (placeholder).
- **Provisional units**: NANoDB Core followed by Evidence Site.
