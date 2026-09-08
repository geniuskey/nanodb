# NANoDB Core Code Generation 계획

## 문서 목적과 권한 경계

이 문서는 NANoDB Core Code Generation의 단일 실행 기준이다. 사용자 승인 전에는 아래 생성 단계를 실행하지 않는다. 승인 후에는 번호 순서대로 한 단계씩 수행하고, 각 단계가 끝난 같은 상호작용에서 해당 체크박스를 `[x]`로 바꾼다.

- **작업 단위**: NANoDB Core
- **할당 이야기**: US-01~US-07
- **Workspace root**: `/Users/edwin/git/nanodb_mvp`
- **Application code와 runtime config**: workspace root 아래에 생성한다.
- **AI-DLC Markdown 요약**: `aidlc-docs/construction/nanodb-core/code/`에만 생성한다.
- **후속 단위**: Evidence Site; Core의 승인된 실제 검증 결과만 정적 입력으로 소비한다.
- **제외**: P1 검색·측정 삭제·항목별 평균, 인증·권한, 자동 측정, 앱 내 AI 호출·코드 실행, microservice, cache, queue, object storage와 multi-instance 운영.

## Part 1 계획 진행 상태

- [x] 승인된 Requirements, US-01~US-07, Application Design, Units, Functional Design, NFR Requirements, NFR Design와 Infrastructure Design을 읽었다.
- [x] workspace가 Greenfield이며 기존 코드는 sample metadata와 검증 utility뿐임을 확인했다.
- [x] Unit dependency와 내부 interface, 데이터 소유권 및 생성 경로를 확정했다.
- [x] 구현, 계층별 test, 문서와 deployment artifact를 번호 순서와 story traceability로 계획했다.
- [x] Markdown 표, 경로, 코드 표기와 체크박스를 사전 검증했다. Mermaid와 ASCII diagram은 포함하지 않았다.
- [x] 계획을 Code Generation의 단일 실행 기준으로 저장하고 사용자용 요약을 준비했다.
- [x] 전체 계획 승인 prompt를 `audit.md`에 기록했다.
- [x] 사용자가 전체 계획과 실행 순서를 승인했다.
- [x] 승인 원문을 `audit.md`에 기록하고 `aidlc-state.md`에서 Part 1을 완료 처리했다.

## Unit Context

### 책임과 서비스 경계

NANoDB Core는 React frontend와 FastAPI backend를 하나의 배포 경계로 유지한다. Web UI는 Application API만 사용하고, backend는 route, application service, pure domain function, repository와 file-store adapter로 분리한다. PostgreSQL은 Image와 Measurement metadata를 소유하고, 단일 앱 호스트의 `var/uploads/`는 등록 이미지 binary를 소유한다.

### 외부·단위 의존성

- NANoDB Core가 선행 작업 단위에 의존하지는 않지만 승인된 sample TIFF와 metadata utility를 입력으로 사용한다.
- Evidence Site는 Core 완료 후 승인된 기능·검증 상태에만 build-time으로 의존한다.
- 기존 AI 도구와 생성 코드 실행은 Core runtime 밖의 수동 검증 활동이다.
- source sample인 `data/samples/`와 runtime upload인 `var/uploads/`를 분리하며 reset은 source sample을 절대 대상으로 삼지 않는다.

### 소유 데이터와 계약

| 소유 대상 | 저장 위치 | 핵심 계약 |
| --- | --- | --- |
| Image, Measurement | PostgreSQL | migration, foreign key, enum/check, 양수 제약과 결정적 정렬 |
| 등록 image binary | `var/uploads/` | system-generated key, staged write, atomic promote와 실패 보상 |
| Demo derivative와 manifest | `data/demo/` | 최소 3개 PNG/JPEG, source ID·SHA-256·변환 시각·원본 pixel size 추적 |
| Context export | HTTP ZIP response | UTF-8 `context.md`, `data.json`, `task.md`, `checks.json`만 포함 |
| External verification evidence | `validation/external-ai/` | prompt, input version, 생성 코드, 실행 명령, 실제 결과와 비교 지표 |

