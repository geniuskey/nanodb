# NANoDB Core Frontend Components Summary

> Refreshed 2026-09-08 to match the shipped UI: home v2, catalog search and filtering, deletes, measurement labelling, zoom, annotation editing, the in-app confirmation dialog and success announcements. Standalone arrow/circle shapes were removed in the same pass — a measurement now carries its own label, and the process step belongs to the image. The `data-testid` table below is the live automation contract.

## Scope

The React frontend implements US-02 through US-06 as four routes inside one branded application shell. It uses typed calls to the internal FastAPI endpoints and keeps original images immutable: measurement drafts and saved results are separate UI and server data.

## Routes and responsibilities

| Route | Component | Responsibility | Primary API |
| --- | --- | --- | --- |
| `/` | `HomePage` | Product value, a locally hosted intro video, actual counts and per-parameter statistics, SEM/TEM composition and registration trend, recent images that link to their own measurement screen, and a clearly separated roadmap | `GET /api/summary`, `GET /api/images` |
| `/images` | `ImageListPage` | Latest-first catalog with free-text search, SEM/TEM filter, result count, and per-card delete | `GET /api/images`, `DELETE /api/images/{id}` |
| `/images/new` | `ImageRegisterPage` | PNG/JPEG/TIFF preview, metadata and calibration validation, multipart registration, and detail navigation | `POST /api/images` |
| `/images/:imageId` | `MeasurementPage` | Original-coordinate two-point measurement with zoom, image facts, measurement labelling, label and note editing, deletes, and Context ZIP download | `GET /api/images/{id}`, measurement `POST`/`PATCH`/`DELETE`, `DELETE /api/images/{id}`, `GET /api/images/{id}/context-export` |

An unknown address renders `NotFoundPage` through a catch-all route rather than an empty shell.

`src/ui/` holds the shared pieces: `ConfirmDialog` owns every irreversible confirmation, `StatusBanner` reports a successful write, `ErrorBoundary` catches a render crash without exposing its cause, and `useDocumentTitle` names the current screen in the tab and to screen readers.

`App` provides the NANoDB logo, a shared summary fetch, semantic primary navigation with active-link state, shared footer, and nested routing. The tab bar lists only screens that open; the roadmap is described by the home page's Phase section instead of by six unclickable tabs.

## Feature states and safety boundaries

| Feature | States represented in the UI | Boundary |
| --- | --- | --- |
| Home summary | loading, success with actual counts and timestamp, failure | Failure never displays example KPI values as real data. |
| Image catalog | loading, populated, explicit empty, failure | Request failure is distinct from a valid empty catalog. |
| Image registration | no preview, preview, local validation failure, submitting, server failure, success navigation | File is limited to PNG/JPEG selection and 20 MB; Product, Lot, Wafer, and positive calibration are required; the process step is optional and is sent empty when unknown; duplicate submission is blocked. Server validation remains authoritative. |
| Measurement | detail loading/failure, zero to two draft points, preview, saving, saved selection, save failure | A third click is ignored until reset or save. Reset clears the draft only. The UI displays the server-created measurement rather than treating its preview as authoritative. |
| Zoom | fit (1x) through 8x in fixed steps, fit disabled at 1x | The rendered width is set explicitly and the viewport scrolls; coordinates always convert through the rendered image rectangle, so they stay in original pixels at any magnification. The viewer states how many original pixels one screen pixel covers, including when original-pixel accuracy is out of reach. |
| Measurement label | absent, entered before save, drawn as a caption beside its own line, edited later | The label names what was measured; the measurement's own two-point line is the figure, so there is no separate shape to draw, select or delete. The caption position derives from the line and is never stored. |
| Annotation editing | closed, editing, saving, success, failure | Only the label and the note are writable, and they are replaced together. Coordinates, parameter, distance, value and calibration stay as measured, and the editor says so. |
| Deletes | idle, confirming, deleting, success, failure | Every irreversible action goes through `ConfirmDialog`, which names the derived data that disappears with the target, moves focus in and back out, traps Tab and cancels on Escape. |
| Context Export | disclosed scope, disabled without measurements, generating, download success, error | Product/Lot/Wafer, the process step, the original filename, and every saved measurement with its label and memo are included at contract version 2.0. Image binary is excluded. Transfer to an external AI tool is manual; NANoDB does not send it automatically. Only an HTTP success with `application/zip` creates a download. |

## Coordinate and overlay contract

- `toOriginalPoint` subtracts the rendered image rectangle origin, rejects non-positive dimensions and points outside that rectangle, then scales to original pixel coordinates.
- `toRenderedPoint` converts stored original coordinates back to the current rendered width and height.
- The adapter uses the actual `<img>` rectangle, so surrounding viewer space does not become a measurement coordinate.
- The SVG overlay is recreated from original coordinates after image load and window resize. Saved lines, selected lines, endpoints, and the current draft use distinct stable classes.
- A two-point preview reports pixel distance and calibrated nanometers to two decimal places. The backend recalculates and returns the saved values.
- Unit tests verify exact restoration at 100% scale, restoration within one original pixel at 50% scale, and rejection of surrounding space.

