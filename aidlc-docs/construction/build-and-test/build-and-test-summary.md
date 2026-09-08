# Build and Test Summary

NANoDB Core(US-01~US-07)의 build·test 실행 결과를 정직하게 기록한다. 이 환경에서
실행 가능한 게이트는 모두 실행해 실제 결과를 기록했고, 실행 환경이 필요한 항목은
미실행 사유와 재현 절차를 남겼다. 실행 일자: 2026-09-08.

## 환경 제약

- **Docker daemon 사용 불가** (이 환경). 컨테이너 이미지 build, `db → migrate → app`
  Compose 스택 기동, PostgreSQL integration test, 브라우저 e2e는 실행할 수 없었다.
- native Python(`uv`)·Node 도구 체인은 정상 동작하여 나머지 게이트를 모두 실행했다.

## Build Status

| 산출물 | 도구 | 상태 |
| --- | --- | --- |
| Frontend 정적 자산 | `npm run build` (tsc -b && vite build) | ✅ 성공 — 32 modules, `dist/frontend/assets/index-*.js` 247.73 kB (gzip 79.54 kB), 97ms |
| TypeScript typecheck | `npm run typecheck` | ✅ 성공 — 오류 없음 |
| mypy (backend) | `uv run mypy` | ✅ 성공 — 26개 source file, 오류 없음 |
| Ruff lint | `uv run ruff check .` | ✅ 성공 — All checks passed |
| 컨테이너 이미지 | `docker compose build` | ⏸ 미실행 — Docker daemon 사용 불가 |

## Test 실행 요약

### Unit·API·Contract (backend, pytest)
- **실행**: `uv run pytest`
- **결과**: **57 passed, 7 skipped**, 1 warning, 0.65s
- **skip 사유**: PostgreSQL integration test 7건은 `TEST_DATABASE_URL` 미설정으로 skip
- **warning**: Starlette TestClient `BlockingPortal` DeprecationWarning(무해)
- **상태**: ✅ Pass (실행된 범위)

### Unit (frontend, Vitest)
- **실행**: `npm run test:frontend` (vitest run)
- **결과**: **Test Files 6 passed (6), Tests 23 passed (23)**, 998ms
- **상태**: ✅ Pass

### Integration (PostgreSQL, pytest)
- **실행**: 미실행 — Docker daemon 사용 불가, `TEST_DATABASE_URL` 미설정으로 7건 skip
- **재현**: `integration-test-instructions.md` 절차(전용 test DB + `TEST_DATABASE_URL`)
- **상태**: ⏸ Not run (환경 제약)

### End-to-End (Playwright, chromium)
- **실행**: 미실행 — 기동된 스택 필요, Docker daemon 사용 불가
- **생성 확인**: 4개 시나리오가 discover·compile됨(생성 단계)
- **재현**: `e2e-test-instructions.md` 절차(`make demo` 후 `npm run test:e2e`)
- **상태**: ⏸ Not run (환경 제약)

### Performance
- **실행**: 부하 test 미실행 — 전용 하네스는 P0 범위 밖, 대표 endpoint 관찰은 스택 필요
- **N+1 회피**: PostgreSQL integration test로 판정(현재 skip)
- **상태**: ⏸ Not run (범위·환경 제약)

### Demo preflight (오프라인 검증)
- **실행**: `NANODB_PROFILE=demo uv run python scripts/preflight_demo.py`
- **결과**: **Demo preflight passed.**
- **상태**: ✅ Pass

### Source sample 무결성
- source sample(`data/samples/`)은 변경되지 않았고 무결성 검증을 통과했다(TEM 12,
  layout 2 manifest). 어떤 test·tooling도 source sample을 수정하지 않았다.

## Overall Status

- **Build**: 실행된 범위(frontend·typecheck·lint) 전부 성공. 컨테이너 이미지 build는
  Docker 환경에서 재현 필요.
- **Tests (실행된 범위)**: Pass — backend 57 passed / 7 skipped, frontend 23 passed,
  preflight passed.
- **Tests (미실행)**: PostgreSQL integration, 브라우저 e2e, 부하 test — 모두 환경/범위
  제약. 재현 절차는 각 instruction 문서에 기록됨.
- **Ready for Operations**: 조건부 Yes. 코드·unit·정적 게이트는 green이나, Operations
  진입 전에 Docker/PostgreSQL 환경에서 integration·e2e와 컨테이너 스택 기동을
  실행·판정할 것을 권고한다.

## 생성된 instruction 파일

- `build-instructions.md`
- `unit-test-instructions.md`
- `integration-test-instructions.md`
- `e2e-test-instructions.md`
- `performance-test-instructions.md`
- `build-and-test-summary.md` (이 문서)

## Next Steps

1. Docker/PostgreSQL이 준비된 환경에서 `make up`(또는 `make demo`)로 스택을 올리고
   `TEST_DATABASE_URL`을 지정해 integration test를 실행한다.
2. `npm run test:e2e`로 브라우저 시나리오를 실행·판정한다.
3. 위 두 게이트가 green이면 Operations 단계(배포·모니터링)로 진행한다. 현재 Operations는
   워크플로 placeholder이다.