### 내부 API 계약

| Method와 path | 책임 |
| --- | --- |
| `GET /api/health/live` | process liveness |
| `GET /api/health/ready` | PostgreSQL과 upload root readiness |
| `GET /api/summary` | 실제 Image·Measurement count와 집계 시각 |
| `POST /api/images` | PNG/JPEG multipart 등록 |
| `GET /api/images` | 최신순 Image와 Measurement count 목록 |
| `GET /api/images/{image_id}` | Image와 최신순 Measurement 상세 |
| `GET /api/images/{image_id}/file` | stored key로 원본 image 제공 |
| `POST /api/images/{image_id}/measurements` | 원본 두 점의 server 재계산·저장 |
| `GET /api/images/{image_id}/measurements` | 해당 Image의 최신순 Measurement 목록 |
| `GET /api/images/{image_id}/context-export` | 고정 네 파일 ZIP 생성 |

모든 실패 응답은 `code`, 사용자용 `message`, 선택적 field detail을 포함하는 안전한 envelope를 사용한다.

## Toolchain과 Version 기준

| 영역 | 계획 기준 |
| --- | --- |
| Python | CPython 3.12.12, `.python-version`으로 고정 |
| Python project/lock | `uv` 기반 `pyproject.toml`과 `uv.lock`; direct dependency는 exact pin |
| Backend direct dependency | FastAPI 0.128.8, Pydantic 2.13.5, pydantic-settings 2.11.0, Uvicorn 0.39.0, SQLAlchemy 2.0.52, Psycopg 3.2.13, Alembic 1.16.5, Pillow 11.3.0, python-multipart 0.0.20 |
| Backend test/tooling | pytest 8.4.2, HTTPX 0.28.1, pytest-cov 7.1.0, Ruff 0.16.6, mypy 1.19.1; transitive version은 `uv.lock`으로 고정 |
| Node | Node.js 22.17.1 |
| Frontend direct dependency | React/React DOM 19.2.8, React Router DOM 7.18.3, Vite 8.2.2, TypeScript 7.0.2, `@vitejs/plugin-react` 6.1.1 |
| Frontend test/tooling | Vitest 5.0.0, Testing Library React 16.3.3, user-event 14.6.7, jsdom 27.0.1, Playwright 1.63.0; exact resolution은 `package-lock.json`으로 고정 |
| Database | PostgreSQL 16 major; 생성 시 사용 가능한 patch tag 또는 immutable digest를 `compose.yaml`에 고정 |
| Container runtime | Python 3.12.12와 Node 22.17.1 base의 patch tag 또는 digest를 생성 시 고정 |

버전은 계획 작성 시 로컬 runtime과 package registry에서 확인한 기준이다. 실제 scaffold 설치에서 peer compatibility가 실패하면 범위를 바꾸지 않는 최소 호환 patch 조합만 적용하고 계획 변경과 근거를 먼저 기록한다.

## 실행 계획

### Step 1. Greenfield project structure와 dependency lock 생성 — US-01~US-07

- [x] `pyproject.toml`, `uv.lock`, `.python-version`, `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`와 공통 lint/typecheck/test 설정을 생성한다. Backend는 `src/backend/nanodb/`, frontend는 `src/frontend/`, backend test는 `tests/backend/`, browser test는 `tests/e2e/`를 사용한다. 기존 sample utility import와 실행 경로를 보존한다.

### Step 2. Pure domain model과 business logic 생성 — US-03~US-06

- [x] `src/backend/nanodb/domain/`에 Image·Measurement·Export snapshot type, enum, domain error, 좌표 범위 검증, Euclidean distance, nm 환산, decimal half-up 표시 반올림, expected summary와 export snapshot 검증을 구현한다. I/O와 framework dependency를 넣지 않는다.

### Step 3. Business logic unit test 생성 — US-04~US-06

