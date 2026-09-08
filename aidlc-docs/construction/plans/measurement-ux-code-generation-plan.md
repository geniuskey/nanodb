# Measurement UX — Code Generation Plan (Phase 3)

> 승인: 2026-09-08 "4까지 진행. 승인"
> 범위: [ui-ux-review-2026-09-08.md](../../inception/requirements/ui-ux-review-2026-09-08.md) 8절 구현 우선순위 ①~④
> 대상 요구사항: MEA-012, MEA-013, MEA-014, UIX-001, UIX-002, ANN-005, ANN-006
> 제외: ⑤ ANN-008(도형의 ZIP 포함), RES-007, CAT-008~009, UIX-008 및 P2 전체 — 이번 유닛 범위 밖

## 단계 결정

| 단계 | 실행 | 사유 |
| --- | --- | --- |
| Functional Design | 생략 | 새 도메인 개념 없음. 도형 삭제는 기존 Measurement 삭제와 동일한 규칙(이미지 스코프, 파생 데이터만 제거)을 따르고, 나머지는 화면 상호작용이다. |
| NFR Requirements | 생략 | 기술 스택·성능 목표 변화 없음. 확대·이동은 클라이언트 렌더링 범위이며 100건 데모 전제를 바꾸지 않는다. |
| NFR Design | 생략 | NFR Requirements를 생략했으므로 함께 생략한다. |
| Infrastructure Design | 생략 | 배포 구성 변화 없음. 엔드포인트 하나가 기존 라우터에 추가될 뿐이다. |
| Code Generation | 실행 | 아래 Part 2 단계 수행 |

## Part 2 — 실행 단계

### 백엔드 (ANN-005)

- [x] 1. `AnnotationRepository.delete(image_id, annotation_id) -> bool` — 이미지 스코프, 다른 이미지의 id는 not found 취급
- [x] 2. `AnnotationService.delete(image_id, annotation_id)` — 이미지 없으면 `IMAGE_NOT_FOUND`, 도형 없으면 `ANNOTATION_NOT_FOUND`, 성공 시 commit
- [x] 3. `DELETE /api/images/{image_id}/annotations/{annotation_id}` → 204
- [x] 4. 라우트 테스트: 204와 id forwarding, 없는 도형 404 envelope
- [x] 5. 통합 테스트: 이미지 스코프 삭제, 교차 삭제 거부, 없는 이미지 `IMAGE_NOT_FOUND`

### 프런트엔드 공통 (UIX-001, UIX-002)

- [x] 6. `api/client.ts`에 `deleteAnnotation` 추가
- [x] 7. `ConfirmDialog` 컴포넌트 — 앱 내 확인 대화상자. 제목·본문·삭제될 파생 데이터 건수, 확인/취소, 열릴 때 포커스 이동, Esc 취소, `role="dialog"` + `aria-modal`
- [x] 8. `StatusBanner` — 쓰기 성공을 `role="status"` 텍스트로 알리는 공용 표시. 실패는 기존 `role="alert"` 유지
- [x] 9. `window.confirm` 3곳(측정 삭제·이미지 삭제 2곳)을 `ConfirmDialog`로 교체

### 측정 화면 (MEA-012, MEA-013, MEA-014, ANN-005, ANN-006)

- [x] 10. 이미지 정보 패널 — `nm/pixel` 보정값, 원본 픽셀 크기, 등록 시각 상시 표시 (MEA-012)
- [x] 11. 확대·이동 — 뷰어를 스크롤 컨테이너로 만들고 배율에 따라 이미지 표시 폭을 계산. 좌표는 기존 `toOriginalPoint` 경로 그대로 원본 기준 유지 (MEA-013)
- [x] 12. 배율 컨트롤 — 축소/확대/맞춤 버튼과 현재 배율 표시
- [x] 13. 정확도 표시 — 현재 배율에서 화면 1px이 원본 몇 px인지 표시 (MEA-014)
- [x] 14. 도형 행별 삭제 버튼 + 확인 대화상자 (ANN-005)
- [x] 15. 도형 양방향 강조 — 도형 클릭으로 행 선택, 행 선택으로 도형 강조 (ANN-006)
- [x] 16. 측정 저장·삭제, 도형 저장·삭제, 이미지 삭제 성공 알림 (UIX-002)

### 목록 화면

- [x] 17. 이미지 삭제를 `ConfirmDialog`로 교체하고 성공 알림 추가

### 스타일과 검증

- [x] 18. `styles.css` — 대화상자, 상태 배너, 배율 컨트롤, 스크롤 뷰어, 도형 삭제 버튼
- [x] 19. 프런트 테스트 갱신 — `confirm` stub 기반 6건을 대화상자 조작으로 교체
- [x] 20. 신규 테스트 — 메타데이터 표시, 배율 변경과 정확도 표시, 도형 삭제, 도형 클릭 선택, 성공 알림
- [x] 21. e2e 스펙이 `window.confirm`에 의존하면 함께 갱신
- [x] 22. 검증 — `ruff`, `mypy`, `pytest`, `npm run typecheck`, `npm run test:frontend`, `npm run build`

## 실행 결과 (2026-09-08)

22/22 단계 완료. 21단계에서는 `window.confirm` 의존이 없는 대신, TIFF 등록을 추가하던 시점부터 낡아 있던 단언 1건(`PNG 또는 JPEG` → `PNG, JPEG 또는 TIFF`)을 함께 고쳤다.

### 검증

| 게이트 | 결과 |
| --- | --- |
| `ruff check .` | 통과 |
| `mypy` | 27개 소스 파일 이상 없음 |
| `pytest` (로컬 PostgreSQL 16, `TEST_DATABASE_URL` 지정) | 97 passed |
| `npm run typecheck` | 통과 |
| `npm run test:frontend` | 47 passed |
| `npm run build` | 성공 |
| `npm run test:e2e` (Chromium, 실제 앱 + PostgreSQL) | 6 passed |

e2e는 이번에 실제 브라우저에서 처음 실행했다. 확대가 좌표계를 깨지 않는다는 점(저장 측정 선이 이미지와 같은 비율로 커지며 같은 위치를 가리킴)은 단위 테스트로 확인할 수 없어 e2e로 검증했다.

### 구현 중 발견해 함께 고친 것

- 확대 시 뷰어가 grid 열을 밀어내 사이드바 아래로 넘치던 문제. `.viewer-panel`에 `minmax(0, 1fr)`과 `min-width: 0`을 주어 넘치는 대신 뷰포트 안에서 스크롤되게 했다.
- 도형 표에 삭제 열이 늘면서 좁은 사이드바에서 버튼이 두 줄로 깨지던 문제.

### 남은 범위

⑤ ANN-008(도형의 Context ZIP 포함), RES-007(메모 수정), CAT-008~009, UIX-008과 P2 전체는 이번 유닛에 포함하지 않았다.
