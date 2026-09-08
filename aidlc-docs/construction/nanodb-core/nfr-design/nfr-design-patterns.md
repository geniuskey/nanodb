# NANoDB Core NFR Design Patterns

## 1. Modular Monolith

React frontend와 FastAPI backend를 하나의 NANoDB Core 배포 경계로 유지한다. Backend 내부는 route, application service, domain function, repository/file-store adapter로 나눈다.

- route는 transport validation과 response mapping만 담당한다.
- service는 transaction과 여러 adapter 호출을 조정한다.
- domain function은 거리, 좌표, 반올림과 export summary처럼 I/O가 없는 규칙을 담당한다.
- repository와 file store는 persistence detail을 감춘다.

이 pattern은 NFR-SCA-01~03과 NFR-MNT-01~05를 충족하면서 microservice 운영 부담을 만들지 않는다.

## 2. Request-scoped Transaction

- database session은 request 또는 application command 단위로 만들고 종료한다.
- write service는 성공 경로에서 한 번 commit하고 실패 시 rollback한다.
- read service는 transaction 안에서 필요한 Image와 Measurement를 일관된 순서로 읽는다.
- client가 disconnect해도 불완전한 database commit을 성공 응답으로 표현하지 않는다.
- write request를 application에서 자동 retry하지 않는다. 사용자가 재시도할 때 중복 생성 가능성을 명확히 관리한다.

## 3. Staged Upload와 보상 정리

PostgreSQL transaction과 filesystem은 하나의 atomic transaction이 아니므로 다음 순서를 사용한다.

1. configured upload root 안의 temporary file에 제한된 크기로 저장한다.
2. Pillow로 decoding하고 format과 pixel size를 검증한다.
3. system-generated final key를 정한다.
4. database transaction을 시작해 Image metadata를 준비한다.
5. temporary file을 같은 filesystem의 final path로 atomic rename한다.
6. database transaction을 commit한다.
7. rename 전 실패는 temporary file을 삭제하고 rollback한다.
8. commit 실패는 final file 삭제를 시도하고 Image 성공 응답을 만들지 않는다.

process crash로 남을 수 있는 orphan file은 정상 Image로 조회되지 않는다. 해커톤에서는 demo reset이 runtime upload를 정리한다. 자동 orphan recovery service는 현재 범위에 추가하지 않는다.

## 4. Defense-in-depth Validation

| 경계 | 검증 |
| --- | --- |
| React form | 필수 입력, 20MB, 숫자·양수, 두 point 준비 여부 |
| Pydantic/API | enum, finite number, nonblank string, request shape |
| Application service | Image 존재, 원본 좌표 범위, 동일 점, server 재계산, export 대상 |
| Pillow | 실제 PNG/JPEG decoding과 pixel dimensions |
| PostgreSQL | required field, foreign key, enum/check와 가능한 positive constraint |
| Export builder | field allowlist, fixed filename, UTF-8, finite number와 stable ordering |

client validation은 편의를 위한 것이며 server와 database validation을 대체하지 않는다.

## 5. Original-coordinate Source of Truth

- React viewer는 image element의 실제 rendering rectangle을 측정한다.
- click position에서 rectangle offset을 뺀 뒤 원본/표시 비율을 곱한다.
- 원본 좌표만 API로 보내고 database에 저장한다.
- resize, reload와 saved selection마다 원본 좌표에서 SVG overlay position을 다시 계산한다.
- server는 stored Image dimensions로 범위를 검증하고 거리와 nm를 다시 계산한다.

이 pattern은 NFR-PER-02, NFR-REL-04, NFR-TST-01·05와 NFR-USA-06을 반영한다.

## 6. Query와 Pool 경계

- Image 목록과 Measurement count는 aggregate query 한 번 또는 고정된 소수 query로 가져와 N+1을 피한다.
- 상세는 Image 한 건과 해당 Measurement만 읽는다.
- summary는 count query만 사용하고 P1 평균을 계산하지 않는다.
- export는 선택 Image와 연결 Measurement만 읽고 image binary는 읽지 않는다.
- SQLAlchemy pool size, overflow와 timeout은 environment setting으로 노출하되 해커톤 기본값은 작은 single-instance profile로 둔다.
- cache와 Redis를 추가하지 않는다. beta tuning은 load test 결과로 결정한다.

## 7. Deterministic Export

- Export service는 하나의 read transaction에서 Image와 Measurement snapshot을 만든다.
- Measurement는 ID 오름차순, summary row는 CD, Depth, Thickness 순서로 고정한다.
- JSON key와 text section의 생성 순서를 code에서 명시한다.
- ZIP entry는 고정된 네 이름만 허용한다.
- 모든 text는 UTF-8로 encode한다.
- `exported_at`과 ZIP metadata를 비교에서 제외한 contract test를 둔다.
- 생성 중 오류가 나면 response body를 ZIP success로 시작하지 않는다.

## 8. Same-origin과 Safe Boundary

- production build는 frontend와 API를 same-origin으로 제공한다.
- development Vite server만 `/api` proxy를 사용한다.
- database URL과 upload root는 server-side config로만 읽는다.
- original filename은 표시와 export field로만 사용하고 file path 또는 ZIP entry에 사용하지 않는다.
- error response와 log에서 stack, SQL, secret, database URL과 internal absolute path를 제거한다.
- authentication 없는 build는 localhost 또는 접근 통제된 demo network에만 bind한다.

## 9. Error Envelope와 Structured Logging

API error는 최소 `code`, 사용자용 `message`와 optional field detail을 일관되게 반환한다. 예상하지 못한 오류는 generic code로 바꾸고 internal exception은 server log에만 남긴다.

log event는 request correlation ID, route, outcome, duration과 제한된 error category를 포함한다. secret, image bytes, 전체 note와 database URL은 기록하지 않는다. external monitoring이나 alerting component는 두지 않는다.

## 10. Frontend State와 접근성

- 각 page는 idle, loading, success, empty, validation error와 failure를 구분한다.
- mutation 중 같은 button을 disable해 중복 action을 줄인다.
- server validation error는 가능한 field에 연결하고 입력값을 유지한다.
- SVG overlay는 선택 line의 visual highlight와 text selection state를 함께 제공한다.
- form label, semantic button, focus order와 text status를 유지한다.
- interactive element에는 목적 기반의 안정적인 `data-testid`를 둔다.

## 11. Test Pyramid와 실제 PostgreSQL

- pure domain rule은 빠른 pytest unit test로 가장 많이 검증한다.
- repository, constraint와 migration은 실제 PostgreSQL integration test로 검증한다.
- React state와 form은 Vitest/Testing Library로 검증한다.
- upload→measurement→reload→export 핵심 happy path와 주요 failure만 Playwright로 검증한다.
- ZIP schema, ordering, UTF-8과 expected values는 backend contract test로 고정한다.

mock database만으로 persistence 성공을 판단하지 않는다.

## NFR 추적성

| NFR 범주 | 반영 pattern |
| --- | --- |
| NFR-SCA | Modular Monolith, configurable pool, no cache/queue |
| NFR-PER | aggregate query, scoped read, client preview |
| NFR-AVL | readiness failure, reproducible startup, no HA claim |
| NFR-SEC | layered validation, safe path, same-origin, sanitized error/log |
| NFR-REL | transaction, staged upload, server calculation, deterministic export |
| NFR-MNT | layered modules, explicit adapters, locked dependencies |
| NFR-TST | pure/integration/frontend/browser/contract test boundaries |
| NFR-USA | explicit UI states, semantic controls, linked overlay state |
| NFR-OBS | error envelope, correlation ID와 structured log |