- [x] `tests/backend/unit/`에 500px·100nm 기준 사례, 좌표 경계·동일 점·NaN/Infinity·비양수 보정 거부, 저장 정밀도와 표시 반올림, 고정 summary 순서와 export validation example-based test를 생성한다.

### Step 4. Business logic summary 생성 — US-03~US-06

- [x] `aidlc-docs/construction/nanodb-core/code/business-logic-summary.md`에 구현 경로, BR-IMG/MEA/RES/CTX 매핑, 순수 함수 계약과 test case를 기록한다.

### Step 5. PostgreSQL schema, migration과 repository layer 생성 — US-01, US-03~US-06

- [x] `alembic.ini`, `alembic/`과 `src/backend/nanodb/persistence/`를 생성한다. Image·Measurement table, foreign key, enum/check/positive constraint, UTC timestamp, request-scoped synchronous SQLAlchemy session, 최신순 상세 query, ID 오름차순 export query, count와 목록 aggregate query를 구현한다.

### Step 6. Repository와 migration integration test 생성 — US-01, US-03~US-06

- [x] `tests/backend/integration/`에 빈 실제 test PostgreSQL migration, DB constraint, rollback, N+1 없는 aggregate 결과, 최신순·결정적 ordering, restart persistence와 demo DB 격리를 검증하는 test를 생성한다. mock DB 성공만으로 persistence를 판정하지 않는다.

### Step 7. Repository layer summary 생성 — US-01, US-03~US-06

- [x] `aidlc-docs/construction/nanodb-core/code/repository-summary.md`에 schema, migration revision, query, transaction, pool setting과 NFR-REL/PER traceability를 기록한다.

### Step 8. File store, image decoder와 Image Service 생성 — US-03

- [x] `src/backend/nanodb/adapters/`와 `services/`에 20MB bounded temporary write, Pillow 실제 PNG/JPEG decoding, UUID 기반 final key, same-filesystem atomic promote, rollback·compensation delete와 safe open을 구현한다. 원본 filename은 path 조합에 사용하지 않는다.

### Step 9. Measurement, Summary와 Context Export Service 생성 — US-02, US-04~US-06

- [x] server 재계산·저장, 실제 count, 한 read transaction snapshot과 allowlist 기반 네 UTF-8 파일 ZIP builder를 구현한다. Measurement는 export에서 ID 오름차순, summary row는 CD·Depth·Thickness 순서를 유지하며 image binary·절대 경로·secret·audit log를 제외한다.

### Step 10. FastAPI application과 API layer 생성 — US-02~US-06

- [x] `src/backend/nanodb/api/`와 application factory에 내부 API 계약, Pydantic validation, multipart/JSON/ZIP response, same-origin static frontend/file response, correlation ID, duration·outcome structured logging과 safe error mapper를 구현한다. write 자동 retry와 CORS broad allow는 추가하지 않는다.

### Step 11. API, service와 ZIP contract test 생성 — US-02~US-06

- [x] `tests/backend/api/`와 `tests/backend/contract/`에 등록 정상·실패, file/DB 부분 실패, 목록·상세·summary, server measurement 재계산, not-found, 측정 없는 export 거부, ZIP filename·field allowlist·JSON parse·UTF-8·ordering·expected value·결정성을 검증하는 test를 생성한다.

### Step 12. API layer summary 생성 — US-02~US-06

- [x] `aidlc-docs/construction/nanodb-core/code/api-layer-summary.md`에 endpoint, request/response/error 계약, service orchestration, logging·안전 경계와 test mapping을 기록한다.

### Step 13. React App Shell, Home과 Image Catalog 생성 — US-02, US-03

- [x] `src/frontend/src/`에 네 route의 App Shell, NANoDB brand/navigation, 실제 summary·빈 상태·CTA가 있는 Home과 최신순 Image Catalog를 구현한다. 활성 기능과 P2 roadmap을 행동과 표현 모두에서 구분한다.

### Step 14. App Shell, Home과 Catalog frontend unit test 생성 — US-02, US-03

