# NANoDB Core Repository Generation Summary

## 생성 범위

| 영역 | 경로 | 구현 내용 |
| --- | --- | --- |
| ORM model | `src/backend/nanodb/persistence/models.py` | Image·Measurement table과 relationship, enum/check/positive constraint, query index |
| Session boundary | `src/backend/nanodb/persistence/database.py` | configurable synchronous engine, one-commit success와 rollback failure scope |
| Repository | `src/backend/nanodb/persistence/repositories.py` | create/find/count, Image aggregate list, 최신순·export순 Measurement query |
| Migration | `alembic/versions/20260908_0001_create_core_tables.py` | 빈 PostgreSQL에서 두 table, constraint와 index 생성 |
| Integration test | `tests/backend/integration/` | migration, constraint/rollback, aggregate/order, fresh-session persistence |

## Schema와 소유권

- `images`는 등록 metadata와 system-generated stored key를 보존한다.
- `measurements`는 하나의 Image를 foreign key로 참조하고 삭제 cascade를 사용하지 않는다.
- 보정값, pixel dimension, distance와 nm 값에는 DB가 독립적으로 확인 가능한 양수 제약을 둔다.
- 좌표는 비음수이고 두 점은 달라야 한다. Image 크기 상한과 server 재계산은 application service에서 검증한다.
- timestamp는 timezone-aware PostgreSQL 값으로 생성한다.

## Query와 Transaction 계약

- Image catalog는 outer join과 group-by 한 번으로 Measurement count를 결합해 N+1을 피한다.
- catalog는 `created_at DESC, id DESC`, 화면 Measurement는 `created_at DESC, id DESC`, export Measurement는 `id ASC`다.
- write scope는 성공 시 한 번 commit하고 어떤 예외에서도 rollback한 뒤 session을 닫는다.
- database URL, pool size, overflow와 timeout은 session factory 입력이며 후속 Settings가 environment에 연결한다.

## NFR 추적성

| NFR | 반영 |
| --- | --- |
| NFR-PER-03 | aggregate catalog query로 per-row count query 방지 |
| NFR-REL-01 | Alembic initial revision과 offline PostgreSQL SQL 생성 검증 |
| NFR-REL-02 | foreign key, enum/check, 양수·비음수·distinct point 제약 |
| NFR-REL-05 | commit 후 새 session에서 record 복원 test |
| NFR-MNT-04 | migration source를 repository에 저장 |
| NFR-TST-02 | `_test` database guard가 있는 실제 PostgreSQL integration test |

## 생성 시 검증 결과

- Ruff와 formatting: 통과
- strict mypy: 통과
- Alembic PostgreSQL offline SQL: Image·Measurement table 생성 확인
- Integration test collection: 4개 확인
- Integration execution: Docker daemon과 `TEST_DATABASE_URL`이 없어 4개 모두 명시적으로 skip. mock DB fallback은 사용하지 않았으며 후속 Build and Test에서 실제 PostgreSQL로 실행한다.

## 확장 규칙 적용 상태

- Resiliency Baseline: N/A — 비활성화됨.
- Security Baseline: N/A — 비활성화됨. 승인된 secret 분리와 DB/input 무결성 경계는 유지했다.
- Property-Based Testing: N/A — 비활성화되어 example-based integration test를 생성했다.
