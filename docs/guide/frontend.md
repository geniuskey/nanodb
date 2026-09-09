# 프론트엔드

이 문서는 NANoDB의 React 프론트엔드(`src/frontend/src/`)를 처음 넘겨받은 엔지니어가 구조를 파악하고 이어서 개발할 수 있도록 정리합니다. 모든 설명은 실제 소스 파일에 근거하며 파일 경로를 함께 표기합니다. 큰 그림은 [아키텍처](/guide/architecture), API 계약은 [API](/guide/api-reference), 좌표·보정값 개념은 [용어집](/guide/glossary)을 참고하세요.

스택은 **React 19 + TypeScript + Vite**입니다(`package.json`: `react` `19.2.8`, `react-router-dom` `7.18.3`, `typescript` `7.0.2`, `vite` `8.2.2`). 상태 관리 라이브러리는 쓰지 않고, React 훅과 하나의 Context(`SummaryContext`)만으로 상태를 다룹니다.

## 프론트엔드 구조와 폴더 규칙

진입점은 `src/frontend/src/main.tsx`이며, `BrowserRouter` → `App` 순으로 마운트하고 `styles.css` 하나를 전역으로 불러옵니다. `StrictMode`가 켜져 있어 개발 모드에서 effect가 두 번 실행되는 점에 유의하세요.

```tsx
// src/frontend/src/main.tsx
createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>
);
```

폴더는 역할별로 나뉩니다.

| 폴더 | 역할 | 대표 파일 |
| --- | --- | --- |
| `pages/` | 라우트에 직접 대응하는 화면 컴포넌트 | `HomePage.tsx`, `CatalogPage.tsx`, `ImageListPage.tsx`, `ImageRegisterPage.tsx`, `DemoRegisterPage.tsx`, `MeasurementPage.tsx`, `ImageInfoPanel.tsx`, `NotFoundPage.tsx` |
| `measurement/` | 이미지 위 측정 오버레이와 순수 기하 로직 | `MeasurementOverlay.tsx`, `coordinates.ts`, `geometry.ts`, `arc.ts`, `labels.ts` |
| `ui/` | 여러 화면이 공유하는 UI 조각과 훅 | `Combobox.tsx`, `ConfirmDialog.tsx`, `ErrorBoundary.tsx`, `StatusBanner.tsx`, `useDocumentTitle.ts` |
| `api/` | 백엔드 통신과 공용 타입 | `client.ts`, `types.ts`, `summary-context.ts` |

원칙은 다음과 같습니다.

- **순수 로직은 DOM에서 분리한다.** `measurement/coordinates.ts`, `geometry.ts`, `arc.ts`, `labels.ts`는 React에 의존하지 않는 순수 함수 모듈입니다. 덕분에 jsdom 없이 단위 테스트가 가능하고(각 파일에 `*.test.ts` 존재), 그리기 컴포넌트(`MeasurementOverlay.tsx`)는 계산 결과를 SVG로 옮기는 역할만 맡습니다.
- **API 접근은 `api/client.ts`의 `api` 객체 한 곳으로 모은다.** 페이지는 `fetch`를 직접 부르지 않고 `api.listImages()` 같은 메서드만 호출합니다.
- **타입은 `api/types.ts`에 집중한다.** 프론트엔드가 다루는 모든 서버 뷰(view)와 입력(input) 타입이 여기 모여 있습니다.

## 라우팅과 페이지

라우팅은 `src/frontend/src/App.tsx`에서 정의합니다. 모든 라우트는 공통 레이아웃 `Shell`(헤더 탭바 + `<Outlet />` + 푸터)을 감싸는 하나의 부모 라우트 아래에 놓입니다.

