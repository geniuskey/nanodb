# NANoDB Core Test Traceability

생성된 test를 요구사항·user story·design rule에 연결한다. 이 문서는 생성 범위의
추적성만 기록하며, 실제 test 실행과 최종 pass/fail 판정은 후속 Build and Test 단계에서
수행한다. US-08(Evidence Site)은 NANoDB Core 밖의 후속 작업 단위이므로 제외한다.

## Test 자산 개요

| 계층 | 위치 | 도구 |
| --- | --- | --- |
| Pure domain | `tests/backend/unit/test_calculations.py` | pytest |
| Demo tooling | `tests/backend/unit/test_demo_tooling.py` | pytest |
| API·service | `tests/backend/api/test_routes.py`, `test_image_service_failures.py` | pytest, HTTPX |
| Contract (ZIP) | `tests/backend/contract/test_context_zip.py` | pytest |
| Integration (PostgreSQL) | `tests/backend/integration/test_migration_and_repositories.py`, `test_services.py`, `test_demo_reset.py` | pytest (`TEST_DATABASE_URL` 필요) |
| Frontend unit | `src/frontend/src/**/*.test.tsx`, `coordinates.test.ts` | Vitest, Testing Library |
| Browser e2e | `tests/e2e/measurement-flow.spec.ts`, `failure-cases.spec.ts` | Playwright |

PostgreSQL integration test는 `TEST_DATABASE_URL`이 없으면 명시적으로 skip된다.

## Story → Test

| Story | 요약 | 연결된 test |
| --- | --- | --- |
| **US-01** | 승인된 demo sample·preflight·source-safe reset | `unit/test_demo_tooling.py`, `integration/test_demo_reset.py` |
| **US-02** | Home 실제 count·CTA·roadmap 경계 | `pages/HomePage.test.tsx`, `App.test.tsx`, `api/test_routes.py`(summary) |
| **US-03** | PNG/JPEG 등록·검증·목록·상세·원본 불변 | `pages/ImageRegisterPage.test.tsx`, `pages/ImageListPage.test.tsx`, `api/test_routes.py`, `api/test_image_service_failures.py`, `e2e/measurement-flow.spec.ts`, `e2e/failure-cases.spec.ts` |
| **US-04** | 원본 좌표 두 점 preview·server 재계산·저장 | `unit/test_calculations.py`, `measurement/coordinates.test.ts`, `pages/MeasurementPage.test.tsx`, `integration/test_services.py`, `e2e/measurement-flow.spec.ts`, `e2e/failure-cases.spec.ts` |
| **US-05** | reload/resize 복원·선택 강조 | `measurement/coordinates.test.ts`, `pages/MeasurementPage.test.tsx`, `e2e/measurement-flow.spec.ts` |
| **US-06** | 고정 네 파일 결정적 context ZIP | `contract/test_context_zip.py`, `pages/MeasurementPage.test.tsx`, `integration/test_services.py`, `e2e/measurement-flow.spec.ts`, `e2e/failure-cases.spec.ts` |
| **US-07** | 외부 생성 코드 실제 실행·정직한 결과 근거 | `validation/external-ai/`(오프라인 runner와 기록 형식; Build and Test에서 실제 실행) |

## 요구사항·Design rule → Test

| Rule 계열 | 범위 | 연결된 test |
| --- | --- | --- |
| BR-IMG / IMG-001~006 | 이미지 등록·검증·저장·원본 불변 | `api/test_routes.py`, `api/test_image_service_failures.py`, `unit/test_demo_tooling.py` |
| CAT-001~002·004~005 | 최신순 목록·measurement count | `api/test_routes.py`, `pages/ImageListPage.test.tsx`, `integration/test_migration_and_repositories.py` |
| BR-MEA / MEA-001~011 | 거리·nm 환산·저장 정밀도·표시 반올림 | `unit/test_calculations.py`, `integration/test_services.py`, `pages/MeasurementPage.test.tsx` |
| BR-RES / RES-001~004·006 | 좌표 복원·최신순 상세·선택 강조 | `measurement/coordinates.test.ts`, `pages/MeasurementPage.test.tsx`, `integration/test_migration_and_repositories.py` |
| SUM-001·003~005 | 실제 count summary | `api/test_routes.py`, `pages/HomePage.test.tsx` |
| BR-CTX / CTX-001~012 | 고정 entry·allowlist·UTF-8·ordering·결정성 | `contract/test_context_zip.py`, `integration/test_services.py` |
| NFR-REL / PER | migration·constraint·rollback·N+1 없는 집계·결정적 정렬·persistence | `integration/test_migration_and_repositories.py`, `integration/test_demo_reset.py` |
| NFR-SEC-02~07 | decode/size/path/allowlist/safe error·local same-origin | `api/test_image_service_failures.py`, `api/test_routes.py`, `contract/test_context_zip.py` |
| NFR-OBS-01~03 | correlation ID·bounded 구조적 log·local logging | `api/test_routes.py` |

## Browser 시나리오 상세

| 시나리오 | 파일 | 검증 |
| --- | --- | --- |
| 정상 흐름 | `measurement-flow.spec.ts` | 등록 → 두 점 preview → 저장 → reload/resize overlay 복원 → 선택 강조 → context ZIP download filename |
| 등록 client 검증 실패 | `failure-cases.spec.ts` | 파일 없이 submit 시 form 유지와 사유 alert |
| 측정 없는 export 비활성 | `failure-cases.spec.ts` | context export 비활성과 사유 표시 |
| 세 번째 click 보호 | `failure-cases.spec.ts` | 두 점 완료 후 추가 click이 draft를 늘리지 않음 |

브라우저 실행은 이미 기동된 스택(예: `make demo`)을 대상으로 하며 `E2E_BASE_URL`로
대상 주소를 바꿀 수 있다. 실행·판정은 Build and Test에서 수행한다.

## 확장 규칙 적용 상태

- Resiliency / Security / Property-Based Testing extension: 모두 N/A(비활성). 승인된
  example-based test와 일반 보안 경계 test만 사용했다.
