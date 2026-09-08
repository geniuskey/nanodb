# NANoDB Application Design

## 결정

NANoDB Core는 3일 해커톤에 맞춘 **모듈형 애플리케이션**으로 설계한다. Web UI와 Application API 뒤에 Image, Measurement, Summary, Context Export 서비스를 두고 PostgreSQL과 단일 앱 호스트의 로컬 파일 저장소를 사용한다. Evidence Site는 별도 정적 산출물로 유지한다.

## 핵심 경계

- UI는 저장소를 직접 다루지 않고 Application API만 호출한다.
- 측정값은 서버가 원본 좌표와 보정값으로 계산·검증한다.
- 원본 이미지와 측정 파생 데이터를 분리한다.
- ZIP 생성은 앱 안에서 수행하지만 외부 AI 전달과 코드 실행은 사용자 수동 활동이다.
- 평가 사이트는 실행 중 앱이나 내부 감사 로그에 의존하지 않는다.
- 인증, 자동 측정, 앱 내 AI 호출, P1과 다른 프로젝트 통합은 포함하지 않는다.
- PostgreSQL 연결정보는 환경 설정으로 분리하고 스키마는 migration으로 관리한다.
- 약 1,000명의 초기 베타 등록 사용자는 목표이며 실제 동시성은 후속 부하 검증으로 확인한다.

## 산출물 안내

- [Components](components.md)
- [Component Methods](component-methods.md)
- [Services](services.md)
- [Component Dependencies](component-dependency.md)
- [Component Diagram](component-diagram.md)

## 후속 설계로 넘기는 항목

- 기술 스택과 실행 버전: NFR Requirements
- 좌표 계산·반올림·ZIP 상세 규칙: Functional Design
- PostgreSQL·업로드 경로와 Pages workflow: Infrastructure Design
- 정확한 단위와 구현 순서: Units Generation

## 확장 규칙 적용 상태

- **Resiliency Baseline**: N/A — 비활성화됨.
- **Security Baseline**: N/A — 비활성화됨. 승인된 일반 입력·경로·공개 경계는 유지한다.
- **Property-Based Testing**: N/A — 비활성화됨.