| 페이지 컴포넌트 | 라우트 | 목적 |
| --- | --- | --- |
| `HomePage` | `/` (index) | 소개 영상, 값 제안, 실제 데이터 KPI/구성 그래프, 최근 이미지, Phase 로드맵, 사용 흐름 |
| `ImageListPage` | `/images` | 등록 이미지 목록. 검색(파일명·Product·Lot·Wafer)과 종류·Product 필터 |
| `ImageRegisterPage` | `/images/new` | 새 SEM/TEM 이미지 등록 폼(파일 + 제조 정보 + nm/pixel 보정값) |
| `DemoRegisterPage` | `/demo` | 걸어온 방문자용 클릭형 자동 분석 데모(세그멘테이션→자동 측정) |
| `CatalogPage` | `/catalog` | 검색·선택 목록(카탈로그) 값 관리(추가·수정·삭제) |
| `MeasurementPage` | `/images/:imageId` | 개별 이미지의 측정 화면(오버레이, 보정, 자동 분석, 삭제) |
| `NotFoundPage` | `*` | 위 라우트에 없는 주소를 위한 안내 화면 |

`Shell`의 헤더 탭바(`REAL_TABS`)에는 5개 탭만 노출됩니다: 홈(`/`) · 이미지DB(`/images`) · 이미지 등록(`/images/new`) · 데모 시연(`/demo`, CTA로 강조) · 카테고리(`/catalog`). 측정 화면(`/images/:imageId`)은 탭이 아니라 목록·데모에서 이미지를 눌러 들어갑니다.

> [!NOTE]
> 탭 활성 판정에 미묘한 규칙이 있습니다. `/images` 탭은 `end={false}`라서 이미지 상세(`/images/123`)에서도 활성으로 남지만, `/images/new`가 그 하위 경로처럼 보여 두 탭이 동시에 켜지는 문제가 있습니다. 이를 막기 위해 `/images` 탭에 `notOn: "/images/new"`를 두고, 현재 경로가 그 값일 때는 활성에서 제외합니다(`App.tsx`의 `className` 콜백).

`Shell`은 좁은 화면에서 탭을 디스클로저 버튼 뒤로 접으며, 경로가 바뀌면(`useLocation`의 `pathname`) 메뉴를 자동으로 닫습니다. 헤더 우측의 `StatusPill`은 `SummaryContext`에서 집계(이미지 수·측정 수·기준 시각)를 읽어 보여 줍니다.

## 측정 UI 심화

측정 화면(`MeasurementPage.tsx`)의 핵심은 이미지 위에 SVG로 도형을 그리는 `MeasurementOverlay`와, 원본 픽셀↔화면 픽셀 좌표를 오가는 `coordinates.ts`입니다. 여기가 프론트엔드에서 가장 까다로운 부분이므로 좌표 모델부터 설명합니다.

![측정 화면 - 자동 분석(세그멘테이션) 결과 오버레이](/screenshots/04-segmentation.png)

### 좌표 모델: 원본 픽셀과 화면 픽셀

측정의 점(`points`)은 항상 **원본 이미지 픽셀** 좌표로 저장·전송됩니다(`types.ts`의 `Point`, `MeasurementView.points` 주석: "Original-pixel points"). 반면 화면에는 이미지가 뷰포트에 맞게 축소·확대되어 그려지므로, 두 좌표계를 변환해야 합니다.

- **원본 크기**: `detail.pixel_width × detail.pixel_height` (등록 시 서버가 기록한 실제 픽셀 크기).
- **렌더 크기**: 화면에 실제로 그려진 `<img>`의 `getBoundingClientRect()` 값(`MeasurementPage`의 `rendered` 상태).

`coordinates.ts`가 세 가지 변환을 제공합니다.

| 함수 | 방향 | 쓰임 |
| --- | --- | --- |
| `toOriginalPoint(client, rect, original)` | 화면(클라이언트) → 원본 | 이미지 **밖** 클릭은 `null` 반환. 새 점 배치·커서 추적 |
| `toOriginalPointClamped(client, rect, original)` | 화면 → 원본 | 이미지 밖으로 나간 드래그를 가장 가까운 경계로 끌어당김. 핸들 드래그 |
| `toRenderedPoint(original, rect, original)` | 원본 → 화면 | 저장된 점을 SVG에 그릴 때 |

