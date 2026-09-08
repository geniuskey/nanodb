# NANoDB Core Code Generation Summary

NANoDB Core(US-01~US-07)의 26단계 코드 생성 결과와 최종 일관성 검토를 기록한다. 실제
test 실행과 컨테이너 스택 기동의 최종 pass/fail 판정은 후속 Build and Test 단계에서
수행한다.

## 생성·수정 범위

### Application code

| 영역 | 위치 | 내용 |
| --- | --- | --- |
| Pure domain | `src/backend/nanodb/domain/` | entity·enum·error, 좌표 검증, 거리·nm 환산, half-up 표시 반올림, expected summary·export snapshot 검증 |
| Persistence | `src/backend/nanodb/persistence/`, `alembic/` | Image·Measurement 모델, migration, constraint, request-scoped session, 결정적 query |
| Adapters | `src/backend/nanodb/adapters/` | bounded staged file store, Pillow decoder, atomic promote·보상 삭제 |
| Services | `src/backend/nanodb/services/` | Image·Measurement·Summary·Context Export service와 allowlist ZIP builder |
| API | `src/backend/nanodb/api/`, `settings.py` | FastAPI factory, routes, schemas, safe error·request middleware, same-origin static frontend |
| Frontend | `src/frontend/src/` | App Shell·Home·Catalog·Register·Measurement, 좌표 adapter, SVG overlay, context export UI |

### Tooling·검증 자산

- `scripts/prepare_demo_samples.py`, `preflight_demo.py`, `reset_demo.py` — 오프라인 demo
  준비·검증과 profile/target guard 기반 source-safe reset.
- `data/demo/manifest.csv`와 PNG 파생본 — 승인된 TEM source의 무손실 파생본과 provenance.
- `validation/external-ai/` — 외부 AI 생성 코드 검증 자산(prompt, 생성 코드, 오프라인 비교
  runner, 결과 기록 형식). 앱 런타임 미연결, 모델 자동 호출 없음.

### Deployment·문서

- `Dockerfile`, `compose.yaml`, `.dockerignore`, `.env.example`, `.gitignore`, `Makefile` —
  3-stage non-root 이미지, `db → migrate → app` 스택, loopback 게시, task 진입점.
- `README.md`와 `aidlc-docs/construction/nanodb-core/code/`의 layer summary,
  `api-reference.md`, `deployment.md`, `test-traceability.md`.

## Test

| 계층 | 결과 |
| --- | --- |
| Backend (pure·API·contract) | 57 passed |
| Backend PostgreSQL integration | 7 skipped — `TEST_DATABASE_URL` 필요, Build and Test에서 실행 |
| Frontend unit (Vitest) | 23 passed (6 files) |
| Browser e2e (Playwright) | 4 scenario 생성·discover 확인, 실행은 Build and Test |

품질 게이트: Ruff 전체 통과, 계층 순수성 확인, demo preflight 통과, source sample 무결성
검증 통과(TEM 12·Layout 2 manifest).

## 최종 일관성 검토

| 검토 항목 | 결과 |
| --- | --- |
| 계획 밖 범위 유입 | 없음. 유일한 부수 변경은 Step 23에서 새 `make lint`(`ruff check .`) 게이트 통과를 위해 기존 sample utility 3개의 import 순서를 정규화한 것(동작 불변). |
| 누락 file | 없음. 계획된 application·tooling·deployment·문서 artifact 모두 존재. |
| Duplicate 수정본 | 없음. 중복·상충 파일 없음. |
| Source sample 변경 | 없음. `data/samples/`는 원본 dataset commit 이후 변경되지 않았고 무결성 검증 통과. |
| Runtime data·secret 추적 | 없음. `.env`, `var/uploads/`, `dist/`는 tracked되지 않으며 `.gitignore`가 커버. |
| 계층 역의존성 | 없음. domain은 순수하며 persistence·services·adapters는 상위 계층을 import하지 않음. |
| 미완료 story | 없음. US-01~US-07 구현·test·문서 생성 완료. US-08(Evidence Site)은 후속 작업 단위. |

## Story 완료 상태

| Story | 상태 |
| --- | --- |
| US-01 승인된 demo·preflight·source-safe reset | 생성 완료 |
| US-02 Home 실제 count·CTA·roadmap 경계 | 생성 완료 |
| US-03 PNG/JPEG 등록·검증·목록·상세·원본 불변 | 생성 완료 |
| US-04 원본 좌표 두 점·server 재계산·저장 | 생성 완료 |
| US-05 reload/resize 복원·선택 강조 | 생성 완료 |
| US-06 고정 네 파일 결정적 context ZIP | 생성 완료 |
| US-07 외부 생성 코드 실제 실행 절차·정직한 결과 근거 | 생성 완료 |

## 알려진 제한

- PostgreSQL integration test와 Playwright e2e는 실행 환경(DB, 기동된 스택)이 필요하며
  Build and Test에서 실행·판정한다.
- 이미지 build와 컨테이너 스택 기동은 Docker 환경에서 Build and Test 시 검증한다.
- 인증·권한, 검색, 측정 삭제, 항목별 집계, 자동 계측, 앱 내 AI 호출·코드 실행,
  multi-instance·객체 저장소·HA는 이번 P0 범위 밖이다.
- 수동 측정은 미검토 참고값이며 자동 계측 정답이 아니다.

## Review Gate

Code Generation review gate를 연다. 사용자 승인 시 Code Generation 단계를 완료 처리하고
Build and Test 단계로 진행한다.
