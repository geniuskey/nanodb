# NANoDB Core API Layer Generation Summary

## 생성 범위

| 영역 | 경로 | 책임 |
| --- | --- | --- |
| Application factory | `src/backend/nanodb/api/app.py` | Settings, engine, adapters, services, routes와 static frontend 조립 |
| Internal routes | `src/backend/nanodb/api/routes.py` | health, summary, Image, Measurement와 context export transport |
| Schemas와 mapper | `src/backend/nanodb/api/schemas.py`, `mappers.py` | 명시적 request/response allowlist와 domain 변환 |
| Error boundary | `src/backend/nanodb/api/errors.py` | domain error와 예상하지 못한 error의 안전한 envelope |
| Request context | `src/backend/nanodb/api/middleware.py` | correlation ID, route, status와 duration log |
| Environment settings | `src/backend/nanodb/settings.py` | database, upload, pool, profile, frontend와 log 설정 |

## Endpoint 계약

| Method와 path | 결과 | 주요 실패 |
| --- | --- | --- |
| `GET /api/health/live` | process alive | process 자체 실패 |
| `GET /api/health/ready` | PostgreSQL·upload root 준비 상태 | dependency failure |
| `GET /api/summary` | 실제 Image·Measurement count와 DB 시각 | storage failure |
| `POST /api/images` | 등록된 safe Image view | multipart/input/decode/storage failure |
| `GET /api/images` | 최신순 Image와 Measurement count | storage failure |
| `GET /api/images/{image_id}` | Image와 최신순 Measurement | `IMAGE_NOT_FOUND` |
| `GET /api/images/{image_id}/file` | stored key로 찾은 image | Image 또는 file 없음 |
| `POST /api/images/{image_id}/measurements` | server 계산 Measurement | Image 없음, 좌표·보정 오류 |
| `GET /api/images/{image_id}/measurements` | 최신순 Measurement | `IMAGE_NOT_FOUND` |
| `GET /api/images/{image_id}/context-export` | 완성된 ZIP download | Image 없음, 측정 없음, snapshot/생성 실패 |

## 안전 경계

- response schema는 `stored_filename`, database URL과 filesystem 절대 경로를 노출하지 않는다.
- DomainError는 `code`, 사용자용 `message`, 선택적 field detail로 변환한다.
- 예상하지 못한 오류의 stack은 server log에만 남기고 response는 일반 메시지를 사용한다.
- request log는 correlation ID, method, route, status와 duration만 기록하며 body, note, image bytes와 secret을 기록하지 않는다.
- production frontend와 API는 same-origin이며 broad CORS 설정을 추가하지 않았다.
- export는 완전한 ZIP bytes가 생성된 뒤에만 `application/zip` 성공 응답을 만든다.

## Service Orchestration

Route는 Pydantic transport validation과 response mapping만 수행한다. ImageService는 staged filesystem과 DB commit을 조정하고, MeasurementService는 저장 Image 보정값으로 값을 재계산한다. SummaryService는 실제 count만 조회하며 ContextExportService는 한 Image snapshot의 allowlist ZIP만 생성한다.

## Test Mapping

| Test | 검증 범위 |
| --- | --- |
| `tests/backend/api/test_routes.py` | summary/catalog allowlist, multipart 등록, not-found envelope, Measurement mapping, non-finite input과 ZIP/error content type |
| `tests/backend/api/test_image_service_failures.py` | size limit, invalid decode cleanup과 DB commit 실패 보상 |
| `tests/backend/contract/test_context_zip.py` | 고정 entry, JSON parsing, UTF-8, field allowlist, expected values와 byte 결정성 |
| `tests/backend/integration/test_services.py` | 실제 PostgreSQL에서 server 재계산과 측정 없는 export 거부 |

생성 시 pure/API/contract test 32개가 통과했다. 실제 PostgreSQL test 6개는 `TEST_DATABASE_URL`이 없어 명시적으로 skip됐고, 후속 Build and Test에서 실행한다.

## 추적성

- IMG-001~006, CAT-001~002·004~005: Image transport와 ImageService
- MEA-001~011, RES-001~004·006: Measurement schema, service와 ordered detail
- SUM-001·003~005: actual count Summary endpoint
- CTX-001~012: context-export route, snapshot service와 ZIP contract
- NFR-SEC-02~07: decode/size/path/allowlist/safe error와 local same-origin 경계
- NFR-OBS-01~03: correlation ID, bounded structured request fields와 local logging

## 확장 규칙 적용 상태

- Resiliency Baseline: N/A — 비활성화됨.
- Security Baseline: N/A — 비활성화됨. 승인된 일반 API·path·secret·error 경계는 구현했다.
- Property-Based Testing: N/A — 비활성화되어 example-based contract test를 사용했다.
