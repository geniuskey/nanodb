# NANoDB Core Tech Stack Decisions

## 결정 요약

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite | 측정 viewer의 local state와 overlay를 명확히 관리하고 팀이 확장하기 쉬움 |
| UI styling | plain CSS 또는 CSS Modules | 해커톤에서 불필요한 component framework 의존성 방지 |
| Image overlay | HTML image 위 SVG overlay | line·point 표시, resize 변환과 browser test가 단순함 |
| Backend API | Python, FastAPI, Pydantic | 기존 Python sample utility 재사용, 명시적 validation과 빠른 API 구현 |
| Domain/Persistence | SQLAlchemy 2.x style, synchronous session | 작은 single-instance 앱에서 단순한 transaction 경계와 팀 유지보수성 |
| PostgreSQL driver | Psycopg 3 | PostgreSQL 표준 연결과 SQLAlchemy 지원 |
| Migration | Alembic | versioned schema와 빈 환경 재현 |
| Image validation | Pillow | 기존 dependency를 활용한 실제 PNG/JPEG decoding과 pixel size 확인 |
| Local file store | Python standard file APIs와 system-generated key | 별도 저장 서비스 없이 안전한 single-host 저장 |
| ZIP/JSON | Python standard library | 고정된 네 파일 계약에 추가 framework가 필요하지 않음 |
| Backend test | pytest, FastAPI test client/httpx, 실제 test PostgreSQL | pure logic, API, migration과 repository 검증 |
| Frontend test | Vitest, React Testing Library | form과 state component 단위 검증 |
| Browser test | Playwright의 최소 P0 scenario | 좌표 overlay, reload와 download 흐름 검증 |
| Local database | Docker Compose PostgreSQL 또는 동일 major의 local PostgreSQL | 다른 개발자가 재현 가능한 기본 경로와 사내 설치 대안 제공 |

## Frontend 결정

### React + TypeScript

- Measurement Page의 draft point, selected measurement, resize state와 async 상태를 component 단위로 분리한다.
- API contract type을 frontend에 명시해 field 누락과 좌표 혼동을 줄인다.
- SPA route는 Home, Image List, Image Register와 Measurement Detail 네 개로 제한한다.
- 상태 관리 library는 추가하지 않고 React local state와 작은 data-fetching helper로 시작한다.

### SVG overlay

- image element의 실제 rendering rectangle 위에 동일 크기의 SVG를 겹친다.
- 저장 source는 원본 좌표이고 SVG position은 rendering 시 변환한다.
- line과 endpoint를 DOM에서 검사할 수 있어 browser automation에 유리하다.

### Build와 제공 방식

- 개발 중 Vite는 `/api`를 FastAPI로 proxy한다.
- 배포용 build는 same-origin으로 제공해 production CORS 구성을 만들지 않는다.
- 정확한 source directory와 script는 Code Generation 계획에서 확정한다.

## Backend 결정

### FastAPI + Pydantic

- multipart upload, JSON validation, 일관된 error response와 ZIP streaming을 담당한다.
- route는 orchestration만 수행하고 계산·validation·export logic은 service 또는 pure function으로 둔다.
- 자동 생성 API 문서는 개발 확인용이며 외부 public API로 약속하지 않는다.

### 동기식 SQLAlchemy

- MVP 요청량에서 async database stack의 복잡도를 추가하지 않는다.
- request 단위 session과 명시적 transaction을 사용한다.
- Image 목록 measurement count는 aggregate query로 조회한다.
- pool size, timeout과 database URL은 환경 설정으로 둔다.

## PostgreSQL와 migration

- Image와 Measurement를 별도 table로 두고 foreign key로 연결한다.
- application validation에 더해 enum/check, positive value와 required field 제약을 가능한 범위에서 database에도 둔다.
- 모든 schema 변경은 Alembic migration으로 관리한다.
- 해커톤 local PostgreSQL과 beta PostgreSQL은 같은 migration chain을 사용한다.
- PostgreSQL major와 package exact version은 local tool availability를 확인한 뒤 Code Generation plan에서 pin한다.

## 파일 저장

- upload root는 environment/config로 주입한다.
- database에는 원본 filename과 system-generated stored key만 저장한다.
- file path는 configured root와 stored key를 결합해 만들고 사용자 filename으로 조합하지 않는다.
- upload는 temporary location에서 validation한 뒤 최종 key로 이동한다.
- source sample directory와 runtime upload directory를 분리한다.

## 테스트 전략

| 계층 | 도구 | 핵심 대상 |
| --- | --- | --- |
| Pure unit | pytest | 거리, nm 환산, 좌표 범위, display rounding, export summary |
| Service/API | pytest + FastAPI client | 등록, 상세, measurement, summary, export error |
| Persistence | pytest + test PostgreSQL | migration, constraint, ordering, restart persistence |
| Frontend unit | Vitest + Testing Library | form state, empty/error state, button enablement |
| Browser P0 | Playwright | upload, two clicks, save, reload overlay, ZIP download |
| Contract | pytest | ZIP entry, JSON schema fields, ordering, UTF-8, deterministic content |

Property-based test library는 추가하지 않는다. 승인된 기준 사례와 경계값을 example-based test로 구현한다.

## Version과 dependency 관리

- Python과 Node는 지원되는 runtime version 하나를 project file에 고정한다.
- Python과 npm dependency는 lock 가능한 방식으로 exact version을 기록한다.
- framework 최신성보다 local build, PostgreSQL driver와 test 조합의 실제 호환성을 우선한다.
- dependency install, lint, typecheck, migration, test와 build command를 README에 기록한다.

## 의도적으로 선택하지 않는 것

- microservice, Kubernetes와 service mesh
- Redis, queue와 background worker
- object storage 또는 network file system
- ORM 외 별도 repository framework
- global frontend state library
- app 내 model SDK나 AI orchestration framework
- authentication library와 SSO integration

이 항목들은 해커톤 P0에 필요하지 않으며 beta 확대 조건이 확정될 때 별도로 평가한다.
