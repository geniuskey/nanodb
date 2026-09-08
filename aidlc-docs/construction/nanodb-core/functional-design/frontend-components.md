# NANoDB Core Frontend Components

> 2026-09-08 갱신: 홈 v2(CTA 규칙), 검색·필터, 삭제, 도형 라벨링, 확대·이동, 앱 내 확인 대화상자와 성공 알림을 반영해 현재 구현 기준으로 다시 썼다. 근거는 [ui-ux-review-2026-09-08.md](../../../inception/requirements/ui-ux-review-2026-09-08.md)다.

## 화면 구조

| 화면 | 하위 컴포넌트 | 책임 | API 연결 |
| --- | --- | --- | --- |
| App Shell | Header, Navigation, Feedback Region | 브랜드, 현재 위치, 공통 이동과 텍스트 상태 | 필요 시 summary |
| Home Page | Intro Video, Hero, Value Cards, KPI + Composition, Recent Images, Public Stats, Phases, AI-DLC, Flow + CTA, Policy Line | 제품 목적, 실측 KPI, 로드맵 구분 | summary·image 목록 조회 |
| Image List Page | List Header, Toolbar (검색·종류 필터), Result Count, Empty State, Image Cards, Delete | 최신순 이미지와 측정 건수, 검색·필터, 상세 이동, 삭제 | image 목록 조회, image 삭제 |
| Image Register Page | Image Preview, Metadata Form, Submit State | 파일·metadata 입력, 선행 검증과 등록 | image 등록 |
| Measurement Page | Image Viewer(+Zoom), Annotation Toolbar, Image Facts, Annotation Table, Measurement Controls, Measurement List(+Note Editor), Export Panel | 두 점 선택·표시·저장·복원, 도형 라벨링, 메모 수정, 삭제와 ZIP 다운로드 | image 상세, measurement 생성·메모 수정·삭제, annotation CRUD, image 삭제, export |
| 공용 | ConfirmDialog, StatusBanner | 되돌릴 수 없는 동작의 확인, 쓰기 성공 알림 | 없음 |

P0 게이트는 변하지 않았다. 위 표의 검색·필터, 삭제, 도형 라벨링, 확대·이동, 메모 수정은 P1으로 구현을 마친 항목이다.

## 공통 상태

모든 비동기 화면은 최소 다음 상태를 구분한다.

- `idle`: 아직 요청하지 않음
- `loading`: 요청 중이며 중복 행동 차단
- `success`: 실제 결과 표시
- `empty`: 성공했지만 표시할 데이터 없음
- `validation_error`: 사용자가 현재 입력을 수정할 수 있음
- `failure`: 예상하지 못한 실패, 내부 상세 미노출

성공과 실패는 색상 외에 텍스트로도 표시한다.

## Home Page

### 입력 상태

- 실제 전체 Image 수와 Measurement 수
- 파라미터별 건수·평균·최소·최대
- 집계 기준 시각
- Image 목록(SEM/TEM 구성, 등록 추이, 최근 6건)
- summary·목록 각각의 loading/failure 상태

### 상호작용

- 홈 본문은 읽는 문서로 두고 화면 이동은 상단 navigation이 담당한다(HOM-005). navigation은 어느 경로에서도 탭 하나만 현재 위치로 표시한다.
- 예외는 `이렇게 쓰세요` 사용 흐름 섹션 끝의 CTA 두 개(`이미지 등록`, `이미지 둘러보기`)뿐이다(HOM-034a).
- 미구현 로드맵 항목은 버튼이나 활성 navigation으로 표현하지 않는다.
- KPI나 최근 이미지 조회가 실패해도 정적 섹션은 계속 렌더링하고, 실패 자리에 다시 시도를 제공한다.
- 소개 영상은 유일한 외부 런타임 의존이다. 프레임 아래에 항상 설명 문구를 두어 차단 환경에서도 빈 상자로 남지 않게 하고, 동작 줄이기를 선택한 사용자에게는 자동 재생 대신 재생 버튼을 제공한다.

## Image List Page

### 표시 데이터

각 Image Card는 원본 파일명, SEM/TEM, Product, Lot, Wafer와 저장 Measurement 수를 표시한다. thumbnail을 제공할 경우 원본 비율을 유지한다.

### 상호작용

