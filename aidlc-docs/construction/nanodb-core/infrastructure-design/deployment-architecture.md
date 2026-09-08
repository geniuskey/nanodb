# NANoDB Core Deployment Architecture

## Environment 구분

| Environment | 실행 형태 | 목적 | 완료 상태 |
| --- | --- | --- | --- |
| Native Development | Compose PostgreSQL + local FastAPI + Vite dev server | 빠른 개발 feedback | Code Generation에서 구성 |
| Full-stack Test | test PostgreSQL + temporary upload + backend/frontend test runners | automated verification | Code Generation에서 구성 |
| Hackathon Demo | Compose `db` → `migrate` → `app` | 한 명령에 가까운 재현 가능한 시연 | 현재 설계 target |
| Initial Internal Beta | single app host + PostgreSQL + persistent local upload | 제한된 사내 pilot | platform·보안·capacity 결정 전 미완료 |

## Hackathon Demo Topology

| Source | Target | Protocol/Path | 노출 |
| --- | --- | --- | --- |
| Desktop Browser | App | HTTP `127.0.0.1:8000` | host loopback |
| App | PostgreSQL | Compose private TCP network | host 외부 비공개 |
| Migration Job | PostgreSQL | Compose private TCP network | one-shot |
| App | Runtime Upload | mounted filesystem path | app container 내부 |
| Preflight/Reset command | Source Samples | read-only filesystem path | utility 실행에만 mount |
| App | stdout/stderr | local container log | local operator |

Source Samples는 regular app static root에 포함하거나 file endpoint로 제공하지 않는다.

## Native Development Topology

- PostgreSQL만 Compose로 실행할 수 있다.
- FastAPI는 loopback backend port에서 실행한다.
- Vite는 별도 loopback development port에서 실행하고 `/api`를 FastAPI로 proxy한다.
- runtime upload는 repository의 Git 제외 directory를 사용한다.
- production behavior 확인은 반드시 Hackathon Demo build에서도 수행한다.

## Container Build

app image는 multi-stage build를 사용한다.

1. Node stage에서 locked frontend dependency를 설치하고 Vite production bundle을 만든다.
2. Python stage에서 locked backend dependency를 설치한다.
3. frontend build artifact와 backend source만 runtime image에 복사한다.
4. source sample, test artifact, `.env`, Git metadata와 local upload content는 image에 넣지 않는다.
5. runtime은 non-root user와 writable upload mount를 사용한다.

Dockerfile의 exact base image digest 또는 patch tag는 Code Generation에서 실제 build 후 고정한다.

## Repository에 생성할 Infrastructure Artifact

| Artifact | 역할 |
| --- | --- |
| `compose.yaml` | db, migrate, app와 volume/network 정의 |
| `Dockerfile` | frontend/backend multi-stage build |
| `.dockerignore` | source sample, secret, test/cache와 runtime upload 제외 |
| `.env.example` | 필요한 config key와 local example |
| `.gitignore` 갱신 | `.env`, runtime upload, build/test output 제외 |
| Alembic config/migrations | PostgreSQL schema lifecycle |
| root task command | start, stop, migrate, test, preflight와 reset 진입점 |
| readiness endpoint | database와 upload root 확인 |

정확한 path와 command는 승인된 Code Generation plan의 single source of truth로 확정한다.

## 시작과 종료

### 시작

1. `.env.example`로 local config를 준비한다.
2. upload directory가 source sample directory와 다른지 확인한다.
3. Compose가 PostgreSQL을 시작하고 health를 기다린다.
4. migrate service가 schema를 current head로 upgrade한다.
5. app이 readiness를 통과하고 loopback port를 제공한다.

### 정상 종료

- app container와 PostgreSQL container를 종료하되 named volume과 runtime upload는 유지한다.
- data 삭제는 일반 stop 명령에 포함하지 않는다.

### Demo Reset

- `NANODB_PROFILE=demo`인지 확인한다.
- target database와 upload root를 명시적으로 확인한다.
- runtime Image/Measurement와 runtime upload만 초기화한다.
- approved demo seed가 있다면 migration 이후 다시 적용한다.
- source sample path가 target과 같거나 target이 불명확하면 중단한다.

## Failure Behavior

| Failure | 배포 결과 |
| --- | --- |
| PostgreSQL unhealthy | migration과 app readiness 실패 |
| Migration failure | app 시작 중단, 기존 schema를 자동 삭제하지 않음 |
| Upload root unavailable | readiness 실패 |
| Frontend build failure | app image 생성 실패 |
| App runtime failure | database volume과 upload content 유지 |
| Test database failure | test 실패, demo storage에 fallback하지 않음 |

## Persistence와 Recovery 경계

- PostgreSQL named volume과 runtime upload는 container lifecycle보다 오래 유지된다.
- Compose volume은 backup이 아니다.
- 해커톤은 repeatable reset과 restart persistence까지만 검증한다.
- initial beta 전 PostgreSQL dump/snapshot과 upload directory를 같은 recovery point로 보존하고 실제 restore를 연습해야 한다.
- 현재 구성은 failover, point-in-time recovery 또는 disaster recovery SLA를 제공하지 않는다.

## Network와 접근 경계

- demo default는 loopback bind다.
- PostgreSQL port는 app container가 접근하는 private network에만 둔다.
- native database debugging을 위해 port를 열 때도 loopback으로 제한한다.
- 사내 network에 bind하거나 reverse proxy 뒤에 둘 경우 authentication, TLS와 접근 정책 결정을 먼저 수행한다.

## Shared Infrastructure 판정

NANoDB Core와 Evidence Site 사이에 shared runtime infrastructure는 없다. Evidence Site는 Core의 공개 승인된 검증 결과를 build-time static input으로만 사용하므로 `shared-infrastructure.md`는 생성하지 않는다.