변환식 자체는 단순 비례입니다(`toOriginalPoint`):

```ts
// src/frontend/src/measurement/coordinates.ts
return {
  x: localX * original.width / rendered.width,
  y: localY * original.height / rendered.height,
};
```

두 가지 세부가 중요합니다.

- `toOriginalPoint`은 유효 좌표를 `0 <= x < width`로 보고 이미지 경계 **밖**의 클릭을 거부합니다(뷰어 여백을 측정 좌표로 만들지 않기 위함).
- `toOriginalPointClamped`은 드래그 전용입니다. 포인터가 제스처 도중 이미지 밖으로 자주 벗어나므로 좌표를 경계로 clamp하되, 원본 far edge(`width`)는 서버가 거부하므로 `EDGE_EPSILON`(`1e-6`)만큼 안쪽으로 당깁니다.

`MeasurementPage`는 `fitScale`(뷰포트에 이미지를 맞추되 1을 넘지 않음)과 고정 배율 단계(`ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8]`)로 표시 크기를 정합니다. 화면 1px이 원본 몇 px에 해당하는지를 `originalPerScreenPx = pixel_width / rendered.width`로 계산해 사용자에게 노출하고, 이 값이 1보다 크면 "원본 1px 단위로는 지정할 수 없습니다. 확대해 주세요."라고 안내합니다(`viewer-scale`). nm/pixel 보정값의 의미는 [용어집](/guide/glossary)을 참고하세요.

### 측정 종류와 값 미리보기

측정 종류는 세 가지이며, 종류별 점 개수와 값 계산은 `geometry.ts`에 순수 함수로 있습니다.

| 종류 | 점 개수 | 값 의미 | 단위 |
| --- | --- | --- | --- |
| `length` (길이) | 2 | 두 점 사이 선분 길이 | nm |
| `angle` (각도) | 3 | 꼭짓점 먼저, 두 변 끝점 | deg(°) |
| `curvature` (곡률) | 3 | 세 점을 지나는 원의 반지름 | nm |

`previewValue()`는 서버 공식을 그대로 미러링해 저장 전에 값을 미리 보여 줍니다. 다만 저장값은 **서버가 다시 계산한 값이 정답**이며(주석에도 명시), 점이 퇴화(동일·공선)하면 `null`을 돌려 미리보기를 숨깁니다. 곡률은 `circumradiusPx()`(세 점의 외접원 반지름)와 `circleCenter()`로 계산합니다.

### 두 점 선택·실시간 미리보기·저장 도형 복원

`MeasurementOverlay`(`MeasurementOverlay.tsx`)는 다음 세 가지를 한 SVG 안에서 그립니다.

1. **저장된 측정 도형 복원** — 각 `MeasurementView.points`(원본 픽셀)를 `toRendered`로 화면 좌표에 옮긴 뒤 종류별로 그립니다. 길이는 T자 끝단이 달린 선분(`lengthDrawing`), 각도는 두 변 + 각을 채운 쐐기(`angleDrawing`), 곡률은 **전체 원이 아니라 측정된 호와 반지름 선**만(`curvatureDrawing`)을 그립니다. 곡률에서 전체 원을 그리지 않는 이유는 `arc.ts` 상단 주석에 있습니다: 반지름이 구조물 폭의 몇 배라 원을 그리면 무관한 영역을 가로지르고 중심이 이미지 밖으로 나가기 때문입니다.
2. **실시간 미리보기** — 그리는 중에는 아직 놓지 않은 커서 위치(`draftCursor`)를 마지막 점으로 덧붙여(`provisionalDraft`) 도형이 커서를 따라오게 합니다. 커서 자체에는 별도 마커를 두지 않습니다.
3. **점 라벨 배치** — `labels.ts`의 `layoutLabels()`가 캡션이 서로 겹치지 않도록 전역 배치합니다. 자동 추출은 한 구조물에 최대 6개의 측정을 얹기 때문에, 각 캡션을 선호 방향으로 밀어내며 겹침을 피하고 이미지 안에 유지합니다(우선순위: 선택된 측정이 먼저 자리를 차지).

