# 심사 근거

이 페이지는 심사 항목을 NANoDB의 **실제 산출물·상태**에 연결합니다. 점수 보장이나 자체
추정 점수는 표시하지 않고, 각 근거에 요구사항·산출물 위치·확인한 working tree 버전·확인 시각·
`pass`/`fail`/`unverified` 상태를 함께 제시합니다.

> [!TIP] 코드베이스를 이어받는 개발자라면
> 유지보수성 항목의 근거를 실제 소스 구조와 함께 보려면 **[개발자 가이드](/guide/)** 를 참고하세요.
> 아키텍처·데이터 모델·API·확장 방법을 코드에 근거해 정리해 두었습니다.

- **확인 기준 시각**: 2026-09-08
- **확인 working tree**: `19b2af6` (Evidence Site 생성 직전 Core 상태)
- **상태 어휘**: `pass`(이 저장소에서 실행·확인), `unverified`(별도 환경에서 판정 필요, 미실행),
  `fail`(실패). 과장 없이 확인된 것만 `pass`로 적습니다.

## 전체 배점

| 구분 | 비중 |
| --- | ---: |
| AI 평가 | 40% |
| 참가자 평가 | 60% |

이 페이지는 AI 평가 40% 안의 6개 항목을 다룹니다. 참가자 평가는 대회 운영 영역입니다.

### AI 평가 세부 (100점 만점)

| AI 심사 항목 | 비중 | 이 저장소의 근거 요약 | 상태 |
| --- | ---: | --- | --- |
| AI-DLC | 25% | `aidlc-docs/`의 단계 산출물이 서로 이어지고 앞 단계 결정이 반영됨 | pass |
| 문제 정의 및 해결 | 20% | 대상 사용자·반복 불편·해결 방식이 소개와 요구사항에 명시 | pass |
| 창의성 | 15% | 컨텍스트 내보내기의 구조적 차별점이 코드로 존재 | pass |
| 완성도 | 15% | 코드 동작·시연 스크린샷·빌드/락파일/CI·에러 핸들링 (일부 unverified) | 부분 |
| 사용성 | 15% | 시작 경로·매뉴얼·인터랙션 피드백·핵심 시나리오 완결 | pass |
| 유지보수성 및 보안 | 10% | 모듈 구조·설정 분리·시크릿 관리·입력 검증·로깅 | pass |

## 1. AI-DLC (25%)

AI-DLC v1.0.1 워크플로우로 INCEPTION → CONSTRUCTION을 단계별로 수행하고, 각 단계 산출물이
다음 단계에 반영됐습니다. 문서량이 아니라 AI 작업이 실제 결과(동작 코드)를 만든 연결을 봅니다.

- **산출물**: `aidlc-docs/inception/`(요구사항·user story·application design),
  `aidlc-docs/construction/`(functional/NFR/infra design, code summaries, build-and-test),
  `aidlc-docs/aidlc-state.md`(진행 상태), `aidlc-docs/audit.md`(전체 상호작용 감사 로그).
- **연결 예**: 요구사항 → user story → 코드 생성 계획(`construction/plans/`) → 실제 코드
  (`src/`) → 계층별 테스트(`tests/`)까지 traceability가 이어집니다.
- **상태**: `pass` (문서·코드·테스트가 저장소에 존재하고 상호 참조됨, 확인 `19b2af6`).

> 내부 audit 원문은 게시하지 않습니다. 근거는 저장소 문서 위치로 대신합니다.

## 2. 문제 정의 및 해결 (20%)

"누구의 어떤 불편을, 얼마나 자주, 어떻게 푸는가"를 구체적으로 전달합니다. 시장성은 평가
대상이 아닙니다.

- **대상·불편**: 계측 이미지에서 CD/Depth/Thickness를 재고 분석 코드를 만드는 현업 엔지니어.
  담당자·도구가 바뀔 때, 새 이미지를 받을 때, 분석 코드를 새로 만들 때 맥락(좌표계·단위·규칙)이
  흩어져 반복 재해석이 발생.
- **해결**: 이미지·측정을 축적하고 좌표계·단위·계산 규칙을 포함한 개발 컨텍스트로 내보내
  재사용.
- **산출물**: [소개](/index) 문제·목적 절, `requirements/nanodb-mvp-requirements.md`,
  `requirements/home-tab-requirements.md`, `requirements/constraints.md`.
- **상태**: `pass`.

## 3. 창의성 (15%)

기존 이미지 뷰어/DB와의 구조적 차별점이 주장이 아니라 **코드·설계**로 확인됩니다.

