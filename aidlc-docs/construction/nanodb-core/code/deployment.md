# NANoDB Core Deployment Reference

Step 23에서 생성한 배포·운영 artifact의 상세 참조 문서다. 실제 이미지 build와 스택
기동은 후속 Build and Test 단계에서 검증한다.

## Artifact 개요

| 파일 | 역할 |
| --- | --- |
| `Dockerfile` | 3-stage 단일 이미지 build (frontend → backend deps → non-root runtime) |
| `compose.yaml` | `db → migrate → app` 로컬 스택 |
| `.dockerignore` | source sample과 runtime state를 build context에서 제외 |
| `.env.example` | 모든 런타임 설정의 예시 |
| `Makefile` | native·container·demo·test 진입점 |

## 이미지 build (`Dockerfile`)

1. **frontend** (`node:22.17.1-bookworm-slim`): `npm ci` 후 `npm run build`로 React를
   `dist/frontend`에 build한다.
2. **backend-deps** (`python:3.12.12-slim-bookworm` + `uv`): `uv sync --frozen --no-dev
   --no-editable`로 lock된 non-dev 의존성과 `nanodb` 패키지를 `/opt/venv`에 설치한다.
3. **runtime** (`python:3.12.12-slim-bookworm`): `/opt/venv`, `dist/frontend`,
   `alembic.ini`, `alembic/`만 복사하고 non-root `nanodb` user로
   `uvicorn nanodb.api.app:app --host 0.0.0.0 --port 8000`을 실행한다.

이미지에는 application code·lock된 의존성·built frontend만 포함되며 `data/samples/`
(source sample)는 절대 복사하지 않는다. 이미지/도구 버전은 생성 시점 확인값이고 build에서
비호환이 드러나면 최소 호환 patch만 적용한다.

## 스택 (`compose.yaml`)

| 서비스 | 이미지 | 기동 조건 | 핵심 설정 |
| --- | --- | --- | --- |
| `db` | `postgres:16.10-bookworm` | — | `nanodb-db` named volume, `pg_isready` healthcheck, loopback `DB_PORT` |
| `migrate` | `nanodb-core:local` | `db` healthy | `alembic upgrade head` 1회 실행 후 종료 |
| `app` | `nanodb-core:local` | `migrate` 성공 완료 | `./var/uploads` bind mount, loopback `APP_PORT`, readiness healthcheck |

- 기동 순서는 `db → migrate → app`로 강제된다. `app`은 migration이 성공적으로 끝난
  뒤에만 시작한다.
- 이미지 바이너리는 host bind mount `./var/uploads`가 소유한다. DB 데이터는 named
  volume `nanodb-db`에 유지된다.
- app port는 `127.0.0.1`에만 게시된다. db port도 loopback에만 게시해 host-side demo
  seeding과 reset이 접근할 수 있게 한다.
- source sample은 어떤 서비스에도 mount하지 않는다.

## 환경 설정 (`.env.example`)

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+psycopg://nanodb:nanodb@127.0.0.1:5432/nanodb` | app·tooling 연결 문자열 (Compose 내부는 host `db`) |
| `POSTGRES_USER`/`PASSWORD`/`DB` | `nanodb` | `db` 서비스 자격/데이터베이스 |
| `DATABASE_POOL_SIZE`/`MAX_OVERFLOW`/`POOL_TIMEOUT` | `5`/`5`/`10` | connection pool |
| `UPLOAD_ROOT` | `var/uploads` (컨테이너 `/data/uploads`) | 이미지 바이너리 소유 경로 |
| `NANODB_PROFILE` | `demo` | demo seeding·reset guard |
| `FRONTEND_DIST` | `dist/frontend` | same-origin static frontend |
| `LOG_LEVEL` | `INFO` | 로깅 레벨 |
| `APP_PORT`/`DB_PORT` | `8000`/`5432` | loopback 게시 포트 |

`.env`는 git-ignore되며 실제 secret은 커밋하지 않는다.

## Task 진입점 (`Makefile`)

- **setup**: `install`(uv+npm lock 설치), `build-frontend`.
- **native run**: `migrate`(alembic upgrade head), `dev`(reload uvicorn on loopback).
- **quality**: `lint`(ruff), `typecheck`(mypy+tsc), `test`/`test-backend`/
  `test-frontend`/`test-e2e`.
- **demo data**: `preflight`(오프라인 검증), `prepare-demo`(파생본·manifest 재생성),
  `seed-demo`(`NANODB_PROFILE=demo` host-side 적재), `reset`(guard된 안전 초기화).
- **container**: `up`(build + `--wait`), `demo`(`up` 후 seed), `stop`, `down`,
  `clean`(volume 포함 제거, 파괴적).

## 운영 경계

- readiness는 DB `SELECT 1`과 upload root 읽기/쓰기로 판정한다(`/api/health/ready`).
- 비non-root 실행, loopback-only 게시, source sample 미포함, secret 미커밋은
  승인된 일반 보안 경계로 유지한다(Security Baseline extension은 비활성).
- demo seeding·reset은 앱 런타임이 아닌 host-side 활동이며 `NANODB_PROFILE=demo`와
  전용 target guard를 통과할 때만 동작한다.