곡률 호는 SVG arc 세그먼트로 표현할 수 없는 경우(두 축의 스케일이 다를 때)를 대비해 **원본 픽셀에서 폴리라인으로 샘플링한 뒤 점마다 화면으로 변환**합니다(`arc.ts`의 `arcGeometry`). 반지름 선이 이미지 밖 중심으로 길게 뻗는 것은 Liang–Barsky 클리핑(`clipToBox`)으로 화면 경계에서 잘라 냅니다.

### 저장된 측정 보정 (드래그·방향키)

수동으로 새 측정을 그리는 기능은 **현재 비활성**입니다(`MeasurementPage.tsx`의 `MANUAL_MEASUREMENT_ENABLED = false`). 대신 이미 저장된(주로 자동 추출된) 측정의 점을 옮겨 보정하는 기능은 살아 있습니다.

- **드래그**: 보정 시작(`startAdjust`) 시 점의 사본(`adjustPoints`)을 만들고, 각 점을 `MeasurementOverlay`의 `Handle`(작은 표시 점 + 큰 투명 히트 영역)로 잡을 수 있게 합니다. 드래그는 핸들이 아니라 `window`에 바인딩합니다(포인터가 이미지 밖으로 자주 벗어나므로).
- **방향키**: 핸들에 포커스한 뒤 방향키로 1px, Shift+방향키로 10px씩 옮깁니다(`handleKeyDown`/`moveHandle`). "이 배율에서 1px은 손 떨림보다 작다"는 이유로 드래그만으로는 정밀 배치가 안 되기 때문입니다.
- **미리보기와 차이**: 보정 중에는 클라이언트가 `previewValue`로 값을 다시 계산해(`adjustPreview`) "지금 값 / 저장된 값 / 차이"를 보여 줍니다. 실제 점이 움직였을 때만(`adjustMoved`) 차이를 표시해, float 오차가 차이로 오독되는 것을 막습니다.
- **저장·되돌리기**: 저장은 `api.updateMeasurementGeometry`, 처음 값으로 되돌리기는 `api.revertMeasurementGeometry`를 호출합니다. 서버가 점으로부터 값을 다시 계산하며, 종류와 보정값(nm/pixel)은 바뀌지 않습니다.

`Escape`는 진행 중인 작업을 안쪽부터 취소합니다(보정 → 그리기 초안 순).

![측정 화면 - 저장됨](/screenshots/05-measurement-saved.png)

측정 화면 아래에는 제품별 **측정 항목**(파라미터) 표, **저장된 측정** 표(색상 스와치·수동/자동/보정됨 배지 포함), **자동 분석**(세그멘테이션·특징 추출) 패널, 이미지 삭제 위험 구역이 이어집니다. 자동 측정값은 점선으로 그려지고 "자동(미검증)"으로 표시되어 사람이 검증한 값과 시각적으로 구분됩니다.

## API 통신

모든 백엔드 호출은 `src/frontend/src/api/client.ts`의 `api` 객체를 거칩니다.

