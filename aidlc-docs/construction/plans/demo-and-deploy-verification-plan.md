# 데모·컨테이너·게시 경로 검증 — Verification Plan

> 승인: 2026-09-08 "해줘. 발견된 모든 리스크 다 제거해줘"
> 대상: `make demo` 경로, 컨테이너 스택, VitePress/GitHub Pages 게시 경로
> 성격: 새 기능이 아니라 **한 번도 실행된 적 없던 경로를 실제로 돌려보고 드러난 결함을 제거**하는 작업

## 실행 결과

| 경로 | 결과 |
| --- | --- |
| `uv sync --frozen` (`make install`) | **결함 발견 → 수정** |
| `make preflight` | 통과 |
| `make migrate` | 통과 (3개 migration 적용) |
| `make seed-demo` | 통과 (demo 이미지 3건 적재, 원천 샘플 불변) |
| `make reset` | 통과 (행·업로드 정리, `data/samples/` 불변) |
| `make lint` / `mypy` / `make test-backend` | 통과 (104 passed, skip 없음) |
| `make test-frontend` / `make build-frontend` | 통과 (63 passed) |
| `make test-e2e` | 통과 (7 passed, Chromium) |
| `docker compose config` | 유효 |
| 컨테이너 이미지 태그 존재 확인 | 4개 모두 존재 |
| `docker compose up --build` | **실행 불가 — 환경 제약** |
| `docs:build` (dead-link 검사 on) | 통과 |
| `docs:preview` + `/nanodb_mvp/` base | 통과 (소개·근거·자산 200) |
| Pages workflow 계약 검토 | DOC-006~011 충족 |
| 실제 Pages 배포 | **실행 불가 — 저장소 관리자 설정 필요** |

## 제거한 결함

### 1. `.python-version`이 설치 불가능한 버전을 고정 (치명)

`3.12.12`로 고정돼 있었으나 uv가 리눅스용으로 받을 수 있는 최신 빌드는 `3.12.11`이다.
시스템에 3.12.12가 없는 새 머신에서는 `uv sync --frozen`이
`No interpreter found for Python 3.12.12`로 실패한다. **`make install`부터 막히므로
"명령 1~2개로 실행" 요구사항이 성립하지 않았다.**

`pyproject.toml`의 `requires-python`은 이미 `==3.12.*`이므로, `.python-version`을 `3.12`로
완화해 프로젝트가 실제로 요구하는 범위와 일치시켰다. Dockerfile의 `python:3.12.12-slim-bookworm`은
그 태그가 실재하므로 그대로 둔다.

### 2. 홈 사용 흐름 CTA가 요구사항에만 있고 구현되지 않음

2026-09-08 개정에서 HOM-034a(`이렇게 쓰세요` 끝의 CTA 2개)를 신설했으나 구현하지 않았다.
스크린샷을 다시 찍는 과정에서 드러났다. `이미지 등록`·`이미지 둘러보기` 링크를 구현하고
"홈 본문의 이동 링크는 이 둘뿐"이라는 HOM-005 계약을 테스트로 고정했다.

### 3. 평가용 스크린샷이 4커밋 전 UI

`screenshots/`가 working tree `19b2af6` 시점(홈 v2·TIFF·라벨링·확대 이전)이었다. 심사자가
보는 자료가 존재하지 않는 화면을 보여주고 있었다. 현재 앱으로 재캡처했다.

### 4. 사이트용 스크린샷 사본이 따로 놀 수 있는 구조

사이트는 `docs/public/screenshots/`를, README는 `screenshots/`를 참조하는데 둘을 잇는 장치가
없었다. 캡처 스크립트가 두 곳을 함께 갱신하도록 바꿔 재발을 막았다.

### 5. 캡처 스크립트가 제한된 네트워크에서 실행 불가

`chromium.launch()`가 Playwright 전용 다운로드만 사용해, 브라우저가 이미 설치돼 있어도
쓸 수 없었다. `CHROMIUM_PATH` 환경변수를 선택적으로 지원하게 했다.

### 6. 건너뛰기 링크가 캡처 화면에 노출

`position: fixed`가 full-page 캡처에서 스크롤 위치에 그려져 평가용 스크린샷에 찍혔다.
표준 패턴인 `position: absolute`로 되돌렸다.

### 7. 문서의 낡은 사실 4건

- README: `schema_version 1.0` → `1.1`(도형 포함), 스크린샷 캡처 커밋, PNG/JPEG → PNG/JPEG/TIFF
- `docs/index.md`: "검색·측정 삭제·항목별 평균은 P0 범위 밖" → 전부 구현 완료
- `docs/evidence.md`: `schema_version 1.0`, 테스트 수(57/23 → 104/63/7), 통합 테스트·e2e의 미검증 표기

## 관찰 (결함은 아님)

`make seed-demo`가 호출하는 파생본 생성은 **바이트 단위로 재현되지 않는다.** 같은 원천에서
다시 만들면 PNG 인코딩 결과와 `derivative_sha256`이 달라진다(Pillow 버전 차이). manifest를
파생본과 함께 다시 쓰고 `make preflight`가 둘의 정합을 검사하므로 안전성 문제는 없고,
`source_sha256`은 그대로다. 저장소에 커밋된 파생본은 그대로 두었고 preflight로 유효함을
재확인했다. 파생본 자체의 비트 재현성이 필요해지면 그때 인코딩 옵션을 고정하면 된다.

## 환경 제약으로 실행하지 못한 것

- **컨테이너 스택 기동**: Docker 이미지 레이어 호스트(`production.cloudfront.docker.com`)가
  조직 egress 정책으로 403 차단이다. 우회하지 않았다. 대신 `docker compose config` 유효성과
  네 이미지 태그(`python:3.12.12-slim-bookworm`, `node:22.17.1-bookworm-slim`,
  `postgres:16.10-bookworm`, `ghcr.io/astral-sh/uv:0.9.5`)의 실재를 레지스트리 API로 확인했다.
  **Docker가 되는 환경에서 `make up` 1회 실행이 여전히 필요하다.**
- **GitHub Pages 실제 배포**: 예측이 틀렸다. PR 머지 직후 확인해 보니 Pages Source는 이미
  `GitHub Actions`로 설정돼 있었고, `main` 머지 커밋에서 workflow의 build와 deploy job이
  모두 성공했다([run](https://github.com/geniuskey/nanodb_mvp/actions/runs/34225740216)). 이전 두 번의 main push에서도 성공했다. 즉 이 항목은 처음부터
  미검증이 아니라 **검증 가능한 상태였고, 내가 workflow 실행 이력을 확인하지 않고
  `aidlc-state.md`의 오래된 서술을 그대로 옮겼다.** 게시된 URL 자체는 `geniuskey.github.io`가
  이 실행 환경의 egress 정책에서 403이라 열어보지 못했다.

남은 미검증은 컨테이너 스택 하나뿐이다.

## 교훈

이번 작업의 전제는 "문서가 실행 결과와 어긋나 있다"였는데, 정작 나도 실행 이력을 확인하지 않고
낡은 상태 서술을 옮겨 적어 같은 실수를 했다. 상태를 옮길 때는 원본 문서가 아니라 실행 기록을
근거로 삼아야 한다.
