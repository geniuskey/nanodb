# 측정 라벨링 재정의 — Code Generation Plan (2026-09-08)

> 승인: 사용자가 "개선해줘." 로 리뷰 권고 실행을 승인하고, 곧이어
> "잠깐 4번 Annotation 은 필요한 요소야. 측정과 그거이 무엇인지 annotating 필요해.
> 그것 빼고는 네 추천대로 개선" 으로 방향을 정정했다.
> 근거: [audit.md](../../audit.md)의 "Requirement Correction: Measurement Labelling",
> [aidlc-state.md](../../aidlc-state.md)의 같은 제목 절.
> 대상 요구사항: ANN-001~005(재정의), IMG-002/004, CTX-004/005/012, UIX-001,
> HOM-006/008/023/040. 철회: ANN-006~008, HOM-024~027.

## 배경 — 검증된 결함 네 가지

1. `export_builder.py`의 `task.md`가 생성 코드에 annotations를 무시하라고 지시해,
   P0 컨텍스트 내보내기가 P1 라벨링 데이터를 그대로 버렸다.
2. 원 도형이 중심+가장자리(반지름)를 저장하는데 `constraints.md` 4절은 반경·곡률
   계산을 금지 범위로 명시한다.
3. `ProductType`(DRAM/Flash/Logic/Sensor)이 DB CHECK와 한 컴포넌트에만 존재하고
   어떤 요구사항 문서에도 없으며 자유 문자열 `image.product_id`와 충돌했다.
4. 근본 원인은 요구사항 문서 스스로에 기록되어 있다. ANN 절은 이미 있던 코드에서
   역으로 채워 넣은 것이라 코드가 요구사항과 대조된 적이 없다.

## 단계 결정

| 단계 | 실행 | 사유 |
| --- | --- | --- |
| Functional Design | 생략 | 새 도메인 개념을 더하지 않는다. 라벨링을 별도 엔티티에서 기존 Measurement 속성으로 접는 축소이며, 측정 삭제·수정 규칙을 그대로 따른다. |
| NFR Requirements | 생략 | 기술 스택·성능 목표 변화 없음. 테이블 하나와 라우트가 줄어든다. |
| NFR Design | 생략 | NFR Requirements를 생략했으므로 함께 생략한다. |
| Infrastructure Design | 생략 | 배포 구성 변화 없음. migration 하나가 추가될 뿐이다. |
| Code Generation | 실행 | 아래 실행 단계 수행 |

## 실행 단계

### 백엔드

- [x] 1. `Annotation` 엔티티·`AnnotationService`·`AnnotationRepository`·라우트·스키마 삭제
- [x] 2. `Measurement.label`(선택, ≤255자), `Image.process_step`(선택, ≤255자) 추가
- [x] 3. Alembic migration `20260908_0004_measurement_annotation.py` — annotations 테이블 drop, 두 컬럼 add
- [x] 4. `POST` 측정에 `label` 입력 수용, `MeasurementAnnotationSchema`(label+note)로 PATCH 전체 교체
- [x] 5. `export_builder.py`에서 annotations 배열과 "도형 무시" 지시 삭제, 측정마다 label/note 포함, `schema_version` 1.1 → 2.0
- [x] 6. `ProductType` CHECK 제거(자유 문자열 `product_id`로 일원화)

### 프런트엔드

- [x] 7. `AnnotationLayer.tsx` 삭제, 도형 도구·도형 표 제거
- [x] 8. 측정 저장 시 라벨 입력, 저장 측정선 옆 캡션(`measurement-label`), 라벨·메모 함께 수정
- [x] 9. 이미지 등록에 공정 Step 선택 입력(`registration-process-step`), 이미지 정보 패널에 표시
- [x] 10. 홈: P2 로드맵 탭 6개 제거, "왜 지금인가" 공개 통계 섹션 제거, 최근 이미지 카드 링크화, 소개 영상 로컬 `<video>`로 교체
- [x] 11. Phase 2 카드를 실제 미구현 작업(측정 항목 마스터, 일괄 등록·내보내기)으로 정정

### 문서

- [x] 12. `requirements/nanodb-mvp-requirements.md` 3.7절 재작성, API 표를 실제 13개 엔드포인트로 교체, 개정 2 근거 기록
- [x] 13. `requirements/home-tab-requirements.md`, `requirements/constraints.md`, 통합 requirements 정정
- [x] 14. 프런트엔드 설계·요약 문서, `api-reference.md`(schema_version 1.0 오기와 누락된 delete/patch 엔드포인트) 정정
- [x] 15. `README.md`, `docs/index.md`, `docs/evidence.md` 정정

### 검증과 마감

- [x] 16. Dockerfile·.dockerignore에 `assets/video` 포함, 컨테이너 스택 재빌드·기동
- [x] 17. demo 재적재, 스크린샷 재생성(공정 Step·측정 라벨 반영)
- [x] 18. 게이트 재실행

## 실행 결과 (2026-09-08)

18/18 단계 완료. 도형 삭제로 백엔드 테스트 6건이 줄어 104 → 98이 됐다.

### 검증

| 게이트 | 결과 |
| --- | --- |
| `ruff check .` | 통과 |
| `mypy` | 26개 소스 파일 이상 없음 |
| `pytest` (컨테이너 PostgreSQL 16, `TEST_DATABASE_URL` 지정) | 98 passed, skip 없음 |
| `npm run typecheck` (`tsc -b`) | 통과 |
| `vitest run` | 66 passed (7 files) |
| `vite build` | 성공 |
| `docker compose up --build --wait` | app·db healthy, migrate exited 0 |
| `npm run test:e2e` (Chromium, 실제 앱 + PostgreSQL) | 7 passed |

### 구현 중 발견해 함께 고친 것

- 컨테이너 프런트 빌드가 `assets/video/nanodb_intro.mp4`를 찾지 못해 실패했다.
  HomePage가 로컬 영상을 import하는데 Dockerfile이 `assets/logo`만 복사하고
  `.dockerignore`가 `assets/`를 제외하고 있었다. `assets/video` 복사 줄과
  `!assets/video/` 재포함을 추가했다.
- 스크린샷 캡처 스크립트가 공정 Step과 측정 라벨을 입력하지 않아, 재정의된 화면이
  증거에 드러나지 않았다. 등록에 `Gate Etch`, 측정에 `Gate CD`를 입력하도록 고쳤다.

### 의도적으로 손대지 않은 것

US-07 실행 증거(`validation/external-ai/exports/`, `results/run-*.md`)는 당시 계약인
`schema_version` 1.1 그대로 보존했다. 실행 기록을 나중에 고쳐 쓰면 증거가 아니게 된다.
앞을 향한 계약 문서만 2.0으로 옮기고 그 간극을 validation README에 적었다.
같은 이유로 이전 유닛의 검증 수치(97/104 등)도 그대로 두었다.