- **베이스 URL 없음, 상대 경로 `/api/...`**: `request()`는 `fetch(path, ...)`를 상대 경로로 호출합니다(예: `/api/summary`, `/api/images`). 즉 프론트엔드는 자신을 서빙한 오리진과 **같은 오리진**의 `/api`로 요청합니다. 개발 서버에서는 Vite 프록시가 `/api`를 `http://127.0.0.1:8000`으로 넘깁니다(`vite.config.ts`의 `server.proxy`). 프로덕션에서는 FastAPI가 빌드된 프론트와 `/api`를 같은 오리진에서 서빙합니다. 자세한 경로는 [백엔드](/guide/backend) 참고.
- **에러 처리**: 응답이 `!ok`이면 서버의 에러 봉투(`ApiErrorEnvelope`: `code`, `message`, `detail.field`)를 파싱해 `ApiError`로 던집니다. 파싱이 실패하면 내부를 노출하지 않는 고정 폴백 메시지를 씁니다. 페이지들은 `caught instanceof ApiError ? caught.message : "기본 메시지"` 패턴으로 사용자 메시지를 정합니다.
- **필드 단위 에러**: `ApiError.field`가 있으면 등록·수정 폼이 해당 입력 옆에 에러를 붙이고 포커스를 옮깁니다(`ImageRegisterPage.focusFirstError`, `ImageInfoPanel`).
- **204 처리**: 본문이 없는 삭제 등은 `requestVoid()`로 분리해 JSON 파싱을 시도하지 않습니다.

`api` 객체가 제공하는 주요 메서드(발췌):

| 메서드 | HTTP | 경로 |
| --- | --- | --- |
| `getSummary` | GET | `/api/summary` |
| `listImages(filter?)` | GET | `/api/images` (`q`, `image_type`, `product_id` 쿼리) |
| `getImage(id)` | GET | `/api/images/{id}` |
| `registerImage(form)` | POST | `/api/images` (`FormData`) |
| `updateImage` / `deleteImage` | PATCH / DELETE | `/api/images/{id}` |
| `createMeasurement` | POST | `/api/images/{id}/measurements` |
| `updateMeasurementAnnotation` | PATCH | `/api/images/{id}/measurements/{mid}` |
| `updateMeasurementGeometry` | PATCH | `/api/images/{id}/measurements/{mid}/geometry` |
| `revertMeasurementGeometry` | POST | `.../geometry/reset` |
| `getCatalog` / `createCatalogOption` / … | GET/POST/PATCH/DELETE | `/api/catalog` |
| `listMeasurementItems` / `createMeasurementItem` / … | GET/POST/… | `/api/measurement-items` |
| `getSegmentation` / `runSegmentation` | GET / POST | `/api/images/{id}/segmentation` |
| `extractFeatures` | POST | `/api/images/{id}/features` |

공용 타입은 `api/types.ts`에 있습니다. `MeasurementView`(점·값·단위·보정값·source·보정 이력), `ImageDetailView`(`ImageView` + `measurements`), `SegmentationResultView`, `FeatureExtractionResultView` 등이 서버 응답 구조를 그대로 반영합니다. 전체 계약은 [API](/guide/api-reference), 도메인 의미는 [데이터 모델](/guide/data-model)을 보세요.

### 집계 상태 공유 (`SummaryContext`)

`api/summary-context.ts`는 `/api/summary`를 앱 전체에서 한 번만 가져오도록 하는 얇은 Context입니다. `Shell`이 `useSummaryFetch()`로 한 번 받아 Provider로 내려 주고, 헤더의 `StatusPill`과 홈의 KPI 섹션은 `useSummary()`로 이를 공유합니다. Provider가 없는 트리에서는 `useSummary`가 스스로 fetch하도록 폴백합니다(`shared === undefined`일 때만 자체 fetch). 상태는 `"loading" | "success" | "failure"`로 표현합니다.

## 공용 UI 컴포넌트와 상태·피드백 처리

페이지 전반이 **loading / success / failure / empty** 네 상태를 명시적으로 다룹니다. 예를 들어 `ImageListPage`는 최초 로딩 시 스켈레톤 그리드를 보여 주고, 필터 재조회 시에는 이전 결과를 유지한 채 "갱신 중"만 표시해 화면이 깜빡이지 않게 합니다. `HomePage`의 KPI/최근 이미지도 같은 패턴을 따릅니다.