### Shape rendering (revised 2026-09-09 after the auto-feature visualisation review)

- Every drawn shape carries `.measurement-shape`, which is what makes it an outline. A bare `.measurement-overlay circle` rule previously also matched the fitted curvature circle, and because CSS outranks the `fill="none"` presentation attribute it painted an opaque disc over the image and over every measurement drawn before it.
- A curvature draws the arc between its three stored points (sampled in original pixels through `arcGeometry`, so it stays correct under any rendered scale), plus a dashed radius line to the fitted centre, clipped at the image edge, and a centre cross when the centre falls on the image. The full circle is never drawn: an auto-extracted trench-bottom radius is several times the width of the structure it belongs to.
- An angle draws its two arms, a filled wedge and an arc whose radius follows the shorter arm rather than a fixed 18 px. The vertex is a solid point; the two arm ends are hollow "reference" points, because an auto sidewall angle derives one arm (the vertical) rather than measuring it.
- Captions are laid out globally by `layoutLabels`: each starts at its preferred offset and is pushed away until it clears the captions already placed, staying inside the image, with a leader line when it travels far. Auto extraction anchors up to six captions on one region, which previously stacked them into an unreadable pile and pushed some off the image edge.
- Auto geometry is dashed (shape and caption plate alike) and manual geometry is solid, so an unverified value never looks like a placed one. The viewer states this convention below the image whenever auto measurements are present.
- Selection keeps the measurement's own colour — the tie to its row in the table — and is marked by a white under-stroke plus painting it last; the rest fade to 45%.
- The viewer toolbar can hide the shapes, hide the captions, or draw only the selected measurement, which is what makes a single value legible on a region carrying six of them.

### Correcting and drawing (added 2026-09-09)

- A saved measurement's points are correctable, because automatic extraction is not exact and a hand-placed point can miss. `보정` puts grab handles on the selected measurement's points; the shape and its caption follow the drag, and the panel shows the previewed value, the stored value and the difference. Nothing is written until `보정 저장`, which sends only the points — the server revalues them.
- Handles are focusable and take arrow keys (1 original pixel, 10 with Shift). At the zoom where a correction matters, one pixel is smaller than the shake in a hand, so dragging alone cannot place a point exactly.
- What a measurement *is* stays fixed: type and calibration are not editable, and the value is never accepted from the client. This narrows RES-007 from "the coordinates are immutable" to "the coordinates are correctable, and every correction is recorded and reversible" — `보정됨` marks the row, the first reading stays beside it, and `처음 값으로` restores it.
- Re-running feature extraction replaces auto measurements but leaves corrected ones standing, and the status line says how many were kept — otherwise the safe move after pressing the button is to re-check every value.
- Drawing got the same treatment: the shape follows the cursor while points are placed, a placed point can be dragged before saving, `마지막 점 취소` takes back one click instead of the whole drawing, and Escape abandons a draft (or an unsaved correction).

## Accessibility and automation contract

- Navigation, links, form controls, buttons, headings, lists, and status text use native semantic elements.
- Loading announcements use `role="status"`; request and validation failures use `role="alert"`.
- Viewer and preview regions have accessible labels, images have contextual alternative text, and the overlay has an accessible measurement-line label.
- Disabled controls communicate unavailable submit or export actions. The empty-export reason is visible text rather than color-only feedback.
- Successful writes announce through `role="status"`; failures keep `role="alert"`. Success is text, not colour.
- A skip link jumps past the header and tab bar to `#main-content`; it is invisible until focused.
- Registration marks required fields, ties each error to its input with `aria-invalid` and `aria-describedby`, and focuses the first offending field. Native `required` is deliberately not used — it would pre-empt the app's own messages — so the form carries `noValidate`.
- Each route sets its own document title, so tabs, history and screen readers can tell the screens apart.
- Failed loads on the home page, the catalog and the measurement detail offer a retry instead of forcing a reload.
- Browser-default keyboard focus remains available for all interactive native controls. The confirmation dialog manages its own focus and Escape.
- Measuring does not require a pointer: original coordinates can be typed in, which doubles as the exact-pixel route when the image is displayed smaller than its original size.
- Loading states reserve the space the results will occupy; the placeholders are `aria-hidden` and the `role="status"` text carries the announcement.

Stable automation selectors are purpose-based:

