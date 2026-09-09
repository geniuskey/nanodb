# 확장 · 기여 가이드

이 문서는 NANoDB를 처음 인수받은 엔지니어가 **자신 있게 변경을 추가할 수 있도록** 실제 코드에 근거한 레시피를 모은 페이지입니다. 각 레시피는 "어떤 파일을, 어떤 순서로 손대는가"를 실제 경로로 짚습니다. 큰 그림은 [아키텍처](/guide/architecture), 계층별 상세는 [백엔드](/guide/backend) · [프론트엔드](/guide/frontend) · [데이터 모델](/guide/data-model)을 함께 보세요.

전제로 삼는 계층 구조(백엔드)는 다음과 같습니다. 요청은 위에서 아래로만 흐르며, 아래 계층은 위 계층을 알지 못합니다.

```
route (api/routes.py)
  → schema (api/schemas.py)  ·  mapper (api/mappers.py)
    → service (services/*.py)
      → domain (domain/*.py, 순수)
        → persistence (persistence/repositories.py → models.py)
          → adapters (adapters/*.py)
```

핵심 규칙: **도메인은 순수하게 유지합니다.** `domain/`은 FastAPI · SQLAlchemy · 파일시스템을 import하지 않습니다(`domain/calculations.py`, `domain/entities.py`를 보면 표준 라이브러리와 도메인 내부만 참조합니다). 값 계산과 검증은 도메인에서, 저장·조회는 퍼시스턴스에서, 오케스트레이션은 서비스에서, 전송 형태 변환은 매퍼/스키마에서 합니다.

## 1. 코드 컨벤션 & 게이트

### Python

- `from __future__ import annotations`를 모든 모듈 상단에 둡니다(저장소 전역 관례 — `routes.py`, `entities.py`, `calculations.py` 모두 첫 줄에 사용).
- 타입 힌트는 필수입니다. mypy가 `strict = true`(`pyproject.toml`)로 돌기 때문에 `Any` 누출, 미기재 반환 타입, 옵셔널 오용은 모두 실패합니다. scikit-image/scipy는 타입 정보가 없어 `[[tool.mypy.overrides]]`로 예외 처리되어 있으니, 이들 경계에서는 `numpy.typing`으로 배열 타입을 직접 명시하세요(`domain/features.py`의 `_Region` Protocol이 그 예).
- ruff는 `E, F, I, UP, B, SIM` 규칙을 켜고 `line-length = 88`입니다. `I`(import 정렬)와 `UP`(구식 문법 업그레이드)가 켜져 있으므로 import 순서와 최신 문법을 자동으로 강제받습니다.
- 도메인 실패는 `raise DomainError(code, message, field=..., status=...)`로 던집니다(`domain/errors.py`). 에러 핸들러(`api/errors.py`)가 `*_NOT_FOUND`는 404, 나머지 교정 가능한 실패는 422로 매핑하며, `status`를 명시하면 그 값을 씁니다(예: 409 충돌).

### TypeScript

- `tsconfig.app.json`이 `strict: true`이고 빌드가 `tsc -b && vite build`이므로, 타입 오류가 있으면 빌드가 실패합니다.
- API 호출은 반드시 `src/frontend/src/api/client.ts`의 `api` 객체를 통해서만 합니다. 컴포넌트에서 `fetch`를 직접 부르지 않습니다 — 에러 봉투 파싱과 `ApiError` 변환이 `client.ts`에 집중되어 있기 때문입니다.

### 커밋 전에 반드시 통과시켜야 하는 게이트

```bash
make lint        # ruff check .
make typecheck   # uv run mypy  +  npm run typecheck (tsc -b)
make test        # test-backend(pytest) + test-frontend(vitest)
```

::: warning
`make test`는 E2E(Playwright)를 포함하지 않습니다. 브라우저 시나리오는 `make test-e2e`로 별도 실행합니다. 백엔드 integration/contract 테스트는 격리된 PostgreSQL이 필요합니다 — 자세한 실행 조건은 [테스트·빌드·배포](/guide/testing-and-ci)를 보세요.
:::

## 2. 레시피 — 새 API 엔드포인트 추가

계층을 위에서 아래로 훑으며, 필요한 계층만 손댑니다. 아래는 "이미지에 딸린 메모 요약을 반환하는 GET 엔드포인트"를 예로 든 순서입니다.