| 컴포넌트/훅 (`ui/`) | 역할 |
| --- | --- |
| `StatusBanner` | 쓰기 성공 알림. `role="status"`로 포커스를 뺏지 않고 텍스트로 알림(색상만으로 알리지 않음) |
| `ErrorBoundary` | 예기치 못한 렌더 오류의 최후 방어선. 복구 화면을 보여 주되 스택·내부 경로는 노출하지 않음. `Shell`이 `<Outlet />`을 이걸로 감쌈 |
| `ConfirmDialog` | 되돌릴 수 없는 작업(삭제 등)의 인앱 확인 모달. `window.confirm` 대체 — 포커스 이동, Escape 취소, Tab 트랩 |
| `Combobox` | 타이핑 검색형 단일 선택 + **새 값 입력 허용**. 등록·수정 폼의 카탈로그 필드(이미지 종류·Product·Lot·Wafer·공정 Step)에서 사용 |
| `useDocumentTitle` | 현재 화면 이름을 브라우저 탭 제목(`… · NANoDB`)에 반영. SPA에서 라우트별 제목을 위해 필요 |

실패는 `role="alert"`, 성공은 `role="status"`로 구분해 스크린리더 접근성을 지킵니다. `ConfirmDialog`와 `ImageInfoPanel`의 편집 모달은 모두 포커스 트랩·Escape 취소·복귀 포커스를 직접 구현합니다.

## 빌드와 개발 서버

빌드 설정은 저장소 루트의 `vite.config.ts`에 있고(프론트엔드 `root`는 `src/frontend`), 스크립트는 루트 `package.json`에 있습니다.

| 명령 | 동작 |
| --- | --- |
| `npm run dev` | Vite 개발 서버(`127.0.0.1:5173`). `/api`는 `127.0.0.1:8000`으로 프록시. 프론트엔드만 별도로 개발할 때 사용 |
| `npm run build` | `tsc -b && vite build` → `dist/frontend` 생성 |
| `npm run typecheck` | `tsc -b --pretty false` (타입 검사만) |
| `npm run test:frontend` | `vitest run` (jsdom 환경, `src/test/setup.ts`) |
| `npm run test:e2e` | `playwright test` |

빌드 산출물은 `dist/frontend`로 나가며(`vite.config.ts`의 `build.outDir`), 앱을 운영할 때는 이 정적 산출물을 **FastAPI가 같은 오리진에서 서빙**합니다. 즉 개발 시에는 Vite 개발 서버 + 프록시로, 운영 시에는 빌드된 자산으로 동작합니다. 두 경로 모두 프론트엔드는 자신과 같은 오리진의 `/api`를 호출하므로 클라이언트 코드에 베이스 URL을 하드코딩하지 않습니다.

앱 기동·환경 변수(`FRONTEND_DIST` 등)는 [개발 환경 설정](/guide/getting-started), 테스트·CI 파이프라인은 [테스트·빌드·배포](/guide/testing-and-ci)를 참고하세요.

> [!TIP]
> TypeScript 설정은 프로젝트 레퍼런스 구조입니다. 루트 `tsconfig.json`이 `tsconfig.app.json`(앱 코드, `src/frontend/src` 포함)과 `tsconfig.node.json`을 참조합니다. `strict`가 켜져 있으므로 새 코드도 엄격 타입을 지켜야 합니다.

## 새 페이지·컴포넌트 추가

새 라우트를 추가하려면 `pages/`에 컴포넌트를 만들고 `App.tsx`의 `<Routes>`에 `<Route>`를 등록한 뒤, 상단 탭이 필요하면 `REAL_TABS`에 항목을 더합니다. 공용 조각은 `ui/`, 순수 계산 로직은 별도 모듈로 분리하고 `*.test.ts(x)`를 함께 두는 관례를 따르세요. 커밋·PR 규칙과 게이트 워크플로는 [확장·기여](/guide/contributing)를 참고하세요.
