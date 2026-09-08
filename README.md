<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo/nanodb_logo_horizontal_dark.png">
    <img src="assets/logo/nanodb_logo_horizontal.png" alt="NANoDB — Nano Assets, Never orphaned Database" width="720">
  </picture>
</p>

<p align="center">
  <strong>NANoDB: Nano Assets, Never orphaned Database.</strong><br>
  <sub>데이터는 쌓이고, 툴은 이어진다.</sub>
</p>

# NANoDB

NANoDB는 반도체 SEM/TEM 이미지와 측정 근거를 축적하고, 이를 AI 기반 분석 소프트웨어 개발에 필요한 컨텍스트와 검증 데이터로 재사용하는 경량 웹 애플리케이션입니다. 이름은 `Nano Assets, Never orphaned Database`에서 왔으며, 데이터와 맥락이 담당자나 도구의 변화 속에서도 흩어지지 않게 하는 것을 지향합니다.

> 현재 저장소에는 MVP 요구사항, AI-DLC 워크플로우, 로고와 검증된 샘플 데이터에 더해 NANoDB Core 웹 애플리케이션(FastAPI backend, React frontend, PostgreSQL 스키마·migration, demo·검증 tooling)과 계층별 테스트가 생성되어 있습니다. backend unit·API·contract test, frontend unit test, lint·typecheck·demo preflight 등 native 환경에서 실행 가능한 게이트는 통과했으며(2026-09-08 기준), PostgreSQL integration test·브라우저 e2e·컨테이너 스택 기동은 Docker/PostgreSQL 환경에서 실행·판정하도록 남겨두었습니다.

## MVP에서 보여줄 것

1. PNG/JPEG/TIFF 이미지를 제조 메타데이터와 함께 등록합니다. TIFF는 원본을 그대로 보존하고 화면 표시용 PNG 파생본을 자동으로 만듭니다.
2. 등록된 이미지를 목록에서 검색어·SEM/TEM 필터로 찾아 다시 엽니다.
3. 이미지 위에서 두 점을 선택하거나 원본 좌표를 직접 입력해 CD, Depth, Thickness를 측정합니다.
4. `nm/pixel` 보정값으로 실제 길이를 계산합니다.
5. 저장된 좌표와 측정값을 새로고침 후에도 같은 위치에 복원합니다.
6. 화살표·원 도형으로 관심 위치를 표시하고 도형마다 제품·Step·측정 항목 명을 남깁니다. 확대·이동으로 원하는 위치를 크게 보며 점을 찍을 수 있고, 현재 배율에서 화면 1px이 원본 몇 px인지 표시됩니다.
7. 홈에서 실제 이미지 수, 측정 수와 항목별 평균·최소·최대를 확인합니다.
8. 선택 이미지의 명세·측정 데이터·도형 라벨·개발 요청·검증 기준을 담은 ZIP을 내보냅니다(계약 버전 1.1).
9. 기존 AI 개발 도구에서 요약 CSV 생성 스크립트를 만들고 로컬에서 검증합니다. 이 단계는 앱 외부의 수동 개발 데모입니다.

위 항목은 구현 목표입니다. 계측 기반을 먼저 검증한 후 개발 컨텍스트 기능을 구현하며, 두 게이트와 생성 코드 검증이 모두 통과해야 대회용 MVP 완료입니다. 수동 측정은 미검토 참고값이며 자동 계측의 정답으로 취급하지 않습니다.

단일 키워드 검색·종류 필터, 측정 삭제, 이미지 삭제, 항목별 표본 수·평균·최소·최대와 도형 라벨링은 P1으로 구현을 마쳤습니다.

홈 최상단 소개 영상은 외부 임베드입니다. **네트워크가 차단된 환경에서는 영상이 표시되지 않지만 홈의 나머지 내용과 앱 기능은 그대로 동작합니다.** 영상 자리에는 그 사실을 설명하는 문구가 항상 함께 표시되므로 빈 상자로 남지 않으며, 심사·시연은 영상 없이 진행해도 됩니다. 시스템에서 동작 줄이기(reduced motion)를 켠 환경에서는 자동 재생하지 않고 재생 버튼을 제공합니다.

자유 윤곽(폴리곤) 라벨링과 라벨 검수, 피처 자동 추출, Tool 등록, Lineage, Report는 이번 3일 MVP의 후속 로드맵입니다.

## 시연 화면

