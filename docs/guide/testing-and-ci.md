# 테스트 · 빌드 · 배포

이 문서는 NANoDB를 넘겨받은 엔지니어가 테스트·빌드·배포 파이프라인을 **직접 실행하고, 신뢰하고, 확장**할 수 있도록 정리합니다. 모든 명령은 저장소의 `Makefile`, `package.json`, `pyproject.toml`, 각 설정 파일에 실제로 존재하는 것만 사용합니다. 무엇이 이 저장소에서 확인됐고 무엇이 아직 미검증인지는 [심사 근거](/evidence)의 상태 표와 일치시켜 정직하게 표기합니다.

로컬 셋업 절차는 [개발 환경](/guide/getting-started), 코드 구조는 [아키텍처](/guide/architecture)·[백엔드](/guide/backend)·[프론트엔드](/guide/frontend)를 참고하세요. 관련 링크: [개요](/guide/) · [데이터 모델](/guide/data-model) · [API](/guide/api-reference) · [컨텍스트 내보내기](/guide/context-export) · [용어집](/guide/glossary) · [확장·기여](/guide/contributing).

## 테스트 계층 개요

테스트는 네 개의 백엔드 계층(pytest), 프론트엔드 단위(vitest), 브라우저 e2e(Playwright), 그리고 정적 게이트(ruff·mypy·tsc·vite build)로 나뉩니다. 계층마다 필요한 전제가 다릅니다.

| 계층 | 도구 | 명령 | 검증 대상 | 필요 전제 |
| --- | --- | --- | --- | --- |
| 백엔드 단위 | pytest | `make test-backend` | 계산·기하·이미지 디코딩·세그멘테이션·데모 tooling 가드 등 순수 로직 | 없음 (DB 불필요) |
| 백엔드 통합 | pytest (`integration`) | `make test-backend` | migration·리포지토리·서비스·측정 조정을 실제 DB에 대해 검증 | `TEST_DATABASE_URL`(이름이 `_test`로 끝나는 PostgreSQL). 미설정 시 skip |
| 백엔드 API | pytest | `make test-backend` | FastAPI 라우트(등록·측정·배치·기하·세그멘테이션·실패 응답) | 통합과 동일한 DB 전제 (아래 참고) |
| 백엔드 계약 | pytest (`contract`) | `make test-backend` | 컨텍스트 내보내기 ZIP의 직렬화 계약 | 통합과 동일한 DB 전제 |
| 프론트엔드 단위 | vitest (jsdom) | `make test-frontend` | React 컴포넌트, 측정 오버레이·좌표계·호(arc)·라벨 기하 | 없음 (headless jsdom) |
| 브라우저 e2e | Playwright (Chromium) | `make test-e2e` | 등록→측정→저장·복원→내보내기 실제 시나리오, 실패 케이스 | **실행 중인 앱** + Chromium |
| 정적: 린트 | ruff | `make lint` | Python 스타일·버그 패턴(`E,F,I,UP,B,SIM`) | 없음 |
| 정적: 타입 | mypy + tsc | `make typecheck` | 백엔드 strict 타입, 프론트엔드 타입 | 없음 |
| 정적: 빌드 | vite (+tsc) | `make build-frontend` | 프론트엔드가 실제로 컴파일되는지 | 없음 |

> [!NOTE]
> `make test`는 `test-backend`와 `test-frontend`를 함께 돌립니다(브라우저 e2e는 포함하지 않음). e2e는 실행 중인 앱이 필요하므로 별도 타깃(`make test-e2e`)입니다.

## 백엔드 테스트 (pytest)

pytest 설정은 `pyproject.toml`의 `[tool.pytest.ini_options]`에 있습니다.

```toml
addopts = "-ra --strict-markers"
pythonpath = ["src/backend", "."]
testpaths = ["tests/backend"]
markers = [
  "integration: requires an isolated PostgreSQL database",
  "contract: validates an external or serialized contract",
]
```

- `--strict-markers` 때문에 위 표에 없는 마커를 쓰면 즉시 실패합니다. 새 마커를 추가하면 이 목록에도 등록해야 합니다.
- `pythonpath`가 `src/backend`를 얹으므로 테스트는 `import nanodb...`로 백엔드 패키지를, `import scripts...`로 데모 tooling을 임포트합니다.

