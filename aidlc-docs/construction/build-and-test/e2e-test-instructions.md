# End-to-End Test Instructions

## 목적

기동된 스택을 대상으로 사용자 워크플로 전체를 브라우저에서 검증한다: 이미지 등록 →
원본 좌표 두 점 클릭 → 측정 저장 → reload/resize 후 overlay 복원 → 선택 강조 →
context ZIP download. 주요 실패 시나리오(등록 client 검증, 측정 없는 export 비활성,
세 번째 click 보호)도 포함한다.

## Test 대상

| 시나리오 | 파일 |
| --- | --- |
| 정상 흐름(등록→측정→저장→복원→export) | `tests/e2e/measurement-flow.spec.ts` |
| 등록 client 검증 실패 / export 비활성 / 세 번째 click 보호 | `tests/e2e/failure-cases.spec.ts` |

- 설정: `playwright.config.ts` (chromium, `E2E_BASE_URL` 기본 `http://127.0.0.1:8000`,
  `acceptDownloads`, 자동 webServer 없음 — 스택은 별도 기동, workers 1)
- 헬퍼: `tests/e2e/helpers.ts` (`registerSampleImage`, `drawTwoPoints`)
- fixture: `tests/e2e/fixtures/sample.png` (결정적 400x300 PNG)

## 환경 준비

### 1. 스택 기동 (db → migrate → app)

```bash
make demo        # docker compose up --build --wait 그리고 demo 데이터 seed
# 또는 데이터 seed 없이
make up
```

### 2. Playwright 브라우저 설치 (최초 1회)

```bash
npx playwright install chromium
```

### 3. 실행

```bash
npm run test:e2e            # playwright test
# 다른 주소를 대상으로:
E2E_BASE_URL="http://127.0.0.1:8000" npm run test:e2e
```

### 검증 포인트

- 등록 후 상세로 이동하고 이미지가 표시된다.
- 두 점 클릭 시 `선택한 점: 2/2`와 preview가 나타난다.
- 저장 후 목록에 측정 1건, reload/resize 후 overlay·항목이 복원된다.
- context export 버튼이 측정이 있을 때만 활성화되고, 클릭 시 `nanodb-image-<id>.zip`이
  download된다.
- 파일 없이 등록 submit 시 form에 머무르고 사유 alert가 뜬다.

### Cleanup

```bash
make down        # 스택 정지·제거
```

## 실제 결과 (이 환경, 2026-09-08)

**미실행 — 환경 제약.** 브라우저 e2e는 기동된 스택이 필요한데 이 환경은 Docker daemon
사용 불가로 스택을 올릴 수 없다. 생성 단계에서 `npx playwright test --list`로 4개
시나리오가 discover·compile됨을 확인했다. Docker 환경에서 위 절차로 실행·판정한다.
