# Evidence Site Code Generation 계획

## 문서 목적과 권한 경계

이 문서는 Evidence Site(US-08) Code Generation의 단일 실행 기준이다. 사용자 승인 전에는
생성 단계를 실행하지 않는다. 승인 후에는 번호 순서대로 한 단계씩 수행하고, 각 단계가 끝난
같은 상호작용에서 해당 체크박스를 `[x]`로 바꾼다.

- **작업 단위**: Evidence Site
- **할당 이야기**: US-08
- **관련 요구사항**: DOC-001~013, EVL-001~008
- **Workspace root**: `/Users/edwin/git/nanodb_mvp`
- **Application code(정적 사이트)**: workspace root의 `docs/`(VitePress). Core runtime
  source(`src/`, `alembic/`)와 섞지 않는다.
- **시연 스크린샷**: workspace root의 `screenshots/`.
- **CI**: `.github/workflows/`의 Pages 배포 workflow.
- **AI-DLC Markdown 요약**: `aidlc-docs/construction/evidence-site/code/`에만 생성한다.
- **제외**: 실행 중 Core 앱과의 런타임 통신, 원본 이미지·비밀정보·내부 audit 원문 게시,
  공개 사이트에서 localhost 앱 링크, 투표·평점 수집, P1과 장기 로드맵, **Core용 별도 CI
  workflow**(이번 사이클 범위에서 사용자가 제외).

## 심사기준 업데이트 (사용자 제공, 2026-09-08)

EVL-001 가정을 다음 공식 기준으로 갱신한다. 근거 페이지는 이 기준을 그대로 반영한다.

- **전체 배점**: AI 평가 40% + 참가자 평가 60%.
- **AI 평가 세부(100점 만점, 사용자 결정으로 이전 세부 배점 유지)**:

| AI 심사 항목 | 비중(AI 40% 내) | 핵심 관점 |
| --- | --- | --- |
| AI-DLC | 25% | 문서량이 아니라 AI 작업이 실제 결과를 만든 증거; 단계 산출물의 연결과 앞 단계 결정의 반영; 도구 종류는 무관 |
| 문제 정의 및 해결 | 20% | "누구의 어떤 문제를 어떻게 푸는가"의 전달; 불편의 빈도·시점과 대상 사용자의 구체성; 시장성은 제외 |
| 창의성 | 15% | 기존 도구와의 구조적 차별점이 코드·설계로 확인; 주장만으로는 없음; 흔한 분야라도 구조가 다르면 인정 |
| 완성도 | 15% | 코드로 실제 동작; 시연 스크린샷 필수; 빌드·실행(의존성·진입점·락파일·CI), 에러 핸들링·전역 핸들러, 진입점→구현 완결성, 스크린샷↔README 정합, 핵심 경로 stub/TODO 없음 |
| 사용성 | 15% | 처음 보는 사람이 막힘 없이 시작·다음 행동 인지; 시작 경로, 사용 매뉴얼, UI 직관성, 인터랙션 피드백(로딩·성공·오류·빈 상태), 핵심 시나리오 완결 |
| 유지보수성 및 보안 | 10% | 후속 개발자 인계; 코드 구조·모듈화·설정 분리, 시크릿 관리, 인증·인가·입력 검증, 로깅·관측(해커톤 수준 감안) |

점수 보장·자체 추정 점수는 표시하지 않고, 항목별로 실제 산출물과 상태만 연결한다.

## Unit Context

### 목적과 경계

Evidence Site는 해커톤 평가자가 문제·실제 기능·AI-DLC 근거·검증 상태·한계를 최대 두
페이지에서 확인할 수 있는 VitePress 정적 사이트다. Core의 승인된 비민감 검증 근거와
시연 스크린샷만 build-time 정적 입력으로 소비하고, 실행 중 Core 앱과 통신하지 않는다.
GitHub Pages와 동일 build의 local preview로 열 수 있어야 한다.

### 시연 스크린샷 확보(사용자 결정: 네이티브 실행·자동 캡처)

이 환경은 Docker daemon과 사전 설치된 PostgreSQL이 없다. 따라서 로컬 PostgreSQL 16을
설치·기동하고 Core 앱을 native로 실행한 뒤 Playwright로 실제 화면을 자동 캡처해
`screenshots/`에 저장한다. 캡처는 승인된 demo 데이터만 사용하며 비밀정보·비공개 자료를
포함하지 않는다. source sample(`data/samples/`)은 변경하지 않는다.

### 선행 의존성과 정직성 원칙

- Core(US-01~US-07)의 실제 상태에만 의존한다. 확인된 상태를 과장하지 않고 반영한다
  (EVL-002, EVL-007, DOC-013):
  - Unit·정적 게이트 green: backend pytest 57 passed / 7 skipped, frontend Vitest 23
    passed, frontend build·tsc·mypy·ruff·demo preflight 통과.
  - 이번 native 실행으로 실제 동작 화면과 흐름을 스크린샷으로 확보(완성도·사용성 증거).
  - **미검증(unverified)**: PostgreSQL integration test와 브라우저 e2e의 CI 자동 실행,
    컨테이너 이미지 build와 Compose 스택은 별도 환경에서 판정. 정직하게 표기한다.