- 카드 선택 시 해당 Measurement Page로 이동한다.
- 검색어와 SEM/TEM 필터를 제공하고 현재 조건의 결과 건수를 표시한다.
- 필터를 다시 조회하는 동안에는 이전 결과를 유지하고 갱신 중임을 표시한다. 매 입력마다 목록이 사라지지 않는다.
- 검색·필터로 0건인 경우와 등록 자체가 0건인 경우를 다른 문구로 구분한다.
- 목록 조회 실패를 빈 상태로 위장하지 않는다.
- 카드마다 삭제를 제공하며, 확인 대화상자에 함께 사라지는 측정 건수를 표시한다.

## Image Register Page

### form state

필수 입력은 별표와 `aria-required`로 표시한다. 네이티브 `required`는 쓰지 않는다 — 브라우저 기본 검증이 먼저 막으면 앱이 준비한 오류 메시지가 표시되지 않기 때문이며, 대신 form에 `noValidate`를 둔다. 오류는 필드별로 상태를 나눠 해당 입력 옆에 표시하고 `aria-invalid`·`aria-describedby`로 연결하며, 제출 실패 시 첫 오류 입력으로 포커스를 옮긴다. 서버가 `field`를 지정한 오류도 같은 자리에 표시한다.

| 입력 | 클라이언트 선행 검증 | 서버 기준 검증 |
| --- | --- | --- |
| file | 한 개, PNG/JPEG 안내, 20MB 이하 | 실제 decoding, 크기, pixel dimensions |
| image type | SEM/TEM 선택 | enum 검증 |
| Product, Lot, Wafer | 비어 있거나 공백뿐인지 확인 | 필수 문자열 검증 |
| nm/pixel | 숫자이며 0보다 큰지 확인 | 유한한 양수 검증 |

### 상호작용

1. file 선택 후 local preview를 표시하되 원본을 변경하지 않는다.
2. 제출 중에는 버튼 중복 클릭을 막는다.
3. validation error는 가능한 경우 입력 가까이에 표시한다.
4. 성공하면 생성된 Image의 Measurement Page로 이동한다.
5. 실패하면 수정 가능한 입력값을 유지한다.

## Measurement Page

### Image Viewer props

- 원본 pixel width와 height
- 표시할 image source
- 저장된 Measurement 목록
- 현재 draft 시작점·끝점
- 선택된 저장 Measurement ID

### local state

- 실제 rendering image rectangle과 scroll viewport 크기
- 현재 배율(고정 단계 1, 1.5, 2, 3, 4, 6, 8)
- 선택한 `parameter_type`
- draft 원본 좌표 최대 두 점
- draft `distance_px`와 예상 `value_nm`
- 선택 메모와 메모 수정 draft
- 선택한 도형 도구와 draft 도형
- 확인 대기 중인 삭제 대상
- 저장·삭제·export 진행 상태, 오류와 성공 메시지

### 배율과 정확도

1. 배율 1은 이미지 전체가 viewport에 들어가는 크기이며 원본보다 확대하지 않는다.
2. 표시 폭은 `원본 너비 × fit scale × 배율`로 계산하고, viewport가 스크롤을 담당한다.
3. 좌표 변환은 배율과 무관하게 실제 rendering rectangle을 거치므로 저장 좌표는 항상 원본 기준이다.
4. 현재 배율에서 화면 1px이 원본 몇 px에 해당하는지 표시한다. 원본보다 축소된 상태에서는 원본 1px 단위로 지정할 수 없다는 사실을 감추지 않는다.

### 이미지 정보

`nm/pixel` 보정값, 원본 픽셀 크기와 등록 시각을 측정 중에 상시 표시한다. 측정값의 신뢰 근거가 export에만 있고 화면에 없으면 안 되기 때문이다.

### 도형 라벨링

- 화살표와 원 두 도구를 제공하고, 도구가 선택된 동안에만 overlay가 포인터 입력을 받는다.
- 도형은 그린 순서대로 번호가 붙고 표에 한 행씩 나타난다. 행에서 제품·Step·측정 항목 명을 입력한다.
- 도형과 표 행은 양방향으로 같은 강조 상태를 가진다. 도형의 hit 영역은 획으로 제한해 측정 클릭을 뺏지 않는다.
- 도형은 삭제할 수 있고, 이동·크기 조절은 제공하지 않는다.
- 도형은 계산값을 만들지 않는 참고 라벨이며 측정값과 시각적으로 구분한다.