- **차별점**: 측정 결과를 좌표계·단위·계산 규칙·검증 정답과 함께 고정 스키마 ZIP으로
  내보내, 외부 AI 개발 도구가 사람의 반복 설명 없이 소비하도록 설계.
- **산출물**: 컨텍스트 내보내기 구현과 계약
  (`GET /api/images/{id}/context-export`, 4파일 ZIP: `context.md`/`data.json`/`task.md`/
  `checks.json`, `schema_version 3.1` — 저장 측정과 각 측정의 라벨·메모를 함께 포함),
  `aidlc-docs/construction/nanodb-core/code/api-reference.md`,
  외부 검증 자산 `validation/external-ai/`.
- **상태**: `pass` (엔드포인트·스키마·검증 자산 존재).

## 4. 완성도 (15%)

코드로 실제 동작하고, 시연 스크린샷·빌드 가능성·에러 핸들링·완결성을 확인합니다.

- **동작 화면(시연 스크린샷)**: 로컬 native 실행 + 승인 demo 데이터 + Playwright 자동 캡처.
  캡처 스크립트 `scripts/capture_screenshots.mjs`, 결과 `screenshots/`(및 사이트용 사본
  `docs/public/screenshots/`).

  ![자동 특징 추출 결과: 자동 측정값 overlay와 저장 목록(미검증 표기)](/screenshots/05-measurement-saved.png)

- **빌드·실행·락파일**:
  - Backend 의존성·진입점: `pyproject.toml`/`uv.lock`, `nanodb.api.app:app`.
  - Frontend: `package.json`/`package-lock.json`, `vite build` → `dist/frontend`.
  - Evidence site: `docs/package.json`/`docs/package-lock.json`, `.nvmrc`(22.17.1).
  - 컨테이너: `Dockerfile`, `compose.yaml`(db → migrate → app), `Makefile` 진입점.
  - CI: Evidence Site용 GitHub Actions Pages 배포 workflow(`.github/workflows/`).
- **에러 핸들링**: FastAPI 전역 예외 처리와 검증 응답, frontend 로딩·오류·빈 상태 처리
  (세그멘테이션 미실행·측정 없음 빈 상태 안내, 자동 특징 추출 실패·건너뜀 사유 표시).
- **스크린샷 ↔ README 정합**: README 시연 화면 절과 각 화면의 대응 기능을 일치시킴.
- **핵심 경로 stub/TODO 없음**: 등록 → 측정 → 저장·복원 → 내보내기 경로가 구현됨.
- **테스트·정적 게이트(이 저장소에서 실행)**:
  - Backend `pytest`: 로컬 PostgreSQL 16을 기동해 **104 passed / skip 없음** — `pass`
    (`TEST_DATABASE_URL` 미지정 시에는 PostgreSQL integration test가 skip됩니다).
  - Frontend `vitest`: **63 passed** — `pass`.
  - Browser e2e `npm run test:e2e`(Chromium, 실행 중인 앱): **7 passed** — `pass`.
  - Frontend `vite build` / `tsc` / `mypy` / `ruff` / demo `preflight`: **통과** — `pass`.
  - Demo 경로 `make migrate` → `make seed-demo` → `make reset`: **통과** — `pass`
    (원천 샘플 `data/samples/`는 변경되지 않음).
- **검증 완료**: PostgreSQL 통합 테스트(로컬 PostgreSQL 16, skip 없음)와 브라우저
  e2e(`npm run test:e2e`, Chromium)를 실제로 실행해 통과를 확인했습니다.
- **미검증(unverified) — 별도 환경 필요**:
  - 통합 테스트·브라우저 e2e의 CI 자동 실행(로컬 실행은 통과).
  - 컨테이너 이미지 build와 Compose 스택(`make up`/`make demo`) 기동. (Pages 배포는 검증 완료)
  - 재현 절차는 `aidlc-docs/construction/build-and-test/`에 기록. 상태는 정직하게 `미검증`.
- **상태**: 동작·빌드·정적 게이트·스크린샷·통합 테스트·브라우저 e2e는 `pass`, 컨테이너 스택 기동과 CI 자동 실행은 `unverified`.

## 5. 사용성 (15%)

처음 보는 사람이 막힘 없이 시작하고 다음 행동을 인지할 수 있는지 확인합니다.

- **시작 경로**: `README.md` 빠른 시작(clean setup → build → `make up`/`make demo`),
  `.env.example`.
- **사용 매뉴얼·직관성**: 홈 요약·CTA, 최신순 이미지 목록, 등록 폼 미리보기.

  ![홈: 실제 집계와 시작 CTA](/screenshots/01-home.png)