### 계층 레이아웃

```
tests/backend/
├── unit/          # 순수 로직: test_calculations, test_features, test_image_decoder,
│                  #   test_segmentation, test_tiff_tags, test_batch_service,
│                  #   test_derived_store, test_demo_tooling
├── integration/   # DB 필요: test_migration_and_repositories, test_services,
│                  #   test_feature_service, test_measurement_adjustment, test_demo_reset
│                  #   (+ conftest.py 의 DB fixture)
├── api/           # FastAPI 라우트: test_routes, test_batch_routes, test_feature_routes,
│                  #   test_geometry_routes, test_segmentation_routes, test_image_service_failures
└── contract/      # test_context_zip (내보내기 ZIP 직렬화 계약)
```

### 실행

```bash
make test-backend          # uv run pytest
```

### PostgreSQL 전제와 `TEST_DATABASE_URL`

DB가 필요한 테스트의 fixture는 `tests/backend/integration/conftest.py`에 있고, 동작은 두 개의 안전 가드로 요약됩니다.

```python
url = os.environ.get("TEST_DATABASE_URL")
if not url:
    pytest.skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
database_name = make_url(url).database or ""
if not database_name.endswith("_test"):
    pytest.fail("TEST_DATABASE_URL must target a database ending in '_test'")
```

- **미설정이면 skip**: `TEST_DATABASE_URL`이 없으면 DB 기반 테스트는 실패가 아니라 **skip**됩니다. 즉 DB 없이 `make test-backend`를 돌리면 순수 단위 테스트만 통과하고 나머지는 건너뜁니다.
- **`_test` 접미사 강제**: 지정된 URL의 데이터베이스 이름이 `_test`로 끝나지 않으면 fixture가 `pytest.fail`로 중단합니다. 운영·개발 DB를 실수로 가리켜 데이터를 지우는 것을 막는 가드입니다.
- **테스트 간 격리**: 각 테스트 전에 `TRUNCATE ... RESTART IDENTITY CASCADE`로 `measurements`, `measurement_items`, `images`를 비우고, migration이 심은 기본 카탈로그 옵션은 유지한 채 사용자 추가 옵션만 지웁니다. migration은 세션 시작 시 `alembic upgrade head`로 적용됩니다.

DB를 붙여 전체 백엔드 스위트를 돌리는 예:

```bash
# 이름이 _test 로 끝나는 격리된 DB 를 가리켜야 함
export TEST_DATABASE_URL='postgresql+psycopg://nanodb:nanodb@127.0.0.1:5432/nanodb_test'
make test-backend
```

> [!WARNING]
> API·계약 테스트도 라우트 뒤에서 실제 세션을 쓰므로 `TEST_DATABASE_URL`이 없으면 함께 skip됩니다. "전부 통과"를 확인하려면 반드시 DB를 붙인 상태로 실행하세요.

### 현재 알려진 통과 수

[심사 근거](/evidence)에 기록된, 이 저장소에서 실제로 실행한 결과(확인 working tree `19b2af6`)는 다음과 같습니다.

| 스위트 | 결과 | 조건 |
| --- | --- | --- |
| 백엔드 `pytest` | **104 passed / skip 없음** | 로컬 PostgreSQL 16 기동, `TEST_DATABASE_URL` 지정 |
| 프론트엔드 `vitest` | **63 passed** | headless jsdom |
| 브라우저 e2e | **7 passed** | Chromium + 실행 중인 앱 |

> [!NOTE]
> 위 숫자는 evidence에 기록된 시점의 값입니다. 이후 테스트가 추가되면 실제 수집 개수는 늘 수 있으니, 최신 수치는 직접 실행해 확인하세요. `TEST_DATABASE_URL` 없이 돌리면 통합·API·계약 테스트가 skip되어 통과 수가 크게 줄어듭니다.

## 프론트엔드 테스트 (vitest)

설정은 `vite.config.ts`의 `test` 블록에 있습니다: `environment: "jsdom"`, `setupFiles: ["./src/test/setup.ts"]`. 실행 루트는 `src/frontend`입니다.