1. **도메인 (필요할 때만)** — 새 값 객체나 계산이 필요하면 `domain/entities.py`에 `@dataclass(frozen=True, slots=True)`로 추가하고, 순수 로직은 `domain/calculations.py`에, 교정 가능한 실패는 `domain/errors.py`의 `DomainError`로 던집니다. 단순 조회면 이 단계는 건너뜁니다.
2. **서비스** — `services/*.py`에 오케스트레이션을 둡니다. 서비스는 `session_factory`를 주입받아 `with self._session_factory() as session:` 블록 안에서 리포지토리를 만들고, 쓰기 작업이면 마지막에 `session.commit()`합니다(`services/measurement_service.py`의 `create`가 표준 패턴). 존재하지 않는 리소스는 `DomainError("...NOT_FOUND", ...)`로 던집니다.
3. **스키마** — `api/schemas.py`에 요청/응답 Pydantic 모델을 정의합니다. 응답은 `*View`, 입력은 `*Schema`/`*Input` 관례를 따릅니다. 좌표처럼 유한 실수만 허용해야 하면 `FiniteFloat`, 길이 제약은 `Field(min_length=..., max_length=...)`를 씁니다.
4. **매퍼** — 도메인 엔티티를 `*View`로 바꾸는 함수를 `api/mappers.py`에 추가합니다(예: `measurement_view`). 매퍼는 퍼시스턴스를 몰라야 하며, `file_url` 같은 파생 필드도 여기서 만듭니다.
5. **라우트** — `api/routes.py`에 `@router.get(...)` 등을 추가합니다. 서비스는 `request.app.state.<service>`로 꺼내 씁니다(모든 서비스가 `api/app.py`의 `create_app`에서 `app.state`에 붙습니다). 라우트 함수는 서비스를 호출하고 매퍼로 감싸 반환만 합니다 — 비즈니스 로직을 넣지 마세요.
6. **의존성 배선 (새 서비스일 때만)** — 서비스 클래스를 새로 만들었다면 `api/app.py`의 `create_app`에서 `app.state.<name> = MyService(session_factory, ...)`로 등록합니다.
7. **테스트** — 라우트 수준은 `tests/backend/api/`(예: `test_routes.py`)에 추가합니다. 직렬화 계약이 걸리면 `tests/backend/contract/`도 봅니다.

예시 (라우트 골격):

```python
@router.get("/images/{image_id}/note-summary", response_model=NoteSummaryView)
def note_summary(image_id: int, request: Request) -> NoteSummaryView:
    result = request.app.state.image_service.note_summary(image_id)
    return note_summary_view(result)
```

::: tip
`response_model`을 반드시 명시하세요. 이 저장소의 모든 JSON 라우트가 `response_model`을 선언해 두어 OpenAPI 스키마와 계약 테스트가 정확히 동작합니다. 상세는 [API 레퍼런스](/guide/api-reference)를 보세요.
:::

## 3. 레시피 — 새 측정 타입/계산 규칙 추가

측정 타입은 여러 곳에 배선되어 있습니다. "새 측정 타입을 추가"할 때 순서대로 손대는 지점입니다.

1. **enum & 배선 테이블** — `domain/entities.py`의 `MeasurementType`에 값을 추가하고, 같은 파일의 `UNIT_BY_TYPE`(단위)와 `POINT_COUNT_BY_TYPE`(찍는 점 개수)에 항목을 추가합니다. 이 두 dict가 검증·계산·프론트 드로잉의 단일 출처입니다.
2. **계산** — `domain/calculations.py`의 `calculate_measurement` 분기에 새 타입의 값 계산을 추가합니다. 기존 `_calculate_length` / `_calculate_angle` / `_calculate_curvature`처럼 순수 함수로 만들고, 퇴화(degenerate) 입력은 `DomainError`로 거부합니다. 계산 결과는 항상 유한 양수여야 합니다(함수 말미의 공통 검증이 이를 강제).
3. **DB 체크 제약** — `persistence/models.py`의 `_MEASUREMENT_TYPE_CHECK` 문자열(`"measurement_type IN ('length', 'angle', 'curvature')"`)에 새 값을 넣습니다. 이는 `measurement_items`·`measurements` 두 테이블의 CheckConstraint로 쓰이므로, 값을 늘리려면 **마이그레이션이 필요합니다**(아래 레시피 4 참조).
4. **테스트** — `tests/backend/unit/test_calculations.py`에 계산 케이스를, 필요하면 `tests/backend/api/`에 라우트 케이스를 추가합니다.

::: tip
자동 추출기(`domain/features.py`)는 값을 직접 만들지 않고, 각 특징을 측정의 *점(points)*으로 표현한 뒤 `calculate_measurement`로 값을 얻습니다. 새 측정 타입을 계산에 제대로 배선하면 자동 추출·수동 입력·내보내기 검증이 모두 같은 경로를 타 일관성이 유지됩니다.
:::

## 4. 레시피 — DB 스키마 변경

스키마 변경은 모델 → 자동 생성 마이그레이션 → 검토 → 적용 순서입니다. 이 저장소는 Alembic 자동 생성을 씁니다(`alembic/versions/`에 이미 여러 리비전이 있습니다).

