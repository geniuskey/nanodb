# Evidence Site Code Generation 요약 (US-08)

해커톤 평가용 VitePress 정적 근거 사이트를 생성했다. Core runtime과 분리된 독립 프로젝트로,
실행 중 Core 앱과 통신하지 않고 승인된 비민감 근거·시연 스크린샷만 build-time 정적 입력으로
소비한다. 확인 기준: working tree `19b2af6`, 시각 2026-09-08.

## 생성·수정 파일

| 파일 | 역할 |
| --- | --- |
| `docs/package.json`, `docs/package-lock.json` | 독립 VitePress 프로젝트, VitePress 1.6.3 exact 고정, dev/build/preview 각 1개 script |
| `docs/.vitepress/config.mts` | 기본 테마, production base `/nanodb_mvp/`, 소개·근거 2페이지 nav, dead link 검사 on |
| `docs/index.md` | 소개: 문제·목적·실제 기능·Image→Measurement→Development Context 흐름·외부 AI 데모·한계·2~3분 읽기 순서 |
| `docs/evidence.md` | 근거: 40/60 배점, AI 6개 항목(25/20/15/15/15/10)↔산출물↔상태, 실행법, 3일 일정, 8.4절 비교, 상태 구분, 게시 안전 |
| `docs/public/screenshots/*.png` | 사이트 자체 포함용 스크린샷 사본(원본은 루트 `screenshots/`) |
| `screenshots/*.png` | native 실행 + Playwright 자동 캡처 시연 화면 5장 |
| `scripts/capture_screenshots.mjs` | 스크린샷 캡처 스크립트(오프라인 보조, 앱 자동 연결 아님) |
| `.github/workflows/deploy-evidence-site.yml` | GitHub Pages 배포 workflow(build 성공 후 배포, 최소 권한, 단일 배포) |
| `.nvmrc` | Node 22.17.1 고정(로컬·CI 일치) |
| `README.md` | 시연 화면 절, Evidence Site 사용·배포·게시 안전 절 추가 |
| `.gitignore` | `docs/.vitepress/cache/`, `docs/.vitepress/dist/` 무시 |

## 스크린샷 캡처 방법

이 환경에 Docker daemon·사전 설치 PostgreSQL이 없어, 로컬 Homebrew `postgresql@16`을 격리
클러스터로 initdb·기동하고 `alembic upgrade head` + `NANODB_PROFILE=demo` 적재 후 native
uvicorn으로 Core 앱을 실행, Playwright chromium으로 홈·목록·등록·측정 draft·저장 후 화면을
`screenshots/`에 캡처했다. 캡처 후 앱·DB를 정리했고 source sample(`data/samples/`, 12 entries)은
불변임을 확인했다(0 warnings). 캡처는 승인 demo 데이터만 사용하며 비밀정보·비공개 자료를
포함하지 않는다.

## 로컬 build·게시 안전 점검 결과

- `npm run docs:build`: **성공**(vitepress 1.6.3, `ignoreDeadLinks: false` → dead link 없음).
- `npm run docs:preview`(port 4567): `/nanodb_mvp/` 200, `/nanodb_mvp/evidence.html` 200,
  `/nanodb_mvp/screenshots/01-home.png` 200.
- base `/nanodb_mvp/`가 자산·내부 링크에 적용됨(dist HTML 확인).
- 실제 localhost 하이퍼링크 없음(게시 안전 원칙 문장 텍스트만 존재), secret 문자열 없음,
  스크린샷은 demo 데이터만.

## 요구사항 Traceability

| 요구사항 | 반영 위치 |
| --- | --- |
| DOC-001 정적 사이트 | `docs/` VitePress 프로젝트 |
| DOC-002 두 페이지 구성 | `docs/index.md`, `docs/evidence.md` |
| DOC-003 기본 테마·nav | `docs/.vitepress/config.mts` |
| DOC-004 로컬 build·preview | Step 9 검증 결과 |
| DOC-005 dependency lock | `docs/package-lock.json`, VitePress 1.6.3 고정 |
| DOC-006 배포 workflow | `.github/workflows/deploy-evidence-site.yml` |
| DOC-007 최소 권한 배포 | workflow `permissions` 3종 |
| DOC-008 build 성공 후 배포 | `deploy` job `needs: build` |
| DOC-009 Node 고정 | `.nvmrc` 22.17.1 |
| DOC-010 게시 안전 원칙 | evidence.md 게시 안전 절, README |
| DOC-011 base·자산 동작 | base `/nanodb_mvp/`, preview 200 |
| DOC-012 관리자 설정 절차 | README GitHub Pages 배포 절 |
| DOC-013 스크린샷↔README 정합·상태 구분 | README 시연 화면 절, evidence.md 상태 구분 |
| EVL-001 공식 배점 반영 | evidence.md 40/60 + 6항목(25/20/15/15/15/10) |
| EVL-002 근거별 ID·위치·버전·시각·상태 | evidence.md 각 항목 |
| EVL-003 6개 심사 항목 연결 | evidence.md §1~6 |
| EVL-004 실제 기능·흐름 | index.md 실제 기능·흐름 |
| EVL-005 게시 안전·비밀 미포함 | Step 9 점검, 게시 안전 절 |
| EVL-006 3일 일정·독립 개발 전제 | evidence.md 해당 절 |
| EVL-007 구현/데모/게시 상태 구분 | evidence.md 상태 구분 표 |
| EVL-008 8.4 수작업 대비 비교(무보장) | evidence.md 8.4절 |

## 알려진 제한

- `npm audit`가 VitePress build-time 의존성에서 취약점 3건(moderate 2, high 1)을 보고한다.
  고정 toolchain(1.6.3) 유지를 위해 이번 사이클에서는 강제 수정하지 않고 기록만 한다. 사이트는
  정적 build 산출물만 배포하며 런타임 서버 코드가 아니다.
- 실제 GitHub Pages 배포와 workflow 실행은 관리자 Pages Source 설정 + `main` push 후 판정
  (현재 `게시 상태` 미배포).
- Core의 PostgreSQL integration test·브라우저 e2e CI·컨테이너 스택은 별도 환경에서 `미검증`.
- 스크린샷은 루트 `screenshots/`와 `docs/public/screenshots/`에 동일 사본으로 존재한다
  (사이트 자체 포함 목적, 단일 캡처 출처).

## US-08 완료 상태

최대 두 페이지 정적 평가 자료, 6개 심사 항목↔산출물↔상태 연결, 시연 스크린샷과 README 정합,
비공개 정보 제외, 로컬 preview 가능, 구현/외부 AI 데모/게시 상태 구분이 모두 생성됐다. 실제
배포 실행은 게시 단계에서 별도 판정한다.
