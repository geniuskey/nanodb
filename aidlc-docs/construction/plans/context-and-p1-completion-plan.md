# Context Export + Remaining P1 — Code Generation Plan

> 승인: 2026-09-08 "응" (⑤부터 이어서)
> 대상 요구사항: ANN-008(+CTX-004·005·012), RES-007, CAT-008, CAT-009, UIX-008
> 함께 처리: 낡은 Construction 산출물 갱신

## 단계 결정

Functional / NFR / Infrastructure Design은 생략한다. 새 도메인 개념이 없고(도형은 이미 정의된 엔티티다), 기술 스택·성능 목표·배포 구성이 바뀌지 않는다. 다만 CTX 계약은 외부 소비자가 있는 인터페이스이므로 `schema_version`을 올리고 계약 문서와 재현성 테스트를 함께 갱신한다.

## Part 2 — 실행 단계

### ANN-008: 도형을 개발 컨텍스트에 포함

- [x] 1. `ExportSnapshot`에 기본값 `()`인 후행 필드 `annotations` 추가 (기존 생성 호출 무영향)
- [x] 2. `validate_export_snapshot`에 도형 ID 순서와 이미지 소속 검증 추가
- [x] 3. `_data_json`에 `annotations[]` 추가 (id, image_id, kind, 두 점 좌표, product, step, measurement_name, created_at)
- [x] 4. `context.md`에 화살표·원의 좌표 의미와 "도형은 계산값이 없으며 어떤 측정 요약에도 포함하지 않는다"를 명시
- [x] 5. `task.md`에 도형을 무시하고 measurements만 쓰라고 명시
- [x] 6. `ContextExportService`에서 도형을 ID 순으로 로드하고 `schema_version`을 1.0 → 1.1로 상향
- [x] 7. 측정 화면 Export 안내 문구에 도형·도형 라벨 포함을 반영
- [x] 8. 계약 테스트: 도형 필드·한글/특수문자 보존, `checks.json` 미포함, 도형 없는 이미지의 빈 배열
- [x] 9. 통합 테스트: 도형 ID 순서, 라벨 값, 같은 스냅샷 재현성(exported_at 제외)

### RES-007: 저장 측정의 메모 수정

- [x] 10. `MeasurementRepository.update_note` — 이미지 스코프, 메모만 갱신
- [x] 11. `MeasurementService.update_note` — 없는 이미지·측정을 각각 구분해 보고
- [x] 12. `MeasurementNoteSchema`와 `PATCH /api/images/{image_id}/measurements/{measurement_id}`; 공백만 있는 메모는 null로 저장
- [x] 13. `api.updateMeasurementNote`와 측정 목록의 행별 메모 편집 UI(좌표·항목·값 불변 안내 포함)
- [x] 14. 라우트 테스트 3건, 통합 테스트 1건(근거 필드 불변 확인), 프런트 테스트 2건

### CAT-008 / CAT-009 / UIX-008

- [x] 15. 필터 재조회 중 이전 결과 유지 — 최초 로딩만 화면을 비우고, 재조회는 `refreshing`으로 표시
- [x] 16. 현재 조건의 결과 건수 표시
- [x] 17. 홈 빈 상태의 영문 문구를 한국어로 교체하고 다음 행동을 함께 안내
- [x] 18. 목록 테스트 1건 추가

### 문서와 검증

- [x] 19. 요구사항 우선순위 표와 CTX-012 계약 버전, ANN-008 세부를 구현 결과로 갱신
- [x] 20. README 데모 흐름과 알려진 제한 갱신
- [x] 21. 낡은 Construction 산출물 갱신 — `frontend-components.md`, `frontend-components-summary.md`
- [x] 22. e2e 추가 — 메모 수정 후 값 불변 확인과, 실제 ZIP을 풀어 `data.json`의 도형·메모·`schema_version` 확인
- [x] 23. 검증 — ruff, mypy, pytest, typecheck, vitest, build, e2e

## 실행 결과 (2026-09-08)

23/23 단계 완료.

| 게이트 | 결과 |
| --- | --- |
| `ruff check .` | 통과 |
| `mypy` | 27개 소스 파일 이상 없음 |
| `pytest` (로컬 PostgreSQL 16) | 104 passed |
| `npm run typecheck` | 통과 |
| `npm run test:frontend` | 50 passed |
| `npm run build` | 성공 |
| `npm run test:e2e` (Chromium, 실제 앱) | 7 passed |

새 e2e는 브라우저가 내려받은 ZIP을 실제로 풀어 `data.json`을 검사한다. 계약을 바꾼 변경이므로 직렬화 결과를 눈으로 확인하는 대신 실제 산출물로 검증했다.

## 남은 범위

- P1: HOM-040(홈 소개 영상의 실패 대체·reduced-motion·오프라인 경로)
- P2 전체: IMG-009~010(폼 인라인 오류), UIX-003(좌표 직접 입력), UIX-004(문서 타이틀), UIX-005(건너뛰기 링크), UIX-006(에러 경계·미정의 경로), UIX-007(재시도), UIX-009(로딩 자리 확보)

P2 미구현은 데모 실패 조건이 아니다.