| Area | `data-testid` values |
| --- | --- |
| Shell | `header-status` |
| Home | `home-summary`, `param-breakdown`, `recent-image-link`, `home-register-image`, `home-browse-images` |
| Catalog | `catalog-register-image`, `image-catalog`, `catalog-image-card`, `catalog-image-delete`, `catalog-count`, `image-search-input`, `filter-all`, `filter-sem`, `filter-tem` |
| Registration | `image-registration-form`, `registration-file`, `registration-product`, `registration-process-step`, `registration-submit` |
| Measurement | `measurement-image`, `measurement-overlay`, `measurement-draft-line`, `measurement-parameter`, `measurement-preview`, `measurement-label-input`, `measurement-reset`, `measurement-save`, `measurement-label`, `saved-measurement-item`, `delete-measurement`, `edit-annotation`, `label-input`, `note-input`, `note-save`, `note-cancel`, `image-facts`, `image-process-step`, `detail-image-delete` |
| Viewer | `zoom-in`, `zoom-out`, `zoom-fit`, `zoom-level`, `viewer-scale` |
| Shared | `confirm-dialog`, `confirm-accept`, `confirm-cancel`, `status-banner`, `error-boundary`, `error-retry`, `not-found` |
| Recovery | `retry-summary`, `retry-images`, `retry-catalog`, `retry-detail` |
| Registration errors | `error-file`, `error-product_id`, `error-lot_id`, `error-wafer_id`, `error-calibration_nm_per_pixel` |
| Home video | `intro-video`, `video-caption` |
| Coordinate entry | `coord-start-x`, `coord-start-y`, `coord-end-x`, `coord-end-y`, `coord-apply`, `coord-error` |
| Loading placeholders | `catalog-skeleton`, `kpi-skeleton` |
| Export | `context-export-button`, `context-export-disabled-reason` |

Measurement overlay groups additionally expose `data-measurement-id` so a saved-list selection can be correlated with the rendered line without dynamic DOM IDs.

## Frontend test mapping

| Test file | Tests | Coverage |
| --- | ---: | --- |
| `src/frontend/src/App.test.tsx` | 4 | Brand and accessible primary navigation, catch-all not-found route, skip link, exactly one active tab |
| `src/frontend/src/pages/HomePage.test.tsx` | 9 | Loading/success, failure resilience with retry, real summary values with the parameter breakdown, usage-flow CTAs, locally hosted intro video with its caption, reduced-motion behaviour, a recent-image card that opens its measurement screen, document title |
| `src/frontend/src/pages/ImageListPage.test.tsx` | 11 | Empty state, catalog metadata/counts, failure distinction and retry, search and type filter forwarding, filtered-empty wording, result count with results kept during a refetch, delete confirm and cancel |
| `src/frontend/src/pages/ImageRegisterPage.test.tsx` | 7 | Per-field validation messages, `aria-invalid`/`aria-describedby` and first-error focus, non-positive calibration, one pending multipart request, the optional process step sent and omitted, retained fields on server failure |
| `src/frontend/src/ui/ErrorBoundary.test.tsx` | 1 | A crashed subtree becomes a recovery screen that hides the cause and can retry |
| `src/frontend/src/measurement/coordinates.test.ts` | 5 | Coordinate restoration at 100% and 50%, clamping, and outside-rectangle rejection |
| `src/frontend/src/pages/MeasurementPage.test.tsx` | 29 | Draft lifecycle, save state/result/failure, list-overlay selection, image facts including the process step, zoom scaling and the accuracy statement, label capture and caption rendering, label and note editing and clearing, confirmation accept/cancel/Escape and cascade wording, success announcements, detail retry, document title, export disclosure/gating, duplicate protection, ZIP success, error envelope and wrong media type |
| **Total** | **66** | US-02 through US-06 frontend behaviour |

Browser scenarios live in `tests/e2e/` (7 Playwright tests in 3 spec files) and cover the P0 flow plus zoom keeping the overlay aligned, measurement delete through the dialog, and an exported ZIP whose `data.json` carries the edited label, the note, and the image's process step.

The verified frontend commands are `npm run typecheck`, `npm run test:frontend`, `npm run build`, and `npm run test:e2e` against a running stack.

## Story traceability

| Story | Frontend result |
| --- | --- |
| US-02 | Branded home with the actual database summary, composition and trend, recent images that open their measurement screen, policy language, Phase-based roadmap separation, and the usage-flow CTA pair |
| US-03 | Catalog with search, type filter, result count and delete, plus guarded SEM/TEM/TIFF registration and success navigation |
| US-04 | Two-point original-coordinate interaction with zoom, calibration and accuracy readout, preview, reset, third-click protection, and saved result handling |
| US-05 | Reload/resize/zoom-safe SVG reconstruction, synchronized saved measurement selection, labels drawn beside the lines they name, and label/note editing over immutable evidence |
| US-06 | Explicit export contents/exclusions and manual-transfer boundary, measurement gate, per-measurement labels and notes at contract version 2.0, and validated ZIP download |