아래 화면은 로컬 PostgreSQL 16과 native uvicorn으로 앱을 실행한 뒤 승인된 demo 데이터로
Playwright가 자동 캡처한 실제 동작 화면입니다(캡처 시각 2026-09-08, working tree
`7a387cb`, 캡처 스크립트 [`scripts/capture_screenshots.mjs`](scripts/capture_screenshots.mjs)).
공개 배포된 서비스가 아니라 로컬 실행 결과이며, 비밀정보나 비공개 자료는 포함하지 않습니다.
캡처 환경은 외부 네트워크가 차단돼 있어 홈 최상단의 소개 영상 자리가 비어 있습니다.
영상은 보조 자료이며 앱 기능 근거가 아닙니다(HOM-040).
캡처 스크립트는 `screenshots/`와 사이트용 사본 `docs/public/screenshots/`를 함께 갱신하므로
두 곳이 어긋나지 않습니다.

| 화면 | 대응 기능 |
| --- | --- |
| ![홈: 실제 이미지·측정 집계와 사용 흐름](screenshots/01-home.png) | 홈에서 실제 이미지 수·측정 수·파라미터 집계와 사용 흐름 끝의 등록·목록 CTA (MVP 6) |
| ![이미지 목록: 최신순 카드와 측정 수](screenshots/02-catalog.png) | 등록된 이미지를 목록에서 최신순으로 찾아 다시 열기 (MVP 2) |
| ![이미지 등록: 미리보기와 제조 메타데이터 폼](screenshots/03-register.png) | PNG/JPEG/TIFF를 제조 메타데이터·보정값과 함께 등록 (MVP 1, 4) |
| ![측정 뷰어: 두 점 선택 draft와 실시간 preview](screenshots/04-measurement-draft.png) | 이미지 위 두 점 선택으로 CD/Depth/Thickness 측정과 preview (MVP 3, 4) |
| ![저장 후: overlay 복원·저장 항목·context export 활성](screenshots/05-measurement-saved.png) | 저장 좌표·값의 overlay 복원과 측정이 있을 때 활성화되는 컨텍스트 ZIP 내보내기 (MVP 5, 7) |

캡처는 미검토 참고값인 수동 측정을 자동 계측의 정답으로 표현하지 않습니다.

## 사전 준비