- 각 근거는 요구사항 ID·산출물 위치·확인한 commit 또는 작업본 버전·확인 시각·pass/fail/
  unverified 상태를 함께 제시한다(EVL-002).
- 구현 완료, 외부 AI 데모 실행, 게시 상태를 각각 구분한다(DOC-013, EVL-007).

### 소유 산출물

| 소유 대상 | 위치 | 핵심 계약 |
| --- | --- | --- |
| VitePress 프로젝트 | `docs/package.json`, `docs/package-lock.json` | 독립 dependency 그래프, lockfile 고정, dev/build/preview 각 1개 명령 |
| 사이트 설정·테마 | `docs/.vitepress/config.*` | 기본 테마, production base `/nanodb_mvp/`, 두 페이지 nav |
| 시연 스크린샷 | `screenshots/` | native 실행 실제 화면; demo 데이터만; 비밀정보 없음 |
| 소개 페이지 | `docs/index.md` | 이유·문제·목적·실제 features·Image→Measurement→Development Context 흐름·외부 AI 데모 안내·한계 |
| 근거 페이지 | `docs/evidence.md` | 6개 항목별 근거·상태·산출물·commit·시각·실행 방법·독립 개발 전제·3일 일정 |
| 배포 workflow | `.github/workflows/` | main push·수동 실행, build 성공 후에만 Pages 배포, 최소 권한, 단일 배포 |
| Node 버전 고정 | `.nvmrc` | 로컬과 CI 동일 Node LTS |

## Toolchain과 Version 기준

| 영역 | 계획 기준 |
| --- | --- |
| Node.js | 22.17.1 LTS, `.nvmrc`로 고정하고 CI와 일치 (Core frontend와 동일) |
| 정적 사이트 생성기 | VitePress 1.x 최신 stable(계획 baseline 1.6.3); `docs/package-lock.json`로 exact 고정 |
| 테마 | VitePress 기본 테마 |
| 스크린샷 캡처 | 로컬 PostgreSQL 16(Homebrew `postgresql@16`), native uvicorn 실행, Playwright 1.63.0 chromium(설치 확인됨) |
| 배포 | GitHub Actions → GitHub Pages(`github-pages` environment) |

버전은 계획 작성 시 확인한 기준이다. 실제 scaffold에서 호환이 실패하면 범위를 바꾸지 않는
최소 호환 patch만 적용하고 계획 변경과 근거를 먼저 기록한다.

## 실행 계획

### Step 1. VitePress 프로젝트 scaffold와 dependency lock 생성 — US-08 (DOC-001,003,004,005,009)

- [x] `docs/`에 독립 VitePress 프로젝트를 만든다: `docs/package.json`(devDependency로 고정
  버전 VitePress, `docs:dev`/`docs:build`/`docs:preview` 각 1개 script), `docs/package-lock.json`,
  루트 `.nvmrc`(22.17.1). `.gitignore`에 `docs/.vitepress/cache`와 `docs/.vitepress/dist`,
  `screenshots/`의 임시 산출물 규칙을 정리한다. Core frontend 루트 `package.json`과 섞지 않는다.

### Step 2. 사이트 설정과 기본 테마 구성 — US-08 (DOC-001,002,003,013)

- [x] `docs/.vitepress/config.*`에 사이트 title, production base `/nanodb_mvp/`, 두 페이지
  (소개·근거) nav, 저장소 link를 설정한다. 기본 테마만 사용한다. 로컬 preview에서도 자산·
  내부 링크가 동작하도록 base를 검증 가능한 형태로 둔다.

### Step 3. 로컬 PostgreSQL 기동·네이티브 실행·Playwright 시연 스크린샷 캡처 — US-08 (완성도·사용성 증거; EVL-005)

- [x] Homebrew `postgresql@16`을 설치·기동하고 전용 로컬 DB와 `DATABASE_URL`을 구성한다.
  `alembic upgrade head`로 migration을 적용하고 `NANODB_PROFILE=demo`로 승인된 demo 데이터를
  적재한다(source sample 불변). native uvicorn으로 Core 앱을 기동한 뒤 Playwright chromium으로
  홈, 이미지 목록, 이미지 등록, 측정 뷰어(두 점 overlay·값), context export 흐름의 실제 화면을
  `screenshots/`에 PNG로 자동 캡처한다. 캡처 스크립트와 캡처 시각·commit을 기록하고, 종료 후
  로컬 앱·DB를 정리한다. 비밀정보·비공개 자료는 캡처에 포함하지 않는다.

### Step 4. README ↔ 스크린샷 정합 — US-08 (완성도 정합·사용성; DOC-013)

- [x] 루트 `README.md`에 `screenshots/`의 시연 화면을 참조·embed하고 각 화면이 README의
  실제 기능(등록·측정·복원·context export)과 일치하도록 캡션·순서를 맞춘다. 캡처 버전·시각을
  표기하고 로컬 앱을 공개 기능처럼 표현하지 않는다.

