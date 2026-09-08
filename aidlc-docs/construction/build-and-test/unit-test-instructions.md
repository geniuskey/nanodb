# Unit Test Execution

NANoDB Core의 unit·계약 test는 backend(pytest)와 frontend(Vitest) 두 축으로 나뉜다.
PostgreSQL이 필요한 integration test는 `integration-test-instructions.md`에서 다룬다.

## Backend unit·API·contract test

### 1. 실행

```bash
make test-backend        # uv run pytest
# 또는 특정 계층만
uv run pytest tests/backend/unit
uv run pytest tests/backend/api tests/backend/contract
```

### 2. 결과 확인

- **기대**: pure domain·API·service·ZIP contract test 통과, 실패 0
- **PostgreSQL integration test**: `TEST_DATABASE_URL`이 없으면 명시적으로 skip
- **보고 위치**: 표준 출력(pytest 요약)

### 3. 실제 결과 (이 환경, 2026-09-08)

```
57 passed, 7 skipped, 1 warning in 0.65s
```

- 7 skipped = PostgreSQL integration test(`TEST_DATABASE_URL` 미설정)
- 1 warning = Starlette TestClient DeprecationWarning(무해)

## Frontend unit test

### 1. 실행

```bash
make test-frontend       # npm run test:frontend (vitest run)
```

### 2. 결과 확인

- **기대**: 컴포넌트·페이지·coordinate adapter test 통과, 실패 0
- **환경**: jsdom, Testing Library, 안정적 `data-testid` 기반 선택자

### 3. 실제 결과 (이 환경, 2026-09-08)

```
Test Files  6 passed (6)
     Tests  23 passed (23)
```

## 실패 test 처리

test가 실패하면:
1. 출력에서 실패한 case를 확인한다.
2. 코드 문제를 수정한다(test 통과를 위해 test를 약화시키지 않는다).
3. 모두 통과할 때까지 재실행한다.
