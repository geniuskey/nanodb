# NANoDB Core Frontend Components

## 화면 구조

| 화면 | 하위 컴포넌트 | 책임 | API 연결 |
| --- | --- | --- | --- |
| App Shell | Header, Navigation, Feedback Region | 브랜드, 현재 위치, 공통 이동과 텍스트 상태 | 필요 시 summary |
| Home Page | Hero, Value Cards, MVP Scope, Summary Cards, Flow, Policy Line | 제품 목적, 실제 KPI, 활성 CTA와 로드맵 구분 | summary 조회 |
| Image List Page | List Header, Empty State, Image Cards | 최신순 이미지와 측정 건수, 상세 이동 | image 목록 조회 |
| Image Register Page | Image Preview, Metadata Form, Submit State | 파일·metadata 입력, 선행 검증과 등록 | image 등록 |
| Measurement Page | Image Viewer, Measurement Controls, Measurement List, Export Panel | 두 점 선택·표시·저장·복원과 ZIP 다운로드 | image 상세, measurement 생성, export |

검색, Measurement 삭제와 항목별 평균 UI는 P1이므로 P0 컴포넌트에 포함하지 않는다.

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

- 실제 전체 Image 수
- 실제 전체 Measurement 수
- 집계 기준 시각
- summary loading/failure 상태

### 상호작용

- `이미지 둘러보기`는 Image List로 이동한다.
- `이미지 등록`은 Image Register로 이동한다.
- 측정 시작은 Image 선택이 필요함을 표시하고 Image List로 이동한다.
- 개발 컨텍스트 진입은 Image 선택과 저장 Measurement가 필요함을 설명한다.
- 미구현 로드맵 항목은 버튼이나 활성 navigation으로 표현하지 않는다.

## Image List Page

### 표시 데이터

각 Image Card는 원본 파일명, SEM/TEM, Product, Lot, Wafer와 저장 Measurement 수를 표시한다. thumbnail을 제공할 경우 원본 비율을 유지한다.

### 상호작용

- 카드 선택 시 해당 Measurement Page로 이동한다.
- 결과가 0건이면 등록 CTA와 빈 상태 문구를 표시한다.
- 목록 조회 실패를 빈 상태로 위장하지 않는다.

## Image Register Page

### form state

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

- 실제 rendering image rectangle
- 선택한 `parameter_type`
- draft 원본 좌표 최대 두 점
- draft `distance_px`와 예상 `value_nm`
- 선택 메모
- 저장·export 진행 상태와 오류

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
- 제조 식별정보, 원본 파일명과 메모가 포함되고 이미지 binary는 제외됨을 다운로드 전에 보여준다.
- 앱이 외부 AI로 자동 전송하지 않음을 명시한다.
- export 중 중복 요청을 막는다.
- 성공 응답만 ZIP 다운로드로 처리하고 오류 응답을 파일로 저장하지 않는다.

## API 응답 적용 규칙

- 서버 entity ID와 계산값을 client 임시값으로 대체하지 않는다.
- 상세 재조회나 새로고침 후 overlay는 저장된 원본 좌표에서 복원한다.
- 사용자에게 표시하는 nm 값은 둘째 자리까지 반올림하되 원본 숫자 상태는 유지한다.
- 존재하지 않는 Image는 일반 빈 화면이 아니라 대상 없음 상태로 표시하고 목록 이동 행동을 제공한다.
- 알 수 없는 서버 오류의 stack, SQL과 내부 파일 경로를 화면에 표시하지 않는다.

## 자동화 친화적 경계

Code Generation에서는 등록 form, 주요 CTA, image canvas, 측정 항목, 저장·초기화, 저장 Measurement 항목과 export 버튼에 목적 기반의 안정적인 `data-testid`를 부여한다. 동적으로 변하는 ID 대신 역할이 유지되는 이름을 사용한다.
