# NANoDB Core NFR Requirements 계획

## 목적

3일 해커톤 구현을 우선하면서 PostgreSQL 기반 초기 사내 beta로 이어갈 수 있도록 성능, 확장성, 가용성, 보안, 신뢰성, 유지보수성, 사용성과 기술 스택의 최소 기준을 확정한다.

## 계획 진행 상태

- [x] 승인된 Functional Design과 기존 NFR 요구사항을 읽는다.
- [x] Scalability, Performance, Availability, Security, Tech Stack, Reliability, Maintainability와 Usability를 평가한다.
- [x] 해커톤과 초기 beta의 검증 수준을 분리한다.
- [x] 추가 사용자 질문이 필요하지 않음을 확인한다.

## 질문 평가

추가 질문은 만들지 않는다. 해커톤은 단일 instance·100건 이하·2초 목표, beta는 약 1,000명 등록 사용자 목표이지만 concurrency 보장은 하지 않는다는 경계가 승인됐다. 기존 Python sample utilities와 VitePress 계획을 활용하고 일반적인 팀 유지보수성을 확보하기 위해 아래 기술 조합을 자율 결정한다. exact version은 Code Generation에서 호환 조합으로 lock하고 build/test로 검증한다.

## 생성 체크리스트

- [x] `nfr-requirements.md`에 해커톤 기준과 beta 전환 조건을 구분해 작성한다.
- [x] `tech-stack-decisions.md`에 frontend, backend, PostgreSQL, migration, test와 local 실행 도구를 확정한다.
- [x] 성능·확장성·가용성·보안·신뢰성·유지보수성·사용성 항목의 누락을 검증한다.
- [x] 1,000명 목표가 concurrency 또는 고가용성 보장으로 표현되지 않았는지 검증한다.
- [x] disabled extension을 다시 활성화하거나 P1·인증 구현 범위를 추가하지 않았는지 검증한다.
- [x] Markdown, 표, 코드 표현, 경로와 체크박스를 검증한다.
- [x] `aidlc-state.md`와 `audit.md`를 갱신하고 NFR Requirements 검토 게이트를 연다.

## 확장 규칙 적용 상태

- **Resiliency Baseline**: N/A — 비활성화됨.
- **Security Baseline**: N/A — 비활성화됨. 일반적인 입력·비밀정보·경로 보호는 기존 요구사항으로 유지한다.
- **Property-Based Testing**: N/A — 비활성화됨.