- **인터랙션 피드백**: 로딩·성공·오류·빈 상태 처리, 자동 분석 실행 상태 표시, 저장 후 overlay
  복원, 자동 측정 기준점 보정 preview.

  ![자동 분석: 세그멘테이션 실행 결과와 클래스 통계](/screenshots/04-segmentation.png)

- **핵심 시나리오 완결**: 이미지 등록 → 측정 → 저장·복원 → 컨텍스트 내보내기까지 한 흐름.
- **상태**: `pass`.

## 6. 유지보수성 및 보안 (10%)

후속 개발자가 인계받을 수 있는 구조와 해커톤 수준의 보안을 확인합니다.

- **코드 구조·모듈화**: `src/backend/nanodb/`(api·domain·services·persistence·adapters
  계층 분리), `src/frontend/`, `alembic/` migration, `tests/` 계층 분리.
- **설정 분리**: 환경변수(`.env.example`), `DATABASE_URL`·`NANODB_PROFILE` 등 코드 외부 주입.
- **시크릿 관리**: 키·비밀값을 코드에 하드코딩하지 않음. 런타임 업로드·DB 비밀값·생성 결과는
  Git에 커밋하지 않음(`.gitignore`).
- **입력 검증**: 등록·측정 입력에 대한 서버 측 스키마 검증.
- **로깅·관측**: 애플리케이션 로깅 존재(해커톤 수준). 배포 workflow는 최소 권한
  (`contents: read`, `pages: write`, `id-token: write`)으로 제한.
- **상태**: `pass`.

## 실행 방법 (재현)

```bash
git clone https://github.com/geniuskey/nanodb.git
cd nanodb
cp .env.example .env
make install && make build-frontend
make demo            # 컨테이너 스택 + demo 데이터 (Docker 필요)
# 또는 네이티브: make migrate && make dev  (로컬 PostgreSQL 16 필요)
make test            # backend(pytest) + frontend(vitest)
```

시연 스크린샷 재현은 `scripts/capture_screenshots.mjs`(로컬 native 실행 + Playwright)로
수행합니다. 상세 빌드·테스트 절차와 미검증 항목 재현법은
`aidlc-docs/construction/build-and-test/`를 참고하세요.

## 독립 개발 전제와 3일 일정

- **전제**: 5명이 3일 동안 각자 소속 팀 도구를 **독립** 개발합니다. NANoDB는 그중 한
  프로젝트이며 담당자가 앱·데이터·검증·사용법을 책임집니다.
- **일정 요약**:
  1. Day 1 — 요구사항·범위 확정, 샘플·manifest 검증, application design.
  2. Day 2 — Core 구현(등록·측정·복원·홈 집계)과 계층별 테스트, 컨텍스트 내보내기.
  3. Day 3 — 외부 AI 검증 자산, demo·배포 tooling, Build and Test, Evidence Site.

## 수작업 대비 컨텍스트 비교 (요구사항 8.4)

같은 요약 CSV 생성 과제를 두 방식으로 수행해 비교합니다.

- **방식 A**: 데이터 형식·좌표계·단위를 사람이 수동으로 설명.
- **방식 B**: NANoDB 컨텍스트 ZIP을 그대로 제공.
- **비교 지표**: 자료 준비 시간, 추가 설명·수정 요청 수, 검증 통과 여부(`pass`/`fail`/
  `unverified`)를 **측정값 그대로** 기록.
- **정직성**: 향상이나 토큰 절감을 **미리 주장하지 않습니다**. 실제 비교 실행·기록은 후속
  단계에서 수행하며, 현재는 자산과 절차만 준비된 상태입니다.
- **산출물**: `validation/external-ai/`.

## 상태 구분 요약

혼동을 막기 위해 세 가지를 구분합니다.

| 구분 | 의미 | 현재 |
| --- | --- | --- |
| 구현 완료 | 코드가 저장소에 존재하고 정적/단위 게이트 통과 | US-01~US-07 완료 |
| 외부 AI 데모 실행 | `validation/external-ai/`의 실제 비교 실행·기록 | 자산 준비, 실행 기록은 후속 |
| 게시 상태 | 이 Evidence Site의 GitHub Pages 실제 배포 | `pass` — `main` 머지에서 build·deploy job 모두 성공([run](https://github.com/geniuskey/nanodb/actions/runs/34225740216)) |

## 게시 안전 원칙

- 공개 사이트는 localhost 앱으로 연결하지 않습니다.
- 원본 이미지·비밀정보·내부 audit 원문·비공개 자료를 게시하지 않습니다. 스크린샷은 승인된
  demo 데이터만 사용합니다.
- 배포는 최소 권한으로 제한하고, build 성공 후에만 Pages에 배포합니다.
