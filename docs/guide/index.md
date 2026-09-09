# 개발자 가이드 개요

이 문서는 NANoDB 저장소를 이어받는 개발자를 위한 온보딩 허브입니다. 저장소의 구조, 읽는
순서, 핵심 개념을 한곳에 모아 두었으므로 여기서 출발해 세부 페이지로 이동하면 됩니다.

> [!NOTE]
> 이 가이드는 **개발자 인수인계용** 문서입니다. 해커톤 심사 관점의 소개는
> [(평가) 소개](/)와 [심사 근거](/evidence)를 참고하세요.

## NANoDB란

NANoDB는 반도체 SEM/TEM 이미지와 측정 근거를 축적하고, 이를 AI 기반 분석 소프트웨어
개발에 필요한 컨텍스트·검증 데이터로 재사용하는 경량 웹 애플리케이션입니다. 이름은
`Nano Assets, Never orphaned Database`에서 왔으며, 이미지·측정·맥락이 담당자나 도구가
바뀌어도 흩어지지 않게 하는 것을 목표로 합니다. 기술적으로는 Python 3.12 FastAPI
백엔드(계층형 api/services/domain/persistence/adapters), React 19 + TypeScript + Vite
프론트엔드, PostgreSQL + SQLAlchemy + Alembic로 구성된 단일 저장소(monorepo)입니다.
이미지 등록·측정에 더해 세그멘테이션(윤곽 검출)과 피처 추출 기능이 백엔드에 실제로
구현되어 있습니다(`src/backend/nanodb/api/routes.py`,
`src/backend/nanodb/services/segmentation_service.py`,
`src/backend/nanodb/services/feature_service.py`).

## 저장소 지도 (repo map)

| 경로 | 역할 |
| --- | --- |
| `src/backend` | FastAPI 백엔드. `nanodb/` 아래 api·services·domain·persistence·adapters 계층으로 분리 |
| `src/frontend` | React 19 + TypeScript + Vite 프론트엔드. `src/` 아래 pages·measurement·api·ui 등 |
| `alembic` | 데이터베이스 스키마 마이그레이션(SQLAlchemy + Alembic), `alembic.ini`가 진입점 |
| `tests` | 테스트. `backend/`(pytest 계층별)와 `e2e/`(Playwright) |
| `scripts` | 데모·검증 도구 모음(스크린샷 캡처, demo 준비·리셋, preflight, TEM 세그멘테이션 등) |
| `data` | 검증된 샘플·데모 데이터. `samples/`(layout·tem 원본), `demo/`(승인된 demo 이미지·manifest) |
| `docs` | 이 VitePress 문서 사이트. `guide/`(개발자 가이드), `evidence.md`, `public/`(스크린샷 사본) |
| `aidlc-docs` | AI-DLC 워크플로우 산출물(요구사항·설계·상태·감사 로그). 앱 코드는 없음 |
| `validation` | 외부 AI 개발 도구 검증 자산(`external-ai/`: 프롬프트·생성물·결과·스키마 버전) |
| `var` | 런타임 산출물. `uploads/`(등록 이미지), `review/`, uvicorn·vite 로그. 버전 관리 대상 아님 |
| `assets` | 로고·소개 영상 등 정적 자산(`assets/video/nanodb_intro.mp4` 포함) |

> [!TIP]
> 개발에 필요한 진입점: `Makefile`(작업 명령), `compose.yaml`·`Dockerfile`(컨테이너),
> `pyproject.toml`·`uv.lock`(Python 의존성), `package.json`(프론트엔드),
> `.env.example`(환경 변수 템플릿).

## 이 가이드를 읽는 순서

새로 합류한 개발자는 아래 순서로 읽으면 빠르게 생산성을 낼 수 있습니다.

1. [개요](/guide/) — 지금 이 페이지. 저장소 지도와 핵심 개념
2. [개발 환경](/guide/getting-started) — 로컬 설치·실행, 필요한 도구와 명령
3. [아키텍처](/guide/architecture) — 백엔드·프론트엔드·DB가 맞물리는 전체 그림
4. [백엔드](/guide/backend) — FastAPI 계층 구조와 서비스별 책임
5. [프론트엔드](/guide/frontend) — React 앱 구성과 측정 뷰어 흐름
6. [데이터 모델](/guide/data-model) — 엔티티·스키마·마이그레이션
7. [API](/guide/api-reference) — 엔드포인트 레퍼런스
8. [컨텍스트 내보내기](/guide/context-export) — 개발 컨텍스트 ZIP의 구조와 계약 버전
9. [테스트·빌드·배포](/guide/testing-and-ci) — 테스트 게이트, 빌드, 컨테이너 실행
10. [용어집](/guide/glossary) — 도메인 용어 정리
11. [확장·기여](/guide/contributing) — 새 기능을 붙이거나 기여하는 방법

## 핵심 개념 한눈에

NANoDB의 중심 데이터 흐름은 **Image → Measurement → Development Context** 세 단계입니다.

1. **Image** — PNG/JPEG/TIFF 이미지를 제조 메타데이터(Product·Lot·Wafer, 선택 Step)와
   `nm/pixel` 보정값과 함께 등록합니다. TIFF는 원본을 보존하고 표시용 PNG 파생본을 만듭니다.
2. **Measurement** — 이미지 위에서 두 점을 선택하거나 좌표를 직접 입력해 CD·Depth·Thickness를
   측정하고, 보정값으로 실제 길이를 계산해 저장합니다. 저장된 측정은 원본 좌표로 복원됩니다.
3. **Development Context** — 선택 이미지의 명세·측정·측정 라벨·개발 요청·검증 기준을 담은
   ZIP으로 내보내(계약 버전 2.0), 외부 AI 개발 도구가 사람의 반복 설명 없이 같은 데이터를
   다룰 수 있게 합니다. 자세한 구조는 [컨텍스트 내보내기](/guide/context-export)를 참고하세요.

이 세 단계에 더해, 백엔드에는 **세그멘테이션(윤곽 검출)** 과 **피처 추출** 엔드포인트가
실제로 구현되어 있습니다(`/api/images/{id}/segmentation`,
`/api/images/{id}/features` 등, `src/backend/nanodb/api/routes.py`). 관련 도메인 로직은
`src/backend/nanodb/domain/segmentation.py`와 `domain/features.py`에 있습니다.

> [!WARNING]
> 수동 측정값은 미검토 참고값이며 자동 계측의 정답으로 취급하지 않습니다. 용어와 경계는
> [용어집](/guide/glossary)에서 확인하세요.

## 기여하려면

새 기능을 추가하거나 버그를 고치기 전에 [확장·기여](/guide/contributing) 페이지에서 코드
컨벤션, 계층 경계, 테스트 게이트, 후속 로드맵(자유 윤곽 라벨링·라벨 검수·Tool 등록·Lineage·
Report)을 먼저 확인하세요.
