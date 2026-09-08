# NANoDB Core Business Logic Generation Summary

## 생성 범위

순수 domain logic은 `src/backend/nanodb/domain/`에 생성했다. FastAPI, SQLAlchemy, PostgreSQL과 filesystem dependency 없이 Image, Measurement와 export 계약을 표현하고 계산·검증한다.

| 구현 | 경로 | 관련 규칙 |
| --- | --- | --- |
| Domain entity와 enum | `src/backend/nanodb/domain/entities.py` | BR-IMG, BR-MEA-01·09·12, BR-CTX-10 |
| Safe domain error | `src/backend/nanodb/domain/errors.py` | 수정 가능한 입력 오류와 안전한 API mapping 경계 |
| 좌표·거리·nm 계산 | `src/backend/nanodb/domain/calculations.py` | BR-MEA-02~10, BR-RES-04~07 |
| Expected summary | `src/backend/nanodb/domain/calculations.py` | BR-CTX-07~09 |
| Export snapshot validation | `src/backend/nanodb/domain/calculations.py` | BR-CTX-01~02·05·09·11·15 |

## Pure Function 계약

- `calculate_measurement`: 원본 Image 경계 안의 서로 다른 유한 좌표와 양수 보정값만 받아 server 기준 `distance_px`와 `value_nm`을 계산한다.
- `round_for_display`: 저장 float를 바꾸지 않고 `Decimal` half-up 방식으로 기본 둘째 자리 표시값을 만든다.
- `build_expected_summary`: 저장 정밀도로 평균을 계산하고 CD, Depth, Thickness 중 측정이 있는 항목만 고정 순서로 반환한다.
- `validate_export_snapshot`: measurement 존재, 단일 Image 소유권, ID 오름차순, 좌표 기반 재계산값과 expected summary 일치를 확인한다.

## Test Mapping

`tests/backend/unit/test_calculations.py`의 20개 test가 다음을 고정한다.

- `(100,100)`에서 `(400,500)`, `0.2nm/pixel`의 500px·100nm 기준 사례
- 좌표 상·하한, 동일 점, NaN과 Infinity, 0 이하 보정값 거부
- 저장 정밀도 유지와 `12.345 → 12.35` display rounding
- CD, Depth, Thickness 계약 순서와 측정 없는 항목 제외
- 다른 Image 혼입, 비결정적 ID 순서와 변조된 계산값 거부

## 생성 시 검증 결과

- Ruff: 통과
- strict mypy: 통과
- pure unit test: 20개 통과

최종 전체 test 판정은 후속 Build and Test 단계에서 다시 수행한다.

## 확장 규칙 적용 상태

- Resiliency Baseline: N/A — 비활성화됨.
- Security Baseline: N/A — 비활성화됨. 일반 요구사항의 safe error와 input validation은 유지했다.
- Property-Based Testing: N/A — 비활성화되어 승인된 example-based test만 생성했다.
