# HOM-040 + P2 Polish — Code Generation Plan

> 승인: 2026-09-08 "계속해줘" (P2 검토에서 제안한 권장 순서 그대로)
> 대상: HOM-040(P1 잔여), UIX-006, UIX-004, UIX-007, UIX-005, IMG-009, IMG-010
> 보류: UIX-003(좌표 직접 입력), UIX-009(로딩 자리 확보) — 검토에서 낮은 데모 가치로 판단해 P2에 남김

## 단계 결정

Functional / NFR / Infrastructure Design 생략. 서버 변경이 없고 도메인·배포·성능 계약이 그대로다. 전부 프런트엔드 화면 동작이다.

## Part 2 — 실행 단계

### HOM-040: 홈 소개 영상 안전장치

- [x] 1. `prefers-reduced-motion: reduce`이면 자동 재생하지 않고 재생 버튼을 제공 (`matchMedia`가 없는 환경은 "선호 없음"으로 처리)
- [x] 2. 영상 프레임 아래에 항상 보이는 설명 문구 — 외부 서비스에서 불러오며 차단 환경에서는 비어 있을 수 있고, 영상 없이도 내용을 볼 수 있음을 명시
- [x] 3. README에 오프라인 진행 방법 기록

### UIX-006: 에러 경계와 미정의 경로

- [x] 4. `ui/ErrorBoundary.tsx` — 렌더 예외를 잡아 복구 화면 표시, 내부 상세 미노출, 다시 시도로 재렌더
- [x] 5. `pages/NotFoundPage.tsx`와 `<Route path="*">` — 빈 shell 대신 이동 동선 제공
- [x] 6. Shell의 `Outlet`을 ErrorBoundary로 감쌈

### UIX-004 / UIX-005 / UIX-007

- [x] 7. `ui/useDocumentTitle.ts`와 네 화면 적용 (측정 화면은 파일명)
- [x] 8. 본문 건너뛰기 링크와 `#main-content` 대상
- [x] 9. 홈 요약·홈 최근 이미지·목록·측정 상세 실패에 다시 시도 추가

### IMG-009 / IMG-010: 등록 폼

- [x] 10. 필수 표시(별표 + `aria-required`). 네이티브 `required` 대신 `noValidate`를 써서 기존 오류 표시 계약을 유지
- [x] 11. 필드별 오류 상태와 인라인 메시지, `aria-invalid`·`aria-describedby` 연결
- [x] 12. 제출 실패 시 첫 오류 입력으로 포커스 이동
- [x] 13. 서버가 `field`를 지정한 오류는 해당 필드 옆에 표시

### 구현 중 발견한 결함

- [x] 14. `/images/new`에서 `이미지DB`와 `이미지 등록` 탭이 동시에 현재 위치로 표시되던 문제 (HOM-004 위반). `이미지DB` 탭에 `/images/new` 제외 규칙 추가
- [x] 15. 건너뛰기 링크가 조상 스택 영향을 받지 않도록 `position: fixed`로 고정

### 문서와 검증

- [x] 16. 요구사항 우선순위 표와 HOM-004·UIX-003·UIX-005·UIX-006·UIX-009 문구 갱신
- [x] 17. README 알려진 제한과 영상 오프라인 안내 갱신
- [x] 18. 테스트 추가 — 영상 reduced-motion, 문서 타이틀, 재시도 3곳, 404, 건너뛰기 링크, 에러 경계, 탭 단일 활성, 폼 필드별 오류·aria·포커스
- [x] 19. 검증 — ruff, mypy, pytest, typecheck, vitest, build, e2e

## 실행 결과 (2026-09-08)

19/19 단계 완료.

| 게이트 | 결과 |
| --- | --- |
| `ruff check .` | 통과 |
| `mypy` | 27개 소스 파일 이상 없음 |
| `pytest` (로컬 PostgreSQL 16) | 104 passed |
| `npm run typecheck` | 통과 |
| `npm run test:frontend` | 62 passed |
| `npm run build` | 성공 |
| `npm run test:e2e` (Chromium, 실제 앱) | 7 passed |

서버 변경이 없어 백엔드 테스트 수는 그대로다.

## 남은 범위

- UIX-003: 좌표 직접 입력. 키보드 측정 경로가 없다는 한계는 README에 기록돼 있다.
- UIX-009: 로딩 자리 확보.

둘 다 데모 실패 조건이 아니며 요구사항에 미구현으로 명시돼 있다.
