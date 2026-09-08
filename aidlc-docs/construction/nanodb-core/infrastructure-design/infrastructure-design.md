# NANoDB Core Infrastructure Design

## 기본 배포 단위

해커톤 기본 경로는 Docker Compose로 실행되는 PostgreSQL, migration job과 NANoDB Core app이다. React production build는 FastAPI app image에 포함해 same-origin으로 제공한다.

| Logical component | Infrastructure mapping | 지속성 |
| --- | --- | --- |
| React/Vite build | app image의 Node build stage | immutable image artifact |
| FastAPI runtime | app container의 Python runtime | stateless code, local upload 제외 |
| PostgreSQL | `postgres:16` 계열 container | named database volume |
| Migration Runner | app image를 재사용하는 one-shot Compose service | migration source는 repository에 저장 |
| Local File Store | app host의 `var/uploads`를 app container에 mount | persistent bind mount |
| Source Samples | repository의 `data/samples` read-only mount | source-controlled/authorized source |
| Structured Log | app container stdout/stderr | MVP에서는 terminal output |
| Readiness Check | app HTTP endpoint와 PostgreSQL health check | 비영속 |

exact image patch version과 dependency version은 Code Generation plan에서 실제 build 가능한 조합으로 고정한다.

## Compose 서비스

### `db`

- PostgreSQL 16 major를 사용한다.
- database, user와 password는 environment에서 주입한다.
- health check가 성공하기 전 migrate/app 준비 완료로 보지 않는다.
- data는 named volume에 저장해 container 재생성 후에도 유지한다.
- demo 기본 구성에서는 외부 network에 공개하지 않는다.

### `migrate`

- app과 같은 backend image를 사용한다.
- healthy PostgreSQL을 기다린 뒤 Alembic `upgrade head`를 실행한다.
- 성공 종료 후에만 app을 시작한다.
- migration 실패를 무시하거나 자동으로 schema를 새로 만들지 않는다.

### `app`

- multi-stage build에서 frontend를 build하고 Python runtime에 static artifact를 포함한다.
- startup 때 config, upload root와 database readiness를 확인한다.
- API와 frontend를 `127.0.0.1:8000`에 제공하는 것을 demo 기본값으로 한다.
- image file response는 database의 stored key와 configured upload root만 사용한다.

## Local 저장소

| 경로/volume | 내용 | Git 정책 | reset 정책 |
| --- | --- | --- | --- |
| PostgreSQL named volume | Image와 Measurement row | Git 제외 | demo profile에서 명시적 reset |
| `var/uploads/` | runtime 등록 이미지 | 내용 Git 제외, placeholder만 허용 | demo profile에서 명시적 reset |
| `data/samples/` | 원천 TIFF와 승인 metadata | 기존 source 정책 유지 | 절대 삭제·수정하지 않음 |
| 준비된 demo derivatives | browser 등록용 PNG/JPEG와 manifest | 승인 상태·출처 기록 | 필요 시 재생성, 원천 불변 |
| test temporary directory | test upload | Git 제외 | test 종료 시 정리 |

runtime upload와 source sample은 서로 다른 root를 사용한다. reset command는 runtime profile을 확인하고 source root가 target이면 실행을 거부해야 한다.
Source sample mount는 preflight 또는 명시적 demo preparation command에만 제공하며 regular app의 static/file-serving root에는 연결하지 않는다.

## Configuration

| 설정 | 목적 | 기본 원칙 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 연결 | secret 포함 가능, Git에 저장하지 않음 |
| `UPLOAD_ROOT` | runtime file root | workspace의 전용 `var/uploads` |
| `SAMPLE_ROOT` | read-only source sample root | runtime upload와 다른 경로 |
| `NANODB_PROFILE` | `demo`, `test`, 추후 `beta` 구분 | reset과 binding guard에 사용 |
| `APP_HOST`, `APP_PORT` | HTTP binding | demo는 loopback 기본 |
| pool size/overflow/timeout | PostgreSQL pool 조정 | 작은 MVP 기본값, environment override |
| log level | 진단 상세 수준 | secret이나 payload logging과 무관 |

`.env.example`에는 비밀이 아닌 key와 안전한 local example만 제공한다. 실제 `.env`와 credential은 Git에서 제외한다.

## Network

- Docker Compose 내부 network에서 app/migrate만 `db` service name으로 PostgreSQL에 연결한다.
- browser는 loopback의 app port만 사용한다.
- production-like demo는 same-origin이므로 CORS allowlist가 필요하지 않다.
- native frontend development에서는 Vite가 `/api`만 loopback FastAPI로 proxy한다.
- API gateway, public load balancer, TLS termination과 external ingress는 해커톤 범위에 없다.

## Readiness와 시작 순서

1. database volume과 upload directory를 준비한다.
2. PostgreSQL health check가 통과한다.
3. migration job이 current head까지 성공한다.
4. app이 database query와 upload root read/write check를 수행한다.
5. readiness endpoint가 성공한 뒤 demo 가능 상태로 표시한다.

liveness만 성공하고 database 또는 upload root가 실패한 상태를 준비 완료로 처리하지 않는다.

## Logging과 진단

- app과 migration은 stdout/stderr에 구조화된 log를 남긴다.
- request correlation ID, route, status category와 duration을 기록한다.
- database URL, password, image bytes, 전체 note와 내부 absolute path는 기록하지 않는다.
- external log service, metric collector와 alert manager는 구성하지 않는다.
- demo 실패 시 Compose service 상태, migration revision, readiness와 제한된 error category를 확인한다.

## Test Infrastructure

- unit test는 PostgreSQL이나 file store 없이 실행한다.
- integration test는 운영 demo database와 다른 test database/schema를 사용한다.
- test upload는 임시 directory를 사용하고 source sample을 변경하지 않는다.
- migration test는 빈 test PostgreSQL에 `upgrade head`를 적용한다.
- browser test는 test profile app과 test database를 사용한다.
- test cleanup이 실패해도 demo named volume이나 runtime upload를 target으로 삼지 않는다.

## Initial Internal Beta Mapping

같은 app image를 사내 single host에 배치하고 `DATABASE_URL`을 사내 PostgreSQL로, `UPLOAD_ROOT`를 host persistent directory로 바꿀 수 있다. 다음 항목은 hosting platform 결정 후 별도 설계한다.

- TLS와 reverse proxy 또는 ingress
- authentication과 authorization
- PostgreSQL 및 upload backup/restore automation
- central log와 monitoring
- capacity/load test 기반 pool과 compute size

현재 Infrastructure Design은 이 beta 항목을 구현 완료로 간주하지 않는다.

## 제외된 Infrastructure

- public cloud managed service의 선결정
- cache, queue와 background worker
- object storage, network file system과 multi-instance upload sharing
- load balancer, autoscaling과 high availability
- Kubernetes와 infrastructure-as-code platform
- NANoDB Core와 Evidence Site의 shared runtime infrastructure