```bash
make test-frontend         # npm run test:frontend -> vitest run
```

테스트는 컴포넌트 옆에 co-locate되어 있으며(`*.test.tsx` / `*.test.ts`) 두 부류를 다룹니다.

- **컴포넌트/페이지 렌더링·동작**: `App`, `ErrorBoundary`, `HomePage`, `CatalogPage`, `ImageListPage`, `ImageRegisterPage`, `ImageInfoPanel`, `MeasurementPage`, `DemoRegisterPage` 등을 Testing Library로 렌더링해 상태·상호작용을 검증.
- **측정 기하 로직**: `measurement/coordinates.test.ts`(좌표계 변환), `measurement/arc.test.ts`(호 계산), `measurement/labels.test.ts`(라벨 배치), `measurement/MeasurementOverlay.test.tsx`(오버레이). 화면 좌표와 이미지 좌표, 캘리브레이션 단위 변환이 정확한지가 핵심입니다.

## 브라우저 e2e (Playwright)

설정은 `playwright.config.ts`에 있습니다. 요점만 정리하면:

- `testDir: "tests/e2e"`, `testMatch: "**/*.spec.ts"`, `projects`는 `chromium`(Desktop Chrome) 하나.
- `baseURL`은 `E2E_BASE_URL` 환경변수로 오버라이드 가능하며 기본값은 `http://127.0.0.1:8000` — **이미 실행 중인 앱**을 가리킵니다. Playwright가 앱을 띄우지 않으므로 스택을 먼저 올려야 합니다.
- `workers: 1`, `fullyParallel: false`(순차 실행), CI에서는 `retries: 1`·`forbidOnly`·`reporter: "github"`.
- `acceptDownloads: true` — 컨텍스트 내보내기 ZIP 다운로드를 검증하기 위함.

시나리오 스펙: `auto-analysis.spec.ts`, `measurement-flow.spec.ts`, `measurement-adjust.spec.ts`, `measurement-ux.spec.ts`, `failure-cases.spec.ts` (+ 공용 `helpers.ts`). 픽스처는 `tests/e2e/fixtures/sample.png` 한 장으로, 업로드 흐름에 쓰입니다.

```bash
make demo                  # 먼저 스택 + demo 데이터 기동
make test-e2e              # npm run test:e2e -> playwright test
# 다른 주소로:  E2E_BASE_URL=http://127.0.0.1:9000 make test-e2e
```

> [!TIP]
> Chromium 바이너리가 없으면 `npx playwright install chromium`으로 받습니다. 오프라인·제한 네트워크에서는 스크린샷 스크립트처럼 시스템 Chromium 경로를 지정하는 방식이 필요할 수 있습니다.

## 정적 게이트 (ruff · mypy · tsc · vite build)

| 게이트 | 명령 | 설정 위치 | 규칙 |
| --- | --- | --- | --- |
| ruff (lint) | `make lint` | `pyproject.toml` `[tool.ruff]` | `line-length=88`, `target-version=py312`, `select=["E","F","I","UP","B","SIM"]` |
| mypy (백엔드 타입) | `make typecheck` | `pyproject.toml` `[tool.mypy]` | `strict = true`, `packages=["nanodb"]`. `skimage.*`·`scipy.*`는 타입 정보가 없어 `ignore_missing_imports` |
| tsc (프론트 타입) | `make typecheck` | `tsconfig*.json` | `npm run typecheck` → `tsc -b --pretty false` |
| vite build | `make build-frontend` | `vite.config.ts` | `tsc -b && vite build` → `dist/frontend` |

`make typecheck`는 `uv run mypy`와 `npm run typecheck`를 이어서 실행합니다. mypy가 strict이므로 새 백엔드 코드는 타입 주석 없이는 통과하지 못합니다. 과학 이미지 라이브러리 경계에서는 `Any` 누수를 막기 위해 세그멘테이션 코드가 `numpy.typing`으로 배열 타입을 직접 주석합니다.

## Demo 검증 스크립트

데모 데이터 도구는 `scripts/`에 있고, DB를 건드리는 진입점은 모두 `NANODB_PROFILE=demo` 가드 뒤에 있습니다. 원천 샘플(`data/samples/`)은 어떤 경로에서도 변경되지 않습니다.

