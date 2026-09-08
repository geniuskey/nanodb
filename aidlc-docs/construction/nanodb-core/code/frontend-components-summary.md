# NANoDB Core Frontend Components Summary

> Refreshed 2026-09-08 to match the shipped UI: home v2, catalog search and filtering, deletes, annotation labelling, zoom, note editing, the in-app confirmation dialog and success announcements. The `data-testid` table below is the live automation contract.

## Scope

The React frontend implements US-02 through US-06 as four routes inside one branded application shell. It uses typed calls to the internal FastAPI endpoints and keeps original images immutable: measurement drafts and saved results are separate UI and server data.

## Routes and responsibilities

| Route | Component | Responsibility | Primary API |
| --- | --- | --- | --- |
| `/` | `HomePage` | Product value, actual counts and per-parameter statistics, SEM/TEM composition and registration trend, recent images, and a clearly separated roadmap | `GET /api/summary`, `GET /api/images` |
| `/images` | `ImageListPage` | Latest-first catalog with free-text search, SEM/TEM filter, result count, and per-card delete | `GET /api/images`, `DELETE /api/images/{id}` |
| `/images/new` | `ImageRegisterPage` | PNG/JPEG/TIFF preview, metadata and calibration validation, multipart registration, and detail navigation | `POST /api/images` |
| `/images/:imageId` | `MeasurementPage` | Original-coordinate two-point measurement with zoom, image facts, arrow/circle labelling, note editing, deletes, and Context ZIP download | `GET /api/images/{id}`, measurement `POST`/`PATCH`/`DELETE`, annotation `POST`/`PATCH`/`DELETE`, `DELETE /api/images/{id}`, `GET /api/images/{id}/context-export` |

`ConfirmDialog` and `StatusBanner` under `src/ui/` are shared: the first owns every irreversible confirmation, the second reports a successful write.

`App` provides the NANoDB logo, a shared summary fetch, semantic primary navigation with active-link state, non-interactive roadmap tabs, shared footer, and nested routing.

## Feature states and safety boundaries

| Feature | States represented in the UI | Boundary |
| --- | --- | --- |
| Home summary | loading, success with actual counts and timestamp, failure | Failure never displays example KPI values as real data. |
| Image catalog | loading, populated, explicit empty, failure | Request failure is distinct from a valid empty catalog. |
| Image registration | no preview, preview, local validation failure, submitting, server failure, success navigation | File is limited to PNG/JPEG selection and 20 MB; Product, Lot, Wafer, and positive calibration are required; duplicate submission is blocked. Server validation remains authoritative. |
| Measurement | detail loading/failure, zero to two draft points, preview, saving, saved selection, save failure | A third click is ignored until reset or save. Reset clears the draft only. The UI displays the server-created measurement rather than treating its preview as authoritative. |
| Zoom | fit (1x) through 8x in fixed steps, fit disabled at 1x | The rendered width is set explicitly and the viewport scrolls; coordinates always convert through the rendered image rectangle, so they stay in original pixels at any magnification. The viewer states how many original pixels one screen pixel covers, including when original-pixel accuracy is out of reach. |
| Annotation | empty, drawing, saved rows, row/shape selection, label persistence, delete | Geometry is immutable once drawn (delete and redraw). Shapes carry no calculated value and are visually separate from measurements. Shape hit areas are limited to the stroke so measurement clicks still reach the image. |
| Note editing | closed, editing, saving, success, failure | Only the note is writable. Coordinates, parameter, distance, value and calibration stay as measured, and the editor says so. |
| Deletes | idle, confirming, deleting, success, failure | Every irreversible action goes through `ConfirmDialog`, which names the derived data that disappears with the target, moves focus in and back out, traps Tab and cancels on Escape. |
| Context Export | disclosed scope, disabled without measurements, generating, download success, error | Product/Lot/Wafer, original filename, saved measurements with memos, and saved shapes with their labels are included at contract version 1.1. Image binary is excluded. Transfer to an external AI tool is manual; NANoDB does not send it automatically. Only an HTTP success with `application/zip` creates a download. |

## Coordinate and overlay contract

- `toOriginalPoint` subtracts the rendered image rectangle origin, rejects non-positive dimensions and points outside that rectangle, then scales to original pixel coordinates.
- `toRenderedPoint` converts stored original coordinates back to the current rendered width and height.
- The adapter uses the actual `<img>` rectangle, so surrounding viewer space does not become a measurement coordinate.
- The SVG overlay is recreated from original coordinates after image load and window resize. Saved lines, selected lines, endpoints, and the current draft use distinct stable classes.
- A two-point preview reports pixel distance and calibrated nanometers to two decimal places. The backend recalculates and returns the saved values.
- Unit tests verify exact restoration at 100% scale, restoration within one original pixel at 50% scale, and rejection of surrounding space.

## Accessibility and automation contract

