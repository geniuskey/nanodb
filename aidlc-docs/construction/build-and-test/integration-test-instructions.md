# Integration Test Instructions

## 목적

실제 PostgreSQL을 대상으로 migration, DB constraint, transaction rollback, N+1 없는
집계, 최신순·결정적 ordering, restart persistence, demo reset의 source-safe 동작을
검증한다. mock DB 성공만으로는 persistence를 판정하지 않는다.

NANoDB Core는 단일 배포 경계의 단위이므로 "unit 간" integration은 backend 계층
(service → repository → PostgreSQL)과 frontend↔API 흐름을 뜻한다. 후자는
`e2e-test-instructions.md`의 브라우저 시나리오로 검증한다.

## Test 대상

| 파일 | 검증 |
| --- | --- |
| `tests/backend/integration/test_migration_and_repositories.py` | migration head, table·constraint, 최신순 상세, ID 오름차순 export query, N+1 없는 집계 |
| `tests/backend/integration/test_services.py` | service 계층의 재계산·저장·summary·export snapshot |
| `tests/backend/integration/test_demo_reset.py` | reset 후 Image·Measurement 0건, source sample 불변 |

## 테스트 환경 준비

### 1. PostgreSQL 기동

옵션 A — Compose의 db 서비스만 사용:

```bash
docker compose up -d db          # loopback DB_PORT로 게시
```

옵션 B — 로컬 PostgreSQL 16 인스턴스 사용.

### 2. 전용 test 데이터베이스 지정

```bash
createdb nanodb_test              # 또는 psql로 생성
export TEST_DATABASE_URL="postgresql+psycopg://<user>:<pass>@127.0.0.1:<port>/nanodb_test"
```

- 이 변수가 없으면 integration test는 skip된다(unit 실행을 막지 않는다).
- test DB는 운영/demo DB와 분리한다.

## 실행

```bash
uv run pytest tests/backend/integration
# 또는 전체(unit + integration 함께)
make test-backend
```

### 검증 포인트

- migration이 head까지 적용되고 재적용이 안전하다.
- enum/check/positive/foreign-key constraint가 위반을 거부한다.
- 집계 query가 N+1 없이 count·목록을 반환한다.
- 상세는 최신순, export는 ID 오름차순으로 결정적이다.
- reset은 `NANODB_PROFILE=demo`와 target guard를 통과한 경우에만 전용 row와
  `var/uploads/`를 비우고 `data/samples/`는 절대 건드리지 않는다.

### Cleanup

```bash
dropdb nanodb_test               # 선택
docker compose down              # db 서비스 정리(옵션 A)
```

## 실제 결과 (이 환경, 2026-09-08)

**미실행 — 환경 제약.** 이 환경은 Docker daemon 사용 불가이고 `TEST_DATABASE_URL`이
설정되지 않아 7개 integration test가 모두 skip됐다. PostgreSQL 16이 준비된 환경에서
위 절차로 실행·판정해야 한다.
