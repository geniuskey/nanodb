# NANoDB Core Functional Design 계획

## 목적

US-01~US-07을 구현하기 전에 이미지 등록, 두 점 측정, 저장·복원, 요약과 개발 컨텍스트 내보내기의 기술 독립적인 도메인 규칙을 확정한다.

## 계획 진행 상태

- [x] NANoDB Core 단위 정의, story map, 요구사항과 Application Design을 읽는다.
- [x] Business Logic, Domain Model, Business Rules, Data Flow, Integration, Error Handling, Business Scenarios와 Frontend Components의 모호성을 평가한다.
- [x] 추가 사용자 질문이 필요하지 않음을 확인한다.
- [x] 해커톤 P0와 제외 범위를 Functional Design 경계로 확정한다.

## 질문 평가

추가 질문은 만들지 않는다. 좌표계·계산식·허용 범위·표시 반올림·저장 정밀도, 이미지 형식과 크기, ZIP 구성·순서·오류, 화면 흐름과 외부 AI 경계가 승인된 요구사항에 이미 정의되어 있다. 프레임워크, DB 자료형, connection pool과 배포 방식은 후속 NFR 및 Infrastructure Design에서 다룬다.

## 생성 체크리스트

- [x] `business-logic-model.md`에 P0 흐름, 입력·변환·출력과 실패 흐름을 작성한다.
- [x] `domain-entities.md`에 Image, Measurement, Export Snapshot과 검증 근거의 속성·관계를 작성한다.
- [x] `business-rules.md`에 등록, 좌표·계산, 저장·복원, 요약, ZIP과 데모 초기화 규칙을 작성한다.
- [x] `frontend-components.md`에 화면 구조, 상태, 사용자 상호작용, 검증과 API 연결을 작성한다.
- [x] US-01~US-07과 P0 요구사항의 설계 추적성을 검증한다.
- [x] P1, 인증, 자동 측정, 앱 내 AI 호출과 다중 호스트 저장소가 유입되지 않았는지 검증한다.
- [x] Markdown, 표, 코드 표현, 경로와 체크박스를 검증한다.
- [x] `aidlc-state.md`와 `audit.md`를 갱신하고 Functional Design 검토 게이트를 연다.

## 확장 규칙 적용 상태

- **Resiliency Baseline**: N/A — 비활성화됨.
- **Security Baseline**: N/A — 비활성화됨.
- **Property-Based Testing**: N/A — 비활성화됨.