### Step 5. 소개 페이지 생성 — US-08 (DOC-002,010,013; EVL-004,008)

- [x] `docs/index.md`에 만들어진 이유·대상 문제·목적, 실제 features, Image → Measurement →
  Development Context 흐름, 외부 AI 개발 검증 데모 안내, 한계, 2~3분 읽기 순서(문제 → 목적 →
  실제 기능 → 근거)를 작성한다. 대회 주제·취지와 도메인 관련성은 공식 배점이 아님을 명시한다.
  대표 시연 스크린샷을 승인 자산으로 인용한다. 원본 이미지·비밀정보는 넣지 않는다.

### Step 6. 근거 페이지 생성 — US-08 (DOC-002,010,013; EVL-001~008)

- [x] `docs/evidence.md`에 전체 배점(AI 40% + 참가자 60%)과 AI 6개 항목(25/20/15/15/15/10)을
  명시하고, 각 항목을 실제 산출물·스크린샷·상태(pass/fail/unverified)로 연결한다. 각 근거에
  요구사항 ID·산출물 위치·확인 commit 또는 작업본 버전·확인 시각을 붙인다. Core의 미실행
  (integration/e2e CI·container)은 `미검증`으로 정직하게 표기한다. 실행 방법, 독립 개발 전제와
  3일 일정 요약, 8.4절 수작업 대비 컨텍스트 비교(준비 시간·추가 요청 수·통과 수, 향상·토큰
  절감 미보장), 구현 완료/외부 AI 데모 실행/게시 상태 구분을 포함한다. 점수 보장·자체 추정
  점수와 내부 audit 원문은 넣지 않는다.

### Step 7. GitHub Actions Pages 배포 workflow 생성 — US-08 (DOC-006,007,008,011)

- [x] `.github/workflows/`에 `main` push와 수동 실행(`workflow_dispatch`)을 지원하는 Pages
  배포 workflow를 생성한다. `.nvmrc` Node로 `docs`를 설치·build하고 build 성공 후에만 Pages
  artifact를 배포한다. 최소 권한 `contents: read`, `pages: write`, `id-token: write`,
  `github-pages` environment, 동시 배포 1개·실행 중 배포 미취소(concurrency)를 설정한다.
  실제 Pages 배포는 `main`에서만 실행한다.

### Step 8. 관리자 설정과 게시 안전 문서화 — US-08 (DOC-010,012,013)

- [x] Pages Source를 `GitHub Actions`로 설정하는 관리자 절차, 캡처 버전·시각 표기 원칙,
  공개 사이트에서 localhost 앱으로 연결하지 않음, 비밀정보·비공개 자료 미포함 확인을
  근거 페이지 또는 전용 섹션과 루트 `README.md`에 기록한다.

### Step 9. 로컬 build 검증과 게시 안전 점검 — US-08 (DOC-004,011; EVL-005)

- [x] `docs:build`로 사이트를 build하고 `docs:preview`로 결과를 확인한다. base·내부 링크
  동작, 두 페이지 렌더링, 스크린샷 표시, 원본 이미지·비밀정보·비공개 자료 미포함을 점검한다.
  실제 결과와 확인 시각을 기록한다.

### Step 10. Evidence Site 요약과 review gate — US-08 (DOC/EVL 전체)

- [x] `aidlc-docs/construction/evidence-site/code/evidence-site-summary.md`에 생성 파일,
  DOC-001~013·EVL-001~008 traceability, 배포 절차, 스크린샷 캡처 방법, 알려진 제한과 US-08
  완료 상태를 기록하고 Code Generation review gate를 연다.

## Story 완료 추적

- [x] **US-08** — 최대 두 페이지 정적 평가 자료, 6개 심사 항목↔산출물↔상태 연결, 시연
  스크린샷과 README 정합, 비공개 정보 제외, 로컬 preview 가능, 구현·외부 AI 데모·게시 상태
  구분이 생성됐다.

각 story는 구현과 해당 문서가 모두 생성됐을 때만 `[x]`로 바꾼다. 실제 build·게시 실행 결과는
Build and Test/게시 단계에서 별도로 판정한다.

## 예상 범위

- **총 실행 단계**: 10개
- **Application 영역**: `docs/` VitePress 정적 사이트(설정·두 페이지), `screenshots/` 시연
  캡처, `.github/workflows/` Pages 배포, `.nvmrc`
- **문서 영역**: Evidence Site code summary와 traceability, README 스크린샷·게시 절차
- **검증 영역**: 로컬 build·preview와 게시 안전 점검(실행은 Build and Test에서 판정)

## 확장 규칙 적용 상태

- **Resiliency Baseline**: N/A — 비활성.
- **Security Baseline**: N/A — 비활성. 비밀정보·비공개 자료 미게시와 최소 권한 배포 경계는
  일반 요구사항(DOC-010, DOC-007, EVL-005)으로 유지한다.
- **Property-Based Testing**: N/A — 비활성. 정적 사이트로 example-based 검증만 사용한다.
