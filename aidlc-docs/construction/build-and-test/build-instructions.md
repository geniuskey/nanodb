# Build Instructions

NANoDB Core는 단일 배포 경계 안에 React frontend와 FastAPI backend를 함께 둔다.
"build"는 두 부분으로 나뉜다: frontend 정적 자산 build와 (배포용) 컨테이너 이미지
build. Backend Python은 별도 compile 단계가 없다.

## Prerequisites

- **Python**: CPython 3.12.12 (`.python-version`로 고정)
- **Python 의존성 관리**: `uv` (`uv.lock` frozen 설치)
- **Node.js**: 22.17.1 (`package-lock.json`로 고정)
- **Database**: PostgreSQL 16 (native 실행) 또는 Docker (compose 스택)
- **Container runtime**: Docker + Compose (이미지 build와 스택 기동용)
- **환경 변수**: `.env.example` 참고 — `DATABASE_URL`, `POSTGRES_*`, `UPLOAD_ROOT`,
  `NANODB_PROFILE`(기본 demo), `FRONTEND_DIST`, `LOG_LEVEL`, `APP_PORT`, `DB_PORT`
- **시스템**: macOS/Linux, 약 2GB 여유 디스크(이미지 layer 포함)

## Build Steps

### 1. 의존성 설치 (locked)

```bash
make install        # uv sync --frozen 그리고 npm ci
```

### 2. Frontend 정적 자산 build

```bash
make build-frontend # tsc -b && vite build -> dist/frontend/
```

- **기대 산출물**: `dist/frontend/index.html`, `dist/frontend/assets/*.js|*.css`

### 3. 컨테이너 이미지 build (배포)

```bash
docker compose build   # 또는 make up (build + 기동)
```

- 3-stage Dockerfile: Node frontend build → uv 기반 Python venv → non-root runtime
- 이미지 tag: `nanodb-core:local`
- source sample(`data/samples/`)은 이미지에 포함되지 않는다.

### 4. Build 성공 확인

- **Frontend**: `dist/frontend/` 생성, `vite build`가 오류 없이 완료
- **이미지**: `docker images | grep nanodb-core`로 `nanodb-core:local` 확인
- **허용 warning**: Starlette TestClient의 `anyio.abc.BlockingPortal` DeprecationWarning
  (test 수집 시 1건, 무해)

## 실제 build 결과 (이 환경, 2026-09-08)

| 산출물 | 명령 | 결과 |
| --- | --- | --- |
| Frontend 자산 | `npm run build` | 성공 — 32 modules, `dist/frontend/assets/index-*.js` 247.73 kB (gzip 79.54 kB) |
| TS typecheck | `npm run typecheck` | 성공 — 오류 없음 |
| mypy | `uv run mypy` | 성공 — 26개 source file, 오류 없음 |
| Ruff | `uv run ruff check .` | 성공 — All checks passed |
| 컨테이너 이미지 | `docker compose build` | **미실행** — 이 환경에서 Docker daemon 사용 불가 |

## Troubleshooting

### `python`/`python3`가 PATH에 없음
- **원인**: 시스템 Python 미설치 또는 미노출
- **해결**: 모든 Python 명령을 `uv run ...`으로 실행한다(예: `uv run pytest`).

### `uv sync`가 lock 불일치로 실패
- **원인**: `pyproject.toml` 변경 후 `uv.lock` 미갱신
- **해결**: 범위를 바꾸지 않는 최소 호환 조합만 적용하고 계획 변경 근거를 먼저 기록한다.

### 컨테이너 이미지 build 실패(daemon 없음)
- **원인**: Docker daemon 미기동
- **해결**: Docker Desktop/daemon을 기동한 뒤 `make up`을 다시 실행한다. daemon 없이도
  native 실행(`make migrate`+`make dev`)과 unit test는 가능하다.
