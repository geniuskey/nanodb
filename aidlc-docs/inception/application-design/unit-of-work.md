# NANoDB Units of Work

## 분해 결정

3일 해커톤 범위를 두 작업 단위로 나눈다. NANoDB Core는 하나의 모듈형 애플리케이션으로 유지하고, Evidence Site만 별도의 정적 빌드 단위로 둔다. Core 내부 컴포넌트를 microservice로 분리하지 않는다.

## Unit 1: NANoDB Core

### 목적

로컬 데모 사용자가 이미지 등록부터 측정, 복원, 개발 컨텍스트 내보내기와 외부 AI 검증 준비까지 수행할 수 있는 실행 가능한 앱을 제공한다.

### 소유 책임

- 데모 데이터 사전점검과 안전한 초기화
- 홈, 이미지 등록·목록·상세 Web UI
- Application API와 입력·오류 응답
- Image, Measurement, Summary와 Context Export 서비스
- PostgreSQL schema, migration과 repository
- 단일 앱 호스트의 로컬 이미지 file store
- 원본 좌표 기반 두 점 측정 계산·저장·복원
- `context.md`, `data.json`, `task.md`, `checks.json` ZIP 생성
- 외부 AI 생성 코드 검증에 필요한 입력·결과 보존 절차

### 경계

- 앱이 외부 AI에 자동 전송하거나 생성 코드를 실행하지 않는다.
- 이미지 바이너리는 PostgreSQL에 넣지 않고 로컬 file store에 둔다.
- UI가 PostgreSQL이나 파일 경로를 직접 다루지 않는다.
- 인증, 역할별 권한, P1, 자동 측정과 다중 호스트 저장소를 포함하지 않는다.

### 할당 이야기

US-01부터 US-07까지를 소유한다.

## Unit 2: Evidence Site

### 목적

해커톤 평가자가 문제, 실제 기능, AI-DLC 근거, 검증 상태와 한계를 최대 두 페이지에서 확인할 수 있는 VitePress 정적 사이트를 제공한다.

### 소유 책임

- 소개와 검증 근거 페이지
- 여섯 심사 항목과 실제 산출물의 연결
- 구현, 외부 AI 데모와 게시 상태의 구분
- GitHub Pages와 동일한 정적 build 및 local preview
- 공개 금지 정보와 내부 감사 원문 제외

### 경계

- 실행 중인 Core 앱과 런타임 통신하지 않는다.
- 승인된 비민감 검증 근거만 빌드 입력으로 사용한다.
- localhost 앱 링크를 공개 기능처럼 제공하지 않는다.

### 할당 이야기

US-08을 소유한다.

## Greenfield 코드 구성 전략

단일 저장소 안에서 다음 경계를 유지한다. 구체 프레임워크와 최종 경로는 각 단위의 NFR 및 Code Generation 계획에서 확정한다.

| 영역 | 구성 전략 |
| --- | --- |
| NANoDB Core | workspace root의 `src/`, `tests/`, database migration과 runtime config 영역을 사용한다. 내부 모듈은 UI, API, domain/service와 persistence 경계를 유지한다. |
| Evidence Site | workspace root의 독립된 VitePress 디렉터리를 사용하며 Core runtime source와 섞지 않는다. |
| AI-DLC 문서 | `aidlc-docs/`에만 저장하며 애플리케이션 코드와 섞지 않는다. |
| 검증 근거 | 민감 원본과 분리된 전용 경로를 사용하고 Evidence Site에는 공개 승인된 결과만 반영한다. |

## 구현 순서

1. NANoDB Core의 계측 기반인 US-01부터 US-05까지 구현·검증한다.
2. NANoDB Core의 개발 지원 흐름인 US-06과 US-07을 구현·검증한다.
3. 실제 검증 상태를 사용해 Evidence Site의 US-08을 구현한다.

두 단위의 구현이 끝난 뒤 전체 Build and Test에서 앱, ZIP 계약과 정적 사이트를 함께 검증한다.