- [x] Vitest와 Testing Library로 loading/success/empty/failure, 실제 count와 기준 시각, 구현된 CTA, 비활성 roadmap, catalog card와 measurement count, 접근 가능한 label/focus 및 안정적인 `data-testid`를 검증한다.

### Step 15. Image Registration feature와 frontend unit test 생성 — US-03

- [x] preview와 metadata form, 20MB·필수 문자열·SEM/TEM·양수 보정 선행 검증, 중복 submit 방지, 입력 유지 error, 성공 detail navigation을 구현하고 unit test를 생성한다. client validation이 server validation을 대체하지 않게 한다.

### Step 16. Measurement viewer, coordinate adapter와 SVG overlay 생성 — US-04, US-05

- [x] 실제 rendered image rectangle 기준 click-to-original 변환, letterbox 거부, 두 점 draft/preview/reset, 저장 measurement 선택·강조, resize/reload 복원, 소수점 둘째 자리 표시와 server result 반영을 구현한다. 모든 주요 interaction에 목적 기반의 stable `data-testid`를 둔다.

### Step 17. Measurement와 coordinate frontend unit test 생성 — US-04, US-05

- [x] 100%와 50% rendering에서 1px 이내 복원, 세 번째 click 보호, 저장 enablement, draft reset과 saved data 불변, 선택 list-overlay 동기화, validation/failure 상태를 Vitest/Testing Library test로 생성한다.

### Step 18. Context Export frontend와 download test 생성 — US-06

- [x] 포함되는 제조 식별정보·filename·memo와 image binary 제외, 수동 외부 전달 경계를 먼저 표시하고 측정이 있을 때만 export를 활성화한다. ZIP 성공 응답만 download하고 error envelope는 파일로 저장하지 않도록 구현·test한다.

### Step 19. Frontend components summary 생성 — US-02~US-06

- [ ] `aidlc-docs/construction/nanodb-core/code/frontend-components-summary.md`에 route, feature state, coordinate/overlay 계약, 접근성, `data-testid`와 frontend test mapping을 기록한다.

### Step 20. Demo derivative, preflight와 reset tooling 생성 — US-01

- [ ] `data/demo/images/`, `data/demo/manifest.csv`, `scripts/prepare_demo_samples.py`, `scripts/preflight_demo.py`와 `scripts/reset_demo.py`를 생성한다. 승인된 TEM source 최소 3개를 무리샘플 PNG로 준비해 source ID·SHA-256·변환 시각·원본 크기·SEM/TEM·Product/Lot/Wafer·양수 보정값을 기록하고, `NANODB_PROFILE=demo`와 명시적 target guard를 통과한 경우에만 전용 DB row와 `var/uploads/`를 known empty state로 초기화한다.

### Step 21. Demo preparation test 생성 — US-01

- [ ] manifest/file 누락, decode/format/dimension/hash/calibration/authorization 오류와 source/runtime root 동일 조건을 실패시키고, reset 뒤 Image·Measurement 0건과 source sample 불변을 검증하는 test를 생성한다.

### Step 22. External AI development verification assets와 evidence 생성 — US-07

- [ ] `validation/external-ai/`에 동일 과제용 manual/context prompt, input schema version, 생성된 summary code, 실행 command, CSV/check 비교 runner와 결과 기록 형식을 생성한다. 실제 export를 사용한 생성 코드 실행 결과는 pass/fail/unverified 그대로 기록하고 준비 시간·추가 요청 수·통과 수를 보존한다. 이 도구를 Core runtime이나 자동 model call에 연결하지 않는다.

### Step 23. Deployment artifact와 root task command 생성 — US-01~US-06

- [ ] `compose.yaml`, `Dockerfile`, `.dockerignore`, `.env.example`, `.gitignore` 갱신과 `Makefile`을 생성한다. `db → migrate → app` 순서, PostgreSQL named volume, `var/uploads/` bind mount, loopback app port, non-root runtime, database·upload readiness, `make demo`와 안전한 stop/reset/test 진입점을 제공한다. source sample은 regular app에 mount하거나 제공하지 않는다.