- Navigation, links, form controls, buttons, headings, lists, and status text use native semantic elements.
- Loading announcements use `role="status"`; request and validation failures use `role="alert"`.
- Viewer and preview regions have accessible labels, images have contextual alternative text, and the overlay has an accessible measurement-line label.
- Disabled controls communicate unavailable submit or export actions. The empty-export reason is visible text rather than color-only feedback.
- Successful writes announce through `role="status"`; failures keep `role="alert"`. Success is text, not colour.
- Browser-default keyboard focus remains available for all interactive native controls. The confirmation dialog manages its own focus and Escape.
- Known gap: measuring still requires a pointer. The numeric-coordinate alternative is UIX-003 and is not implemented.

Stable automation selectors are purpose-based:

| Area | `data-testid` values |
| --- | --- |
| Shell | `header-status` |
| Home | `home-summary`, `param-breakdown` |
| Catalog | `catalog-register-image`, `image-catalog`, `catalog-image-card`, `catalog-image-delete`, `catalog-count`, `image-search-input`, `filter-all`, `filter-sem`, `filter-tem` |
| Registration | `image-registration-form`, `registration-file`, `registration-product`, `registration-submit` |
| Measurement | `measurement-image`, `measurement-overlay`, `measurement-draft-line`, `measurement-parameter`, `measurement-preview`, `measurement-reset`, `measurement-save`, `saved-measurement-item`, `delete-measurement`, `edit-note`, `note-input`, `note-save`, `note-cancel`, `image-facts`, `detail-image-delete` |
| Viewer | `zoom-in`, `zoom-out`, `zoom-fit`, `zoom-level`, `viewer-scale` |
| Annotation | `tool-arrow`, `tool-circle`, `annotation-overlay`, `annotation-empty`, `annotation-row`, `annotation-product`, `annotation-step`, `annotation-name`, `delete-annotation` |
| Shared | `confirm-dialog`, `confirm-accept`, `confirm-cancel`, `status-banner` |
| Export | `context-export-button`, `context-export-disabled-reason` |

Annotation shape groups expose `data-annotation-id` so a shape and its table row can be correlated in either direction.

Measurement overlay groups additionally expose `data-measurement-id` so a saved-list selection can be correlated with the rendered line without dynamic DOM IDs.

## Frontend test mapping

| Test file | Tests | Coverage |
| --- | ---: | --- |
| `src/frontend/src/App.test.tsx` | 1 | Brand and accessible primary navigation |
| `src/frontend/src/pages/HomePage.test.tsx` | 4 | Loading/success, failure resilience, real summary values with the parameter breakdown, non-interactive roadmap, intro video |
| `src/frontend/src/pages/ImageListPage.test.tsx` | 9 | Empty state, catalog metadata/counts, failure distinction, search and type filter forwarding, filtered-empty wording, result count with results kept during a refetch, delete confirm and cancel |
| `src/frontend/src/pages/ImageRegisterPage.test.tsx` | 3 | Client validation, one pending multipart request, retained fields on server failure |
| `src/frontend/src/measurement/coordinates.test.ts` | 5 | Coordinate restoration at 100% and 50%, clamping, and outside-rectangle rejection |
| `src/frontend/src/pages/MeasurementPage.test.tsx` | 28 | Draft lifecycle, save state/result/failure, list-overlay selection, image facts, zoom scaling and the accuracy statement, annotation rendering/drawing/label persistence/delete/shape selection, note editing and clearing, confirmation accept/cancel/Escape and cascade wording, success announcements, export disclosure/gating, duplicate protection, ZIP success, error envelope and wrong media type |
| **Total** | **50** | US-02 through US-06 frontend behaviour |

Browser scenarios live in `tests/e2e/` (7 Playwright specs) and cover the P0 flow plus zoom keeping the overlay aligned, shape delete through the dialog, and an exported ZIP whose `data.json` carries the edited note and the labelled shape.

The verified frontend commands are `npm run typecheck`, `npm run test:frontend`, `npm run build`, and `npm run test:e2e` against a running stack.

## Story traceability

| Story | Frontend result |
| --- | --- |
| US-02 | Branded home with the actual database summary, composition and trend, recent images, policy language, P2 roadmap separation, and the single usage-flow CTA pair |
| US-03 | Catalog with search, type filter, result count and delete, plus guarded SEM/TEM/TIFF registration and success navigation |
| US-04 | Two-point original-coordinate interaction with zoom, calibration and accuracy readout, preview, reset, third-click protection, and saved result handling |
| US-05 | Reload/resize/zoom-safe SVG reconstruction, synchronized saved measurement selection, arrow/circle labelling with two-way highlighting, and note editing over immutable evidence |
| US-06 | Explicit export contents/exclusions and manual-transfer boundary, measurement gate, annotations at contract version 1.1, and validated ZIP download |