### 저장 측정의 메모 수정

행별 `메모` 버튼으로 메모만 수정한다. 좌표·항목·픽셀 거리·값·보정값은 저장 후 불변이며, 편집 영역에 그 사실을 문구로 표시한다.

### 좌표 상호작용

1. image load와 resize 때 실제 rendering rectangle을 갱신한다.
2. image rectangle 안의 첫 click을 시작점으로 저장한다.
3. 두 번째 click을 끝점으로 저장하고 line·distance·nm preview를 표시한다.
4. 세 번째 click은 명시적 초기화 후 새 측정으로 시작하도록 처리해 우발적 덮어쓰기를 피한다.
5. `초기화`는 draft만 제거하고 저장 Measurement에는 영향을 주지 않는다.
6. 저장된 목록 항목 선택 시 대응 line과 목록 항목을 함께 강조한다.

### 저장 조건

저장 버튼은 항목, 서로 다른 두 유효 점과 유효한 Image 보정값이 있을 때만 활성화한다. 클라이언트 계산은 preview이며 서버 응답값으로 최종 표시를 갱신한다.

### Export Panel

- 저장 Measurement가 없으면 버튼을 비활성화하고 이유를 표시한다.
- 제조 식별정보, 원본 파일명, 메모와 저장 도형·도형 라벨이 포함되고 이미지 binary는 제외됨을 다운로드 전에 보여준다.
- 앱이 외부 AI로 자동 전송하지 않음을 명시한다.
- export 중 중복 요청을 막는다.
- 성공 응답만 ZIP 다운로드로 처리하고 오류 응답을 파일로 저장하지 않는다.

## API 응답 적용 규칙

- 서버 entity ID와 계산값을 client 임시값으로 대체하지 않는다.
- 상세 재조회나 새로고침 후 overlay는 저장된 원본 좌표에서 복원한다.
- 사용자에게 표시하는 nm 값은 둘째 자리까지 반올림하되 원본 숫자 상태는 유지한다.
- 존재하지 않는 Image는 일반 빈 화면이 아니라 대상 없음 상태로 표시하고 목록 이동 행동을 제공한다.
- 알 수 없는 서버 오류의 stack, SQL과 내부 파일 경로를 화면에 표시하지 않는다.

## 공용 컴포넌트

### ConfirmDialog

되돌릴 수 없는 동작(이미지·측정·도형 삭제)의 확인을 담당한다. `window.confirm`을 쓰지 않는 이유는 문구·삭제될 파생 데이터 건수·포커스 이동을 앱이 통제해야 하기 때문이다.

- 열릴 때 확인 버튼으로 포커스를 옮기고, 닫힐 때 호출한 요소로 돌려준다.
- Escape로 취소하고 Tab은 대화상자 안에서 순환한다.
- 본문에 함께 사라지는 측정·도형 건수를 명시한다.

### ErrorBoundary와 NotFoundPage

렌더 예외와 정의되지 않은 경로를 각각 복구 동선이 있는 화면으로 바꾼다. 둘 다 없을 때는 흰 화면이나 헤더만 남은 빈 shell이 되어 사용자가 앱이 망가졌다고 판단한다.

- ErrorBoundary는 오류 원인을 화면에 표시하지 않는다. 서버 오류 봉투와 같은 규칙이다.
- 다시 시도는 하위 트리를 다시 렌더링해 새로고침 없이 회복한다.

### useDocumentTitle

화면마다 문서 타이틀을 갱신한다. 갱신하지 않으면 탭·히스토리·보조 기술에서 네 화면이 모두 같아 보인다.

### StatusBanner

쓰기 성공을 `role="status"` 텍스트로 알린다. 실패는 기존대로 `role="alert"`를 쓴다. 성공과 실패를 모두 텍스트로 표시하라는 화면 공통 규칙을 만족시키기 위한 것이며, 색상만으로 상태를 전달하지 않는다.

## 자동화 친화적 경계

Code Generation에서는 등록 form, 주요 CTA, image canvas, 측정 항목, 저장·초기화, 저장 Measurement 항목과 export 버튼에 목적 기반의 안정적인 `data-testid`를 부여한다. 동적으로 변하는 ID 대신 역할이 유지되는 이름을 사용한다.
