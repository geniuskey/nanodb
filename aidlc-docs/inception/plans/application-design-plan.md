# Application Design 계획

## 설계 원칙

- 3일 해커톤에 맞춰 NANoDB Core는 하나의 모듈형 로컬 애플리케이션으로 둔다.
- VitePress Evidence Site는 앱 런타임과 분리한다.
- 앱 내부 AI 호출과 다른 네 프로젝트의 통합은 설계하지 않는다.
- 데이터베이스는 PostgreSQL을 사용하고 이미지 파일은 단일 앱 호스트의 로컬 디렉터리에 유지한다.

## 질문 평가

승인된 요구사항과 실행 계획에 컴포넌트 경계, 저장 방식, 외부 AI 경계와 문서 사이트 분리가 명시되어 있어 이 단계의 추가 질문은 필요하지 않다. 기술 스택 세부 선택은 NFR Requirements에서 다룬다.

## 실행 체크리스트

- [x] 요구사항, 사용자 이야기와 실행 계획을 분석한다.
- [x] 컴포넌트와 책임을 정의한다.
- [x] 컴포넌트의 고수준 메서드와 입출력을 정의한다.
- [x] 서비스 오케스트레이션을 정의한다.
- [x] 컴포넌트 의존성과 통신 방식을 정의한다.
- [x] `components.md`를 생성한다.
- [x] `component-methods.md`를 생성한다.
- [x] `services.md`를 생성한다.
- [x] `component-dependency.md`를 생성한다.
- [x] `component-diagram.md`를 생성한다.
- [x] `application-design.md`로 설계를 요약한다.
- [x] Mermaid, Markdown, 링크와 설계 일관성을 검증한다.
- [x] 상태와 감사 기록을 갱신한다.