- Python 3.12.12 (`.python-version`으로 고정), 의존성 관리자 [`uv`](https://docs.astral.sh/uv/)
- Node.js 22.17.1과 npm
- PostgreSQL 16 (로컬 설치 또는 아래 Compose 스택)
- 컨테이너 실행 시 Docker와 Docker Compose v2

## 빠른 시작

### 1. Clean setup과 locked install

```bash
git clone https://github.com/geniuskey/nanodb_mvp.git
cd nanodb_mvp
cp .env.example .env        # 필요 시 값 수정
make install                # uv sync --frozen + npm ci
make build-frontend         # dist/frontend 생성
```

### 2. 컨테이너 스택으로 실행 (권장)

`db → migrate → app` 순서로 기동하고, migration이 성공한 뒤에만 앱이 시작됩니다.

```bash
make up                     # docker compose up --build --wait
# 또는 demo 데이터까지 적재하고 URL 출력:
make demo
```

앱은 `http://127.0.0.1:8000`(loopback)에서 제공됩니다. 이미지 바이너리는 host의
`./var/uploads`에 bind mount되고, DB 데이터는 named volume에 유지됩니다. 스택 제어는
`make stop`, `make down`, 파괴적 초기화는 `make clean`(DB volume 포함 제거)입니다.

### 3. 네이티브로 실행

로컬 PostgreSQL이 `DATABASE_URL`로 접근 가능해야 합니다.

```bash
make migrate                # alembic upgrade head
make dev                    # uvicorn --reload on 127.0.0.1:8000
```

### 4. 데모 샘플 준비·점검·안전 초기화

승인된 TEM 원본에서 무리샘플 PNG 파생본을 만들고 무결성을 점검합니다. 원본
`data/samples/`는 절대 수정하지 않습니다.

```bash
make prepare-demo           # data/demo/ 파생본·manifest 재생성 (오프라인)
make preflight              # 파생본·manifest 오프라인 검증
make seed-demo              # NANODB_PROFILE=demo, 실행 중 DB에 적재
make reset                  # NANODB_PROFILE=demo, 전용 target guard 통과 시에만 초기화
```

`reset`은 `NANODB_PROFILE=demo`와 전용 `var/uploads` target guard를 통과해야만 demo DB
행과 업로드를 known-empty 상태로 되돌리며, source sample을 대상으로 삼지 않습니다.

## 테스트

```bash
make test                   # backend(pytest) + frontend(vitest)
make test-backend           # PostgreSQL integration test는 TEST_DATABASE_URL이 있을 때 실행
make test-frontend
make test-e2e               # Playwright 브라우저 시나리오
make lint                   # ruff
make typecheck              # mypy + tsc
```

PostgreSQL 통합 테스트는 `TEST_DATABASE_URL`이 설정된 경우에만 실행되며, 없으면 명시적으로
skip됩니다.

## 컨텍스트 내보내기 (ZIP)

이미지 상세에서 `GET /api/images/{id}/context-export`로 고정 네 파일 ZIP을 내려받습니다.

- `context.md` — 좌표계·계산 규칙·데이터 주의사항
- `data.json` — 선택 이미지와 저장된 모든 측정, 저장된 도형과 도형 라벨 (`schema_version` `1.1`)
- `task.md` — 수행할 개발 과제
- `checks.json` — 검증용 정답(ground truth)

이미지 바이너리·절대 경로·secret은 포함하지 않으며, 자동 외부 전송도 하지 않습니다.
측정이 하나 이상 있을 때만 export가 활성화됩니다. 상세 계약은
[API Reference](aidlc-docs/construction/nanodb-core/code/api-reference.md)를 참고하세요.

## 외부 AI 생성 코드 검토·실행·검증

내보낸 컨텍스트로 외부 AI 개발 도구에서 요약 CSV 생성 코드를 만들고 오프라인으로 검증하는
자산이 [`validation/external-ai/`](validation/external-ai/)에 있습니다. 수동 설명 준비와
컨텍스트 내보내기 두 방식을 같은 과제로 비교하며, 준비 시간·추가 요청 수·검증 결과를
`pass`/`fail`/`unverified` 그대로 기록합니다. 이 도구는 앱 런타임에 연결되지 않고 모델을
자동 호출하지 않습니다. 향상이나 토큰 절감을 미리 주장하지 않습니다.

## 알려진 제한

- 인증·권한은 이번 범위 밖입니다.
- 저장된 측정은 메모 외에는 수정할 수 없습니다. 좌표·항목·값·보정값은 측정 근거이므로 불변이며, 잘못 찍은 측정은 삭제 후 다시 측정합니다.
- 그린 도형은 이동·크기 조절할 수 없습니다. 삭제 후 다시 그립니다.
- 이미지 위 클릭 외에 측정 화면의 `좌표로 직접 지정`으로 원본 좌표를 입력해 측정할 수 있습니다. 태블릿·모바일 터치 측정과 다크모드는 지원 범위가 아닙니다.
- 자동 계측·윤곽 검출은 없습니다. 측정은 수동 두 점 방식의 미검토 참고값입니다.
- 앱은 단일 호스트 로컬 파일 저장을 사용하며 multi-instance·객체 저장소·HA는 범위 밖입니다.
- 앱 내부 AI 호출·코드 실행 기능은 없습니다.
- native unit·정적 게이트(backend·frontend unit test, lint, typecheck, preflight)는 통과했습니다. 컨테이너 이미지·스택 기동과 PostgreSQL integration·브라우저 e2e test는 Docker/PostgreSQL 환경에서 실행·판정합니다.
- 배포·API 상세는 [deployment.md](aidlc-docs/construction/nanodb-core/code/deployment.md),
  [api-reference.md](aidlc-docs/construction/nanodb-core/code/api-reference.md)를 참고하세요.

## 샘플 데이터

| 데이터 묶음 | 수량 | 내용 | Manifest |
| --- | ---: | --- | --- |
| TEM | 12 | DRAM, Flash, Logic TEM 샘플과 TIFF private tag | [`data/samples/tem/metadata.csv`](data/samples/tem/metadata.csv) |
| Layout | 2 | 4T APS 센서 레이아웃, 1T1C DRAM 레이아웃 | [`data/samples/layout/metadata.csv`](data/samples/layout/metadata.csv) |

각 manifest에는 안정적인 sample ID, 파일명, SHA-256, 도메인 메타데이터와 프로젝트 사용 승인 상태가 들어 있습니다. TIFF 파일은 일반 Git 바이너리로 함께 관리합니다.

샘플 TIFF는 원본 데이터와 메타데이터 처리 검증용입니다. 브라우저 직접 등록 형식은 PNG/JPEG/TIFF이며, TIFF를 올리면 앱이 원본을 보존한 채 원본 픽셀 크기를 유지한 PNG 파생본을 만들어 화면에 표시합니다(리샘플링하지 않으므로 저장 좌표가 1:1로 맞습니다). 데모 사전 준비 단계에서 PNG 파생본을 미리 만들어 두는 절차도 그대로 유지하며, 리샘플링하지 않은 경우에만 manifest의 `length_nm_per_pixel`을 그대로 사용합니다. 파생본 준비·무결성 점검·데모 초기화 절차는 위 [빠른 시작](#빠른-시작)의 `make prepare-demo`, `make preflight`, `make seed-demo`, `make reset`로 실행합니다.

### 샘플 검증

의존성 설치(`make install`) 후 `uv`로 실행합니다.

```bash
uv run python scripts/verify_tem_samples.py
uv run python scripts/verify_layout_samples.py
```

검증기는 다음 항목을 확인합니다.

- Manifest에 기록된 파일의 누락 또는 초과
- SHA-256 파일 무결성
- 이미지 크기, 색상 모드와 압축 형식
- TEM TIFF private tag와 manifest 값의 일치

### TEM 메타데이터 읽기

```bash
uv run python scripts/tem_metadata.py data/samples/tem/images/tem_001.tif
```

`write_meta()`는 원본을 덮어쓰지 않고 별도 파생 TIFF만 생성합니다. `scrap_step`은 현재 숫자형 문자열과 코드형 문자열이 혼재하므로 도메인 정의가 확정될 때까지 문자열로 취급합니다.

## 저장소 구조

```text
nanodb_mvp/
├── src/
│   ├── backend/nanodb/          # FastAPI app, domain, services, persistence, adapters
│   └── frontend/                # React 19 + Vite frontend
├── alembic/                     # PostgreSQL migration 환경과 revision
├── tests/                       # backend(unit/api/contract/integration)와 e2e
├── scripts/                     # 샘플 검증·demo 준비/preflight/reset tooling
├── validation/external-ai/      # 외부 AI 생성 코드 검증 자산 (US-07)
├── data/
│   ├── samples/                 # 원본 TEM·layout 샘플과 manifest (앱에 mount 안 함)
│   └── demo/                    # 무리샘플 PNG 파생본과 manifest
├── assets/logo/                 # 라이트·다크 로고
├── requirements/                # 3일 MVP 요구사항
├── references/                  # 로고·홈 탭 기준 PDF
├── aidlc-docs/                  # AI-DLC 상태와 산출물
├── Dockerfile, compose.yaml     # 단일 이미지 build와 db→migrate→app 스택
├── Makefile, .env.example       # task 진입점과 환경 예시
├── AGENTS.md                    # Codex용 AI-DLC 지침
└── CLAUDE.md                    # Claude Code용 AI-DLC 지침
```

런타임 업로드(`var/uploads/`)와 built frontend(`dist/`)는 생성물이며 Git에 커밋하지
않습니다.

## 평가 근거 사이트 (Evidence Site)

해커톤 평가자를 위한 정적 근거 사이트가 `docs/`에 VitePress로 있습니다. 문제·실제 기능·
AI-DLC 근거·검증 상태·한계를 소개·근거 두 페이지에서 확인합니다. Core runtime과 분리된
독립 dependency 그래프(`docs/package.json`, `docs/package-lock.json`)를 사용하며 실행 중
Core 앱과 통신하지 않습니다.

```bash
cd docs
npm ci                      # docs/package-lock.json 고정 설치
npm run docs:dev            # 로컬 개발 서버
npm run docs:build          # 정적 build → docs/.vitepress/dist
npm run docs:preview        # build 결과 미리보기 (배포와 동일 base /nanodb_mvp/)
```

Node 버전은 루트 `.nvmrc`(22.17.1)로 로컬·CI를 일치시킵니다.

### GitHub Pages 배포 (관리자 설정)

1. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로
   설정합니다.
2. `main`에 `docs/**`·`screenshots/**`·`.nvmrc`·배포 workflow가 push되면
   [`.github/workflows/deploy-evidence-site.yml`](.github/workflows/deploy-evidence-site.yml)이
   사이트를 build하고 **build 성공 후에만** Pages에 배포합니다. 수동 실행은 Actions 탭의
   `workflow_dispatch`로 합니다.
3. 배포는 최소 권한(`contents: read`, `pages: write`, `id-token: write`)과 단일 배포
   concurrency(진행 중 배포 미취소)로 제한됩니다.

> 1번 관리자 설정은 이미 완료돼 있습니다. `main` push마다 build·deploy job이 실행되어
> 성공하고 있으므로 추가 설정 없이 게시됩니다. 실행 이력은 저장소 Actions 탭의
> `Deploy evidence site`에서 확인할 수 있습니다.

### 게시 안전 원칙

- 공개 사이트는 localhost 앱으로 연결하지 않습니다.
- 원본 이미지·비밀정보·내부 audit 원문·비공개 자료를 게시하지 않습니다.
- 시연 스크린샷은 승인된 demo 데이터만 사용하며, 캡처 버전·시각을 표기합니다.
- 사이트가 참조하는 스크린샷은 자체 포함을 위해 `docs/public/screenshots/`에 동일 사본을
  두며, 원본 캡처는 루트 `screenshots/`입니다.

## 요구사항 문서

- [NANoDB 3일 MVP 요구사항](requirements/nanodb-mvp-requirements.md)
- [홈 탭 요구사항](requirements/home-tab-requirements.md)
- [의도적 제외사항](requirements/constraints.md)
- [AI-DLC 통합 요구사항](aidlc-docs/inception/requirements/requirements.md)

## 데이터 관리 원칙

- 원본 이미지는 직접 수정하지 않습니다.
- 측정과 수정 실험 결과는 원본과 분리된 파생 데이터로 저장합니다.
- 이미지 교체 시 manifest의 SHA-256과 메타데이터를 함께 갱신합니다.
- 런타임 업로드, PostgreSQL 연결 비밀값, 생성 결과는 Git에 커밋하지 않습니다.
- 공개 통계, 예시 KPI와 실제 데이터 집계값을 명확히 구분합니다.

## 대회와 팀 목표

5명이 3일 동안 각자 소속 팀에 필요한 도구를 독립 개발합니다. NANoDB는 그중 한 프로젝트이며 담당자가 앱·데이터·검증·사용법을 책임집니다. 공통 발표에는 현업 문제, AI 개발에서 돕는 작업, 실제 전후 비교, 대회 이후 활용 업무를 담습니다.

NANoDB는 AI로 분석 코드를 만들 때 반복하는 데이터 형식·좌표계·단위 설명을 재사용 가능한 컨텍스트로 제공합니다. 자료 준비 시간, 추가 설명·수정 요청 수와 검증 통과 여부를 실제로 비교할 계획이며, 향상이나 토큰 절감을 미리 주장하지 않습니다. 앱·내보내기는 오프라인 동작을 목표로 하며 앱에 모델 호출·코드 실행 기능을 넣지 않습니다.

## 개발 워크플로우

이 저장소에는 AWS Labs AI-DLC v1.0.1 워크플로우가 설치되어 있습니다.

- Codex: `AGENTS.md`, `.agents/skills/aidlc/`
- Claude Code: `CLAUDE.md`, `.aidlc-rule-details/`
- 진행 상태: `aidlc-docs/aidlc-state.md`

## 프로젝트 상태

- [x] 3일 MVP 범위 정의
- [x] 홈 탭 요구사항 정리
- [x] 라이트·다크 로고 준비
- [x] TEM/Layout 샘플과 manifest 검증
- [x] 웹 애플리케이션 구현 (backend·frontend·PostgreSQL·계층별 테스트 생성)
- [x] 대회 취지에 맞춘 개발 컨텍스트·AI 코드 검증 요구사항 반영
- [x] 개발 컨텍스트 ZIP 구현
- [x] demo 준비·검증 tooling과 배포 artifact 생성
- [x] 외부 AI 생성 코드 검증 자산 생성
- [x] Build and Test: native unit·정적 게이트 통과 (backend 57 passed·7 skipped, frontend 23 passed, lint·typecheck·preflight green, 2026-09-08)
- [ ] Docker/PostgreSQL 환경에서 integration·브라우저 e2e·컨테이너 스택 최종 통과 판정
- [ ] 설명 준비 시간·수정 요청·검증 결과 실제 비교 기록

## License

프로젝트 전체의 오픈소스 라이선스는 아직 지정되지 않았습니다. 샘플 데이터의 `PROJECT_AUTHORIZED` 표시는 이 저장소에서의 사용 승인을 뜻하며 별도의 SPDX 라이선스 선언은 아닙니다.
