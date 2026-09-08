# NANoDB Core Frontend Components Summary

## Scope

The React frontend implements US-02 through US-06 as four routes inside one branded application shell. It uses typed calls to the internal FastAPI endpoints and keeps original images immutable: measurement drafts and saved results are separate UI and server data.

## Routes and responsibilities

| Route | Component | Responsibility | Primary API |
| --- | --- | --- | --- |
| `/` | `HomePage` | Product value, actual image and measurement counts, implemented workflow links, and clearly separated roadmap | `GET /api/summary` |
| `/images` | `ImageListPage` | Latest-first image catalog, manufacturing identifiers, preview, and saved measurement count | `GET /api/images` |
| `/images/new` | `ImageRegisterPage` | PNG/JPEG preview, metadata and calibration validation, multipart registration, and detail navigation | `POST /api/images` |
| `/images/:imageId` | `MeasurementPage` | Original-coordinate two-point measurement, saved overlay selection, server-authoritative save result, and Context ZIP download | `GET /api/images/{imageId}`, `POST /api/images/{imageId}/measurements`, `GET /api/images/{imageId}/context-export` |

`App` provides the NANoDB logo, semantic primary navigation, active-link state, shared footer, and nested routing.

## Feature states and safety boundaries

| Feature | States represented in the UI | Boundary |
| --- | --- | --- |
| Home summary | loading, success with actual counts and timestamp, failure | Failure never displays example KPI values as real data. |
| Image catalog | loading, populated, explicit empty, failure | Request failure is distinct from a valid empty catalog. |
| Image registration | no preview, preview, local validation failure, submitting, server failure, success navigation | File is limited to PNG/JPEG selection and 20 MB; Product, Lot, Wafer, and positive calibration are required; duplicate submission is blocked. Server validation remains authoritative. |
| Measurement | detail loading/failure, zero to two draft points, preview, saving, saved selection, save failure | A third click is ignored until reset or save. Reset clears the draft only. The UI displays the server-created measurement rather than treating its preview as authoritative. |
| Context Export | disclosed scope, disabled without measurements, generating, download success, error | Product/Lot/Wafer, original filename, saved measurements, and memo are included. Image binary is excluded. Transfer to an external AI tool is manual; NANoDB does not send it automatically. Only an HTTP success with `application/zip` creates a download. |

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
- Browser-default keyboard focus remains available for all interactive native controls.

Stable automation selectors are purpose-based:

| Area | `data-testid` values |
| --- | --- |
| Home | `home-browse-images`, `home-register-image`, `home-summary` |
| Catalog | `catalog-register-image`, `image-catalog`, `catalog-image-card` |
| Registration | `image-registration-form`, `registration-file`, `registration-product`, `registration-submit` |
| Measurement | `measurement-image`, `measurement-overlay`, `measurement-draft-line`, `measurement-parameter`, `measurement-preview`, `measurement-reset`, `measurement-save`, `saved-measurement-item` |
| Export | `context-export-button`, `context-export-disabled-reason` |

Measurement overlay groups additionally expose `data-measurement-id` so a saved-list selection can be correlated with the rendered line without dynamic DOM IDs.

## Frontend test mapping

| Test file | Tests | Coverage |
| --- | ---: | --- |
| `src/frontend/src/App.test.tsx` | 1 | Brand and accessible primary navigation |
| `src/frontend/src/pages/HomePage.test.tsx` | 3 | Loading/success, failure, real summary values and non-interactive roadmap |
| `src/frontend/src/pages/ImageListPage.test.tsx` | 3 | Empty state, catalog metadata/counts, and failure distinction |
| `src/frontend/src/pages/ImageRegisterPage.test.tsx` | 3 | Client validation, one pending multipart request, retained fields on server failure |
| `src/frontend/src/measurement/coordinates.test.ts` | 3 | 100% and 50% coordinate restoration and outside-rectangle rejection |
| `src/frontend/src/pages/MeasurementPage.test.tsx` | 10 | Draft lifecycle, save state/result/failure, list-overlay selection, export disclosure/gating, duplicate protection, ZIP success, error envelope and wrong media type |
| **Total** | **23** | US-02 through US-06 frontend behavior |

The verified frontend commands are `npm run typecheck`, `npm run test:frontend`, and `npm run build`.

## Story traceability

| Story | Frontend result |
| --- | --- |
| US-02 | Branded Home with actual database summary, core workflow, implemented CTAs, policy language, and P2 roadmap separation |
| US-03 | Catalog plus guarded SEM/TEM image registration and success navigation |
| US-04 | Two-point original-coordinate interaction, preview, reset, third-click protection, and saved result handling |
| US-05 | Reload/resize-safe SVG reconstruction and synchronized saved measurement selection |
| US-06 | Explicit export contents/exclusions and manual-transfer boundary, measurement gate, and validated ZIP download |