### Step 24. Project와 API documentation 갱신 — US-01~US-07

- [ ] root `README.md`를 실제 구현 상태로 갱신하고 clean setup, locked install, native/Compose 실행, migration, sample preparation/preflight, safe reset, test 진입점, context ZIP, 외부 생성 코드 검토·실행·검증과 알려진 제한을 기록한다. 상세 API·deployment·traceability는 `aidlc-docs/construction/nanodb-core/code/` Markdown으로 생성한다.

### Step 25. Browser P0 scenario와 story traceability 생성 — US-01~US-07

- [ ] `tests/e2e/`에 upload → two clicks → save → reload/resize overlay → export download의 최소 Playwright scenario와 주요 실패 scenario를 생성한다. `aidlc-docs/construction/nanodb-core/code/test-traceability.md`에 requirement/story/design rule과 생성된 test를 연결한다. test 실행과 최종 pass/fail 판정은 후속 Build and Test 단계에서 수행한다.

### Step 26. 생성 결과 일관성 검토와 완료 요약 — US-01~US-07

- [ ] 계획 밖 범위 유입, 누락 file, duplicate 수정본, source sample 변경, runtime data·secret 추적, 계층 역의존성과 미완료 story를 검사한다. `aidlc-docs/construction/nanodb-core/code/code-generation-summary.md`에 생성·수정 file, test, deployment artifact, 알려진 제한과 story 완료 상태를 기록하고 Code Generation review gate를 연다.

## Story 완료 추적

- [ ] **US-01** — 승인된 demo sample, preflight와 source-safe reset이 생성됐다.
- [ ] **US-02** — Home이 실제 count·기준 시각·구현된 CTA와 roadmap 경계를 표시한다.
- [ ] **US-03** — PNG/JPEG 등록·검증·목록·상세·원본 불변 흐름이 생성됐다.
- [ ] **US-04** — original-coordinate 두 점 preview와 server 재계산·저장이 생성됐다.
- [ ] **US-05** — reload/resize 후 측정 근거 복원과 선택 강조가 생성됐다.
- [ ] **US-06** — 고정 네 파일의 안전하고 결정적인 context ZIP이 생성됐다.
- [ ] **US-07** — 외부 생성 코드의 실제 실행 절차와 정직한 결과 근거가 생성됐다.

각 story는 구현과 해당 test·문서가 모두 생성됐을 때만 `[x]`로 바꾼다. 실제 test 실행 결과는 Build and Test 단계에서 별도로 판정한다.

## 생성 순서와 Gate

1. **Foundation**: Step 1.
2. **계측 backend gate**: Step 2~12 중 US-03~US-05 관련 부분.
3. **계측 frontend gate**: Step 13~17.
4. **개발 컨텍스트 gate**: Step 9~12의 export 부분과 Step 18.
5. **Demo와 외부 검증 gate**: Step 20~22.
6. **재현·문서·최종 추적성**: Step 23~26.

P0 계측 기반의 생성과 관련 test가 준비되기 전에 외부 검증으로 넘어가지 않는다. P1은 이 계획에 없으며 자동으로 추가하지 않는다.

## 예상 범위

- **총 실행 단계**: 26개
- **Application 영역**: backend domain/service/API/persistence, React UI, PostgreSQL migration, demo·verification utility
- **Test 영역**: backend pure/API/integration/contract, frontend component, Playwright browser scenario
- **운영 artifact**: Compose, Dockerfile, environment example, root task command, readiness
- **문서 영역**: README와 AI-DLC code summary·test traceability

## 확장 규칙 적용 상태

- **Resiliency Baseline**: N/A — Requirements Analysis에서 비활성화됨.
- **Security Baseline**: N/A — Requirements Analysis에서 비활성화됨. 승인된 upload, path, secret, error/log와 local binding 경계는 일반 요구사항으로 유지한다.
- **Property-Based Testing**: N/A — Requirements Analysis에서 비활성화됨. 승인된 example-based test를 사용한다.