| 타깃 | 스크립트 | 동작 | 가드 |
| --- | --- | --- | --- |
| `make preflight` | `scripts/preflight_demo.py` | 오프라인·읽기 전용. manifest와 준비된 PNG 파생물이 일관적이고 안전한지 검증(개수·중복·존재·디코딩 가능·크기·SHA-256·캘리브레이션·타입·출처·타임스탬프) | 없음 (읽기 전용) |
| `make prepare-demo` | `scripts/prepare_demo_samples.py` | 승인된 TEM 원천을 무손실 PNG 파생물로 변환하고 `data/demo/manifest.csv`에 provenance 기록. 오프라인, DB 미접근 | 없음 (오프라인) |
| `make seed-demo` | `scripts/prepare_demo_samples.py --load` | 준비된 파생물을 데모 DB와 `var/uploads/`에 애플리케이션 서비스로 시딩 | `NANODB_PROFILE=demo` |
| `make reset` | `scripts/reset_demo.py --yes` | 런타임 Image·Measurement 행과 업로드 디렉터리를 비워 빈 baseline으로 초기화 | `NANODB_PROFILE=demo` + `--yes` + 업로드 루트 안전 검사 |

- `reset_demo.py`는 `NANODB_PROFILE`이 `demo`가 아니거나, 업로드 루트가 원천 샘플·데모 파생물 디렉터리와 겹치면 `ResetGuardError`로 중단합니다. `--yes` 없이는 대상 DB·업로드 루트만 출력하고 아무것도 지우지 않습니다.
- 이 가드들은 단위 테스트로 검증됩니다(`tests/backend/unit/test_demo_tooling.py`, DB 기반 리셋은 `tests/backend/integration/test_demo_reset.py`). 테스트는 임시 트리를 써서 실제 저장소 샘플을 절대 건드리지 않습니다.

## 컨테이너 빌드 & 스택

### Dockerfile (멀티 스테이지)

`Dockerfile`은 세 단계로 단일 런타임 이미지를 만듭니다.

1. **frontend** (`node:22.17.1-bookworm-slim`): `npm ci` 후 `npm run build`로 React 앱을 `/build/dist/frontend`에 컴파일. 로고(`assets/logo/`)·인트로 영상(`assets/video/`)만 재포함.
2. **backend-deps** (`python:3.12.12-slim-bookworm` + `uv:0.9.5`): `uv sync --frozen --no-dev --no-editable`로 잠긴 의존성을 `/opt/venv`에 설치.
3. **runtime** (`python:3.12.12-slim-bookworm`): venv와 빌드된 프론트엔드, alembic 설정만 복사. **비루트 사용자 `nanodb`**로 `uvicorn nanodb.api.app:app`을 `0.0.0.0:8000`에서 실행.

`.dockerignore`는 빌드 컨텍스트를 좁게 유지하고, 특히 원천 샘플 데이터(`data/`)와 런타임 상태(`var/`, `dist/`)가 이미지에 들어가지 않도록 막습니다.

### Compose 스택 (`compose.yaml`)

기동 순서는 **db → migrate → app**입니다.

- `db`: `postgres:16.10-bookworm`, named volume `nanodb-db`, `pg_isready` healthcheck, **loopback(`127.0.0.1`)에만** 포트 게시.
- `migrate`: 앱과 같은 이미지로 `alembic upgrade head`를 1회 실행(`restart: "no"`). `db`가 healthy가 된 뒤에만 시작.
- `app`: `migrate`가 성공적으로 완료된 뒤에만 시작. `/api/health/ready`를 폴링하는 healthcheck, `./var/uploads`를 `/data/uploads`에 bind mount, loopback에만 포트 게시.

```bash
make up                    # docker compose up --build --wait (db->migrate->app, health 대기)
make demo                  # up + seed-demo, 그리고 접속 URL 출력
make stop                  # 중지(볼륨 유지)
make down                  # 컨테이너 제거(DB 볼륨 유지)
make clean                 # 컨테이너 + DB 볼륨 제거 (파괴적)
```