1. **모델 편집** — `persistence/models.py`의 해당 `*Model`에 컬럼/제약/인덱스를 추가합니다. 컬럼은 `Mapped[...]` + `mapped_column(...)`로 선언합니다.
2. **마이그레이션 자동 생성**

   ```bash
   uv run alembic revision --autogenerate -m "add images.foo"
   ```

3. **반드시 리뷰** — 생성된 `alembic/versions/*.py`를 열어 `upgrade()`/`downgrade()`가 의도대로인지 확인합니다. 자동 생성은 서버 기본값, 데이터 백필, enum/CheckConstraint 변경을 놓치기 쉽습니다. 기존 리비전(예: `20260909_0008_measurement_adjustment.py`)의 스타일과 파일명 규칙(`YYYYMMDD_NNNN_slug.py`)을 맞추세요.
4. **적용**

   ```bash
   make migrate      # uv run alembic upgrade head
   ```

5. **리포지토리 & 도메인 매핑 갱신** — 새 컬럼이 도메인에 노출되어야 하면:
   - `persistence/repositories.py`의 `_to_*` 변환 함수(예: `_to_image`, `_to_measurement`)에 필드를 추가하고, 생성/수정 메서드도 맞춥니다.
   - `domain/entities.py`의 대응 dataclass에 필드를 추가합니다.
   - 화면에 나가야 하면 `api/schemas.py`의 `*View`와 `api/mappers.py`의 매퍼도 갱신합니다.

스키마 전체 그림과 테이블 관계는 [데이터 모델](/guide/data-model)을 참고하세요.

## 5. 레시피 — 새 프론트엔드 페이지/컴포넌트 추가

1. **페이지 생성** — `src/frontend/src/pages/MyPage.tsx`를 만듭니다. 기존 페이지(`HomePage.tsx`, `ImageListPage.tsx`)의 구조를 따릅니다.
2. **라우트 배선** — `src/frontend/src/App.tsx`에 두 곳을 손댑니다.
   - `<Routes>` 안에 `<Route path="my" element={<MyPage />} />`를 추가합니다.
   - 상단 탭에 노출하려면 `REAL_TABS` 배열에 `{ to: "/my", label: "...", end: false }`를 추가합니다.
3. **API 호출 & 타입** — 새 백엔드 호출이 필요하면 `src/frontend/src/api/client.ts`의 `api` 객체에 메서드를 추가하고(기존 `getImage`, `createMeasurement` 패턴을 그대로 사용 — `request<T>`/`requestVoid` 헬퍼로 감쌉니다), 요청/응답 타입은 `src/frontend/src/api/types.ts`에 선언합니다.
4. **테스트** — 페이지 옆에 `MyPage.test.tsx`(vitest + Testing Library)를 둡니다. 공통 렌더 헬퍼는 `src/frontend/src/test/helpers.tsx`에 있습니다.

프론트엔드 상태·측정 오버레이·좌표 변환의 상세는 [프론트엔드](/guide/frontend)를 보세요.

## 6. 테스트 작성 가이드

계층별로 테스트 위치가 정해져 있습니다. 새 변경에 어떤 테스트를 추가할지 아래 기준으로 고르세요.

| 위치 | 대상 | 언제 추가하나 |
| --- | --- | --- |
| `tests/backend/unit/` | 순수 함수(도메인 계산, 세그멘테이션, 특징 추출) | DB 없이 검증 가능한 로직. `test_calculations.py`가 대표. |
| `tests/backend/integration/` | 서비스 ↔ 리포지토리 ↔ 실제 DB | 격리된 PostgreSQL이 필요(`@pytest.mark.integration`). 마이그레이션·리포지토리 계약. |
| `tests/backend/api/` | 라우트(FastAPI, httpx) | 새 엔드포인트, 상태 코드·에러 봉투. |
| `tests/backend/contract/` | 직렬화 계약(예: 컨텍스트 ZIP) | 외부/영속 포맷이 바뀌면. `@pytest.mark.contract`. |
| `src/frontend/src/**/*.test.tsx` | 컴포넌트·유틸(vitest) | 페이지/컴포넌트 동작, 순수 TS 유틸(`arc.test.ts` 등). |
| `tests/e2e/*.spec.ts` | 브라우저 전체 흐름(Playwright) | 사용자 시나리오(측정 그리기·조정·자동 분석). |

pytest 마커(`integration`, `contract`)는 `pyproject.toml`의 `[tool.pytest.ini_options]`에 등록되어 있고 `--strict-markers`로 오타를 잡습니다. 실행 명령과 CI 구성은 [테스트·빌드·배포](/guide/testing-and-ci)를 참고하세요.

