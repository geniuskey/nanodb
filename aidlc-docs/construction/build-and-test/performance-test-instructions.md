# Performance Test Instructions

## 목적

NANoDB Core의 응답성과 결정적 집계가 목표 부하에서 유지되는지 확인한다. 이 단위의
성능 목표는 해커톤과 초기 내부 beta(등록 사용자 약 1,000명 target, 검증된 동시성
보장이 아님)를 전제로 한 것이며, P0에는 전용 부하 test 하네스가 포함되지 않는다.

## 성능 기준 (NFR-PER, 목표)

- 목록·상세·summary 조회는 N+1 없이 결정적으로 반환된다(집계 query로 검증).
- context ZIP 생성은 한 read transaction snapshot에서 결정적으로 수행된다.
- 등록 사용자 약 1,000명은 target이며 동시성 보장이 아니다. 동시 활성·쓰기 사용자
  수, 내부 호스팅 플랫폼과 pool sizing은 미확정(deferred)이다.

## 접근

P0 범위에서 성능은 별도 부하 도구 없이 두 가지로 다룬다:

1. **집계 정확성·N+1 회피**: `tests/backend/integration/test_migration_and_repositories.py`가
   count·목록 집계가 N+1 없이 동작함을 검증한다(PostgreSQL 필요).
2. **경량 수동 확인(선택)**: 스택 기동 후 대표 endpoint의 응답을 관찰한다.

```bash
# 스택 기동 후(make up), 대표 endpoint 예시
curl -s -o /dev/null -w "ready %{time_total}s\n"   http://127.0.0.1:8000/api/health/ready
curl -s -o /dev/null -w "summary %{time_total}s\n" http://127.0.0.1:8000/api/summary
curl -s -o /dev/null -w "images %{time_total}s\n"  http://127.0.0.1:8000/api/images
```

부하 생성 도구(k6/JMeter 등)를 도입하려면 별도 승인이 필요하며 이 계획 범위 밖이다.

## 실제 결과 (이 환경, 2026-09-08)

**부하 test 미실행.** 전용 부하 하네스는 P0 범위에 없고, 대표 endpoint 관찰은 기동된
스택(Docker)이 필요한데 이 환경에서는 사용할 수 없다. N+1 회피는 PostgreSQL이 준비된
환경에서 integration test로 판정한다. 실제 동시성 목표 검증은 pool sizing과 부하
target이 확정된 뒤의 후속 작업이다.
