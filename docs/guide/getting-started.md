# 개발 환경 설정

이 문서는 NANoDB 저장소를 처음 넘겨받은 엔지니어가 로컬에서 앱을 띄우고 데모 데이터를 다루기까지의 절차를 정리합니다. 모든 명령은 저장소의 `Makefile`, `package.json`, `pyproject.toml`에 실제로 존재하는 것만 사용합니다. 큰 그림은 [아키텍처](/guide/architecture), 테스트·CI의 깊은 내용은 [테스트·빌드·배포](/guide/testing-and-ci)를 참고하세요.

## 사전 요구사항

| 도구 | 버전 | 고정 위치 | 용도 |
| --- | --- | --- | --- |
| Python | 3.12 계열 | `.python-version`(`3.12`), `pyproject.toml`(`requires-python = "==3.12.*"`) | 백엔드 런타임 |
| uv | 최신 | [astral.sh/uv](https://docs.astral.sh/uv/) | Python 의존성·실행 관리자 |
| Node.js | 22.17.1 | `.nvmrc`, `package.json`(`engines.node`) | 프론트엔드 빌드·테스트 |
| npm | Node 동봉 | — | 프론트엔드 lock 설치 |
| Docker + Compose v2 | 최신 | — | 컨테이너 실행 경로 |
| PostgreSQL | 16 | `compose.yaml`(`postgres:16.10-bookworm`) | 네이티브 실행 경로의 DB |

> [!NOTE]
> `.python-version`은 minor 버전 `3.12`만 고정합니다. 반면 `Dockerfile`은 재현성을 위해 `python:3.12.12-slim-bookworm`으로 patch까지 고정하고, Node는 `node:22.17.1-bookworm-slim`을 씁니다. 네이티브로 실행할 때는 3.12.x 아무 patch나 무방합니다.

`make`는 편의 래퍼일 뿐입니다. 없는 환경(기본 Windows 등)에서는 각 타깃이 감싸는 명령을 직접 실행하면 결과가 같습니다. 대응표는 저장소 `README.md`의 "make 없이 실행" 절에 있습니다.

## 최초 셋업

```bash
git clone https://github.com/geniuskey/nanodb.git
cd nanodb
cp .env.example .env        # 필요 시 값 수정
make install                # uv sync --frozen + npm ci
make build-frontend         # dist/frontend 생성
```

- `make install` — 백엔드와 프론트엔드 의존성을 **lock 파일 그대로** 설치합니다. `uv sync --frozen`은 `uv.lock`을 갱신하지 않고 그대로 재현하며, `npm ci`는 `package-lock.json`에 정확히 맞춰 `node_modules`를 깨끗이 다시 만듭니다. 둘 다 lock과 어긋나면 실패하므로 재현성이 보장됩니다.
- `make build-frontend` — `npm run build`(`tsc -b && vite build`)를 실행해 React 앱을 `dist/frontend`로 컴파일합니다. 앱은 이 산출물을 같은 오리진에서 정적으로 서빙합니다(`.env`의 `FRONTEND_DIST`).

> [!TIP]
> 컨테이너 경로만 쓸 계획이라면 호스트의 `make build-frontend`는 필요 없습니다. 프론트엔드는 Docker 이미지 안에서 빌드됩니다(`Dockerfile` 1단계). 그래도 `npm ci`는 데모·테스트 tooling에 필요합니다.

### .env 변수

`.env`는 git-ignore되며 실제 비밀값을 커밋하지 않습니다. `.env.example`의 항목은 다음과 같습니다.

| 변수 | 기본값 | 사용 주체 | 의미 |
| --- | --- | --- | --- |
| `DATABASE_URL` | `postgresql+psycopg://nanodb:nanodb@127.0.0.1:5432/nanodb` | 네이티브 앱·데모 스크립트 | 호스트 기준 DB 연결 문자열. 컨테이너는 쓰지 않음(컨테이너 안의 `127.0.0.1`은 컨테이너 자신) |
| `APP_DATABASE_URL` | 미설정 → `db:5432` | migrate·app 컨테이너 | 컨테이너 스택이 붙을 DB. 비워 두면 Compose 네트워크의 `db` 서비스 사용 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `nanodb` / `nanodb` / `nanodb` | `db` 서비스 | Compose PostgreSQL 컨테이너의 계정·DB |
| `DATABASE_POOL_SIZE` / `DATABASE_MAX_OVERFLOW` / `DATABASE_POOL_TIMEOUT` | `5` / `5` / `10` | 앱 | SQLAlchemy 커넥션 풀 튜닝 |
| `UPLOAD_ROOT` | `var/uploads` | 앱 | 등록 이미지 바이너리 저장 디렉터리. 컨테이너는 `/data/uploads`(호스트 `./var/uploads`에 bind mount) |
| `NANODB_PROFILE` | `demo` | 데모 시딩·리셋 | `demo`일 때만 가드된 시딩·리셋 진입점이 동작 |
| `FRONTEND_DIST` | `dist/frontend` | 앱 | 같은 오리진에서 서빙할 빌드된 프론트엔드 위치 |
| `LOG_LEVEL` | `INFO` | 앱 | 로깅 레벨 |
| `APP_PORT` | `8000` | 컨테이너 스택 | 앱을 loopback에 게시할 호스트 포트 |
| `DB_PORT` | `5432` | 컨테이너 스택 | PostgreSQL을 loopback에 게시할 호스트 포트 |

## 두 가지 실행 경로

### 네이티브 (uv + uvicorn)

로컬 PostgreSQL 16이 `DATABASE_URL`로 접근 가능해야 합니다.

```bash
make migrate                # alembic upgrade head
make dev                    # uvicorn --reload on 127.0.0.1:8000
```

`make dev`는 `nanodb.api.app:app`을 `127.0.0.1:8000`에 reload 모드로 띄웁니다. 포트 `8000`은 이 타깃에 하드코딩되어 있어 `APP_PORT`의 영향을 받지 않습니다(그 변수는 컨테이너 경로 전용).

프론트엔드는 `make build-frontend`로 만든 `dist/frontend` 정적 산출물을 앱이 서빙합니다. `package.json`에는 프론트엔드 개발 서버(`npm run dev` → `vite`)도 있으나, 이는 프론트엔드만 별도로 개발할 때의 선택지이며 앱의 기본 서빙 경로는 빌드된 자산입니다.

> [!WARNING]
> 앱과 데모 스크립트는 `.env`를 읽지만, alembic은 `alembic/env.py`에서 프로세스 환경변수 `DATABASE_URL`만 봅니다. `.env`에만 값을 적어 두면 alembic은 `alembic.ini`의 기본값 `127.0.0.1:5432`로 붙습니다. `DB_PORT`를 바꿨다면 migration에 `DATABASE_URL`을 직접 넘기세요.
>
> ```bash
> DATABASE_URL='postgresql+psycopg://nanodb:nanodb@127.0.0.1:5442/nanodb' uv run alembic upgrade head
> ```

### 컨테이너 (Docker Compose)

```bash
make up                     # docker compose up --build --wait
make demo                   # up + seed-demo, 그리고 접속 URL 출력
```

기동 순서는 `db → migrate → app`입니다. `migrate` 서비스가 `alembic upgrade head`로 마이그레이션을 성공적으로 끝낸 뒤에만(`service_completed_successfully`) 앱이 시작하며, DB는 health check를 통과해야 합니다(`compose.yaml`). 앱은 `http://127.0.0.1:${APP_PORT:-8000}`(loopback)에서 제공됩니다. `make demo`는 스택을 올린 뒤 데모 데이터를 적재하고 그 URL을 출력합니다.

이미지 바이너리는 호스트 `./var/uploads`에 bind mount되고 DB 데이터는 named volume(`nanodb-db`)에 유지됩니다. 원본 샘플(`data/samples/`)은 어떤 서비스에도 mount되지 않습니다.

스택 제어: `make stop`(볼륨 유지 정지) · `make down`(컨테이너 제거, 볼륨 유지) · `make clean`(**DB 볼륨까지 제거, 파괴적**).

## 데모 데이터

승인된 원본 TEM 샘플에서 화면 표시용 PNG 파생본을 만들고 무결성을 점검한 뒤, 실행 중인 DB에 적재하는 흐름입니다. 원본 `data/samples/`는 절대 수정하지 않습니다.

| 타깃 | 명령 | 하는 일 |
| --- | --- | --- |
| `make prepare-demo` | `python scripts/prepare_demo_samples.py` | `data/demo/`에 PNG 파생본과 `manifest.csv` 재생성 (오프라인) |
| `make preflight` | `python scripts/preflight_demo.py` | 파생본과 manifest의 일관성을 오프라인·읽기 전용으로 검증(파일 존재·SHA-256·크기·보정값·타입 등) |
| `make seed-demo` | `NANODB_PROFILE=demo python scripts/prepare_demo_samples.py --load` | 준비된 파생본을 **실행 중인 데모 DB와 업로드 루트에 적재** |
| `make reset` | `NANODB_PROFILE=demo python scripts/reset_demo.py --yes` | 데모 DB 행과 `var/uploads`를 known-empty 상태로 되돌림 |

> [!WARNING]
> `seed-demo`와 `reset`은 `NANODB_PROFILE=demo`를 요구합니다. 이 가드가 없으면 스크립트가 적재·초기화를 거부합니다. `reset`은 추가로 업로드 루트가 원본 샘플(`data/samples/`)·데모 파생본(`data/demo/`)과 겹치지 않는 전용 `var/uploads`인지 확인하고 나서야 삭제하며, 측정을 먼저 지운 뒤 이미지를 지웁니다. 원본과 파생본은 어느 경우에도 건드리지 않습니다.

> [!NOTE]
> `prepare_demo_samples.py`는 실행할 때마다 `data/demo/manifest.csv`의 `converted_at`을 현재 시각으로 다시 씁니다. 파생본 SHA-256은 그대로이므로, 커밋할 내용이 아니면 `git checkout -- data/demo/manifest.csv`로 되돌립니다.

## 자주 쓰는 Makefile 타깃

| 타깃 | 명령 | 설명 |
| --- | --- | --- |
| `install` | `uv sync --frozen` + `npm ci` | lock 기준 의존성 설치 |
| `build-frontend` | `npm run build` | React 앱을 `dist/frontend`로 빌드 |
| `migrate` | `uv run alembic upgrade head` | DB를 최신 revision으로 마이그레이션 |
| `dev` | `uv run uvicorn nanodb.api.app:app --reload` | 네이티브 API 실행(127.0.0.1:8000) |
| `lint` | `uv run ruff check .` | Python 린트 |
| `typecheck` | `uv run mypy` + `npm run typecheck` | 백엔드 mypy·프론트엔드 tsc |
| `test` | `test-backend` + `test-frontend` | 단위·통합 테스트 일괄 |
| `test-backend` | `uv run pytest` | 백엔드 pytest |
| `test-frontend` | `npm run test:frontend` | 프론트엔드 vitest |
| `test-e2e` | `npm run test:e2e` | Playwright 브라우저 시나리오 |
| `up` | `docker compose up --build --wait` | 컨테이너 스택 기동 |
| `demo` | `up` + `seed-demo` | 스택 기동 후 데모 적재·URL 출력 |
| `stop` | `docker compose stop` | 스택 정지(볼륨 유지) |
| `down` | `docker compose down` | 컨테이너 제거(볼륨 유지) |
| `clean` | `docker compose down --volumes` | 컨테이너·DB 볼륨 제거(파괴적) |

테스트 실행의 세부 사항(PostgreSQL 통합 테스트 가드, e2e 대상 서버 등)은 [테스트·빌드·배포](/guide/testing-and-ci)에서 다룹니다.

## 트러블슈팅

- **DB에 붙지 못함(네이티브)** — `make dev`/`make migrate`는 도달 가능한 PostgreSQL이 필요합니다. Compose의 `db`를 쓰려면 `make up`으로 먼저 띄우거나 로컬 PostgreSQL 16을 실행하세요. `DB_PORT`를 바꿨다면 `DATABASE_URL`을 alembic에 직접 넘겨야 합니다(위 경고 참고).
- **포트 사용 중** — 호스트 5432가 이미 쓰이면 `.env`의 `DB_PORT`를 빈 포트로 바꾸고 `DATABASE_URL`의 포트도 맞춥니다. 컨테이너끼리는 `db:5432`로 통신하므로 `DB_PORT` 변경은 호스트 접근에만 영향을 줍니다. 앱 포트 충돌은 `APP_PORT`로 조정합니다.
- **프론트엔드가 비어 보임** — 네이티브 경로에서 앱은 `dist/frontend`를 서빙합니다. `make build-frontend`를 실행하지 않았으면 이 디렉터리가 없습니다. 컨테이너 경로에서는 이미지 빌드 단계가 이를 대신합니다.
- **마이그레이션 미적용(테이블 없음)** — 앱을 띄우기 전에 `make migrate`(네이티브) 또는 `make up`(컨테이너의 `migrate` 서비스가 자동 수행)로 스키마를 만들어야 합니다.
- **`.venv` 제거 실패** — 다른 OS(컨테이너·WSL)에서 만든 venv가 남아 `uv`가 멈추면 `.venv/`를 통째로 지우고 `make install`을 다시 실행합니다. `.venv/`는 git·docker 양쪽에서 제외되므로 안전합니다.

---

이어서 [아키텍처](/guide/architecture)에서 전체 구조를, [백엔드](/guide/backend)·[프론트엔드](/guide/frontend)에서 각 계층을 확인하세요. 전체 문서 목록은 [개요](/guide/)에 있습니다.