## 7. Git / PR 흐름 & AI-DLC 메모

1. `main`에서 브랜치를 땁니다(예: `feat/...`, `fix/...`).
2. 커밋 전에 게이트를 통과시킵니다 — `make lint`, `make typecheck`, `make test`(필요 시 `make test-e2e`).
3. PR을 올리고 리뷰를 받습니다.

### AI-DLC 워크플로 메모

이 저장소는 **AI-DLC(AI Development Life Cycle) 워크플로**로 구축되었습니다. 설계·요구사항·계획 문서가 `aidlc-docs/` 아래에 단계별로 남아 있고, 모든 상호작용은 `aidlc-docs/audit.md`에 기록됩니다. 워크플로의 규칙 전체는 저장소 루트의 `CLAUDE.md`에 정의되어 있습니다.

::: tip
후속 개발자는 새 기능을 시작하기 전에 `aidlc-docs/`의 해당 단계 문서(요구사항 · 유저 스토리 · 기능/설계 문서)를 읽고, 필요하면 그 흐름을 이어서 갱신하세요. `CLAUDE.md`가 각 단계의 진입점과 산출물 위치(`aidlc-docs/inception/`, `aidlc-docs/construction/`)를 설명합니다. **애플리케이션 코드는 저장소 루트에, 문서는 `aidlc-docs/`에만** 둔다는 규칙이 있습니다.
:::

## 8. 함정 & 주의사항

::: danger 측정의 좌표·값은 불변입니다
측정의 `points`·`value`·`unit`·`calibration`은 사용자가 임의로 수정할 수 없습니다. 편집 가능한 것은 **주석(`label`, `note`)뿐**입니다(`MeasurementAnnotationSchema`). 점을 옮기는 것은 별도의 *지오메트리 교정* 경로(`PATCH .../geometry`, `services/measurement_service.py`의 `update_geometry`)로만 가능하며, 값은 클라이언트가 보낸 것을 받지 않고 **서버가 좌표에서 다시 계산**합니다. 첫 교정 시 원본 지오메트리·값(`original_points`, `original_value`, `adjusted_at`)을 보존하고, `/geometry/reset`으로 되돌릴 수 있습니다. 새 편집 기능을 만들 때 이 불변식을 우회하지 마세요.
:::

- **데모 데이터는 `NANODB_PROFILE=demo`로 가드됩니다.** `scripts/reset_demo.py`와 `scripts/prepare_demo_samples.py --load`는 `NANODB_PROFILE` 환경변수가 정확히 `demo`가 아니면 거부합니다. `make seed-demo` / `make reset`이 이 변수를 붙여 실행합니다. 원본 샘플(`data/samples/`)은 절대 쓰기 대상이 아니며 읽기 전용입니다.
- **`var/uploads`와 비밀정보는 커밋하지 마세요.** 업로드 루트(`upload_root = var/uploads`, `settings.py`)에는 런타임 이미지·파생물이 쌓입니다. `.env`(설정 파일)와 자격증명도 커밋 대상이 아닙니다.
- **세그멘테이션·특징 추출은 이미 구현되어 있습니다.** 소개 문서가 이를 가볍게 다루지만, 실제로는 다중 Otsu 세그멘테이션(`domain/segmentation.py`), 결정론적 특징 추출(`domain/features.py`), 배치 처리(`services/batch_service.py`)와 대응 라우트(`/segmentation`, `/features`, `/segmentation/batch`)가 동작합니다. 관련 의존성은 `pyproject.toml`의 `segmentation` 그룹(matplotlib, scikit-learn)에 있습니다. 이 영역을 확장할 때는 "없는 기능"으로 오해하지 말고 기존 구현을 먼저 읽으세요.
- **자동 측정은 검증된 기준이 아닙니다.** `MeasurementSource.AUTO`(특징 추출 산출)와 `MANUAL`(사람 입력)은 저장·화면에서 구분되며, 자동 값을 검증된 레퍼런스로 취급하지 않습니다.
- **도메인 순수성을 깨지 마세요.** `domain/` 아래 모듈에 FastAPI/SQLAlchemy/파일 I/O import를 추가하는 순간 계층이 무너집니다. 부수효과가 필요하면 서비스나 어댑터 계층에 두세요.

---

관련 문서: [개요](/guide/) · [개발 환경](/guide/getting-started) · [아키텍처](/guide/architecture) · [백엔드](/guide/backend) · [프론트엔드](/guide/frontend) · [데이터 모델](/guide/data-model) · [API](/guide/api-reference) · [컨텍스트 내보내기](/guide/context-export) · [테스트·빌드·배포](/guide/testing-and-ci) · [용어집](/guide/glossary)