> [!WARNING]
> 컨테이너 이미지 build와 Compose 스택 기동(`make up`/`make demo`)은 **미검증(unverified)** 상태입니다. 네이티브 경로의 테스트·정적 게이트·demo 스크립트는 이 저장소에서 실행·확인됐지만, 컨테이너 스택은 별도 환경에서 판정이 필요합니다. 자세한 상태는 [심사 근거](/evidence)를 보세요.

## CI / 배포 (GitHub Actions → GitHub Pages)

CI 워크플로우는 `.github/workflows/deploy-evidence-site.yml` **하나**뿐이며, **VitePress 문서 사이트(`docs/`)만** 빌드·배포합니다. 앱 런타임(백엔드·프론트엔드·컨테이너)은 배포하지 않습니다.

- **트리거**: `main` 브랜치 push 중 `docs/**`, `screenshots/**`, `.nvmrc`, 워크플로우 파일 자체가 바뀔 때만. 수동 `workflow_dispatch`도 가능.
- **권한(최소)**: `contents: read`, `pages: write`, `id-token: write`.
- **동시성**: `group: pages`, `cancel-in-progress: false` (진행 중 배포는 취소하지 않음).
- **build job**: `actions/setup-node`가 `.nvmrc`(22.17.1)로 Node를 고정하고 `docs/package-lock.json`으로 캐시. `docs`에서 `npm ci` → `npm run docs:build` → `docs/.vitepress/dist`를 Pages artifact로 업로드.
- **deploy job**: `needs: build`, `if: github.ref == 'refs/heads/main'`. build 성공 후에만 `actions/deploy-pages`로 배포. `github-pages` environment 사용.

> [!NOTE]
> **CI가 자동 실행하지 않는 것**: pytest·vitest·Playwright·정적 게이트는 이 워크플로우에서 돌지 않습니다. 통합 테스트와 브라우저 e2e의 CI 자동 실행은 [심사 근거](/evidence) 기준 **미검증**이며, 지금까지의 통과는 모두 로컬 실행 결과입니다. 배포는 문서 사이트에 한정되며 앱은 배포 대상이 아닙니다.

## 스크린샷 재현

시연 스크린샷은 `scripts/capture_screenshots.mjs`로 만듭니다. native로 기동된 Core 앱을 Playwright Chromium으로 순회하며 실제 화면을 `screenshots/`와 사이트용 사본 `docs/public/screenshots/`에 함께 저장합니다. 승인된 demo 데이터와 `tests/e2e/fixtures/sample.png`만 사용하고, 비밀정보나 원본 자료는 포함하지 않습니다.

```bash
# 앱을 먼저 기동한 뒤 (예: make demo)
node scripts/capture_screenshots.mjs
# 대상 주소 변경:  BASE_URL=http://127.0.0.1:9000 node scripts/capture_screenshots.mjs
# 이미 설치된 Chromium 지정:  CHROMIUM_PATH=/path/to/chromium node scripts/capture_screenshots.mjs
```

`BASE_URL`(기본 `http://127.0.0.1:8000`)로 대상을, `CHROMIUM_PATH`로 Playwright 다운로드가 불가한 환경에서 쓸 브라우저 실행 파일을 지정합니다. 이 스크립트는 앱 런타임에 상시 붙는 도구가 아니라 로컬 화면을 한 번 캡처하는 오프라인 보조 스크립트입니다.

## 새 엔지니어를 위한 최소 확인 순서

넘겨받은 직후, 아래 순서로 파이프라인이 살아 있는지 확인할 수 있습니다.

```bash
make install                       # lock 그대로 설치
make lint typecheck                # 정적 게이트
make test-frontend                 # vitest (DB 불필요)
export TEST_DATABASE_URL='postgresql+psycopg://nanodb:nanodb@127.0.0.1:5432/nanodb_test'
make test-backend                  # pytest (전 계층, DB 필요)
make preflight                     # demo 파생물 검증 (오프라인)
```

브라우저 e2e까지 보려면 스택을 올린 뒤 `make test-e2e`를 실행합니다. 컨테이너 경로(`make up`/`make demo`)는 아직 미검증이므로, 처음 실행할 때는 결과를 [심사 근거](/evidence)의 상태 표에 정직하게 반영하세요.
