# NANoDB Core NFR Requirements

## 적용 프로필

| 프로필 | 현재 목표 | 검증 수준 |
| --- | --- | --- |
| Hackathon MVP | 단일 앱 instance, 로컬 PostgreSQL, 로컬 file store, demo data 100건 이하 | 필수 build, automated test와 desktop browser demo |
| Initial Internal Beta | 약 1,000명 등록 사용자, 단일 앱 host와 PostgreSQL | 실제 concurrency profile과 load test 전에는 용량·SLA를 보장하지 않음 |

현재 구현 완료 기준은 Hackathon MVP다. Beta 항목은 구조를 막지 않도록 반영하되 해커톤 P0 범위를 확대하지 않는다.

## NFR-SCA: 확장성

- **NFR-SCA-01 (MVP)**: 하나의 application instance와 하나의 PostgreSQL database로 동작해야 한다.
- **NFR-SCA-02 (MVP)**: image binary는 단일 application host의 local file store에 둔다.
- **NFR-SCA-03 (MVP)**: database connection 설정과 pool 크기는 환경 설정으로 변경 가능해야 한다.
- **NFR-SCA-04 (Beta)**: 약 1,000명은 등록 사용자 목표일 뿐 동시 active user, 동시 upload 또는 동시 write 보장이 아니다.
- **NFR-SCA-05 (Beta)**: beta 확대 전에 예상 active/read/write/upload profile을 정하고 그 profile로 load test를 통과해야 한다.
- **NFR-SCA-06 (Beta)**: local file store 때문에 multi-instance horizontal scaling과 high availability는 현재 지원하지 않는다.

## NFR-PER: 성능

- **NFR-PER-01 (MVP)**: 최신 Chrome 또는 Edge, demo data 100건 이하의 로컬 환경에서 목록과 상세 화면이 요청 시작 후 2초 안에 표시되는 것을 목표로 한다.
- **NFR-PER-02 (MVP)**: 두 점 preview 계산은 사용자 click 직후 체감 지연 없이 client에서 수행하고, 저장 결과는 server 계산값으로 교체한다.
- **NFR-PER-03 (MVP)**: 목록 조회는 Image와 Measurement count를 행마다 반복 조회하지 않는 방식으로 구현한다.
- **NFR-PER-04 (MVP)**: export는 선택 Image의 Measurement만 읽고 전체 database나 image binary를 memory에 적재하지 않는다.
- **NFR-PER-05 (Beta)**: response time percentile과 throughput SLO는 concurrency profile을 정한 뒤 load test 결과로 확정한다.

## NFR-AVL: 가용성과 운영 경계

- **NFR-AVL-01 (MVP)**: single instance best-effort 실행이며 failover와 uptime SLA를 제공하지 않는다.
- **NFR-AVL-02 (MVP)**: PostgreSQL이나 local file store가 사용할 수 없으면 준비 상태를 성공으로 표시하지 않는다.
- **NFR-AVL-03 (MVP)**: README의 명령 1~2개로 database, migration과 app을 반복 실행할 수 있어야 한다.
- **NFR-AVL-04 (Beta)**: 사내 공유 beta 전에 PostgreSQL data와 upload directory를 같은 복구 시점 기준으로 backup하고 restore rehearsal을 수행해야 한다.
- **NFR-AVL-05 (Beta)**: broad internal exposure 전 authentication, authorization와 운영 책임자를 별도 결정해야 한다. 이는 해커톤 구현 범위가 아니다.

## NFR-SEC: 기본 데이터 보호

Security Baseline extension은 비활성화되어 있으나 승인된 기능 요구사항의 안전 경계는 유지한다.

- **NFR-SEC-01**: database credential과 기타 secret은 환경 변수 또는 제외된 local config로 주입하고 Git에 저장하지 않는다.
- **NFR-SEC-02**: upload는 20MB 제한과 실제 PNG/JPEG decoding을 모두 통과해야 한다.
- **NFR-SEC-03**: 저장 file key와 ZIP entry name에 사용자 입력 경로를 사용하지 않는다.
- **NFR-SEC-04**: API와 화면 오류에 stack trace, SQL, database URL, 내부 절대 경로와 secret을 노출하지 않는다.
- **NFR-SEC-05**: export는 선택 Image의 승인된 field만 포함하고 image binary, 전체 DB와 audit log를 제외한다.
- **NFR-SEC-06**: 외부 AI 전송은 app 밖의 사용자 활동이며 app은 자동 upload나 model API 호출을 하지 않는다.
- **NFR-SEC-07**: authentication이 없는 MVP는 local machine 또는 접근 통제된 demo network에서만 실행한다.

## NFR-REL: 신뢰성과 데이터 무결성

- **NFR-REL-01**: schema는 versioned migration으로 만들고 빈 PostgreSQL에서 재현 가능해야 한다.
- **NFR-REL-02**: foreign key, enum/check와 양수·좌표 관련 검증을 application과 가능한 database constraint에 함께 적용한다.
- **NFR-REL-03**: image file과 metadata 중 하나만 성공한 상태를 정상 Image로 노출하지 않는다.
- **NFR-REL-04**: Measurement는 client 계산값을 신뢰하지 않고 server가 원본 좌표와 저장된 calibration으로 다시 계산한다.
- **NFR-REL-05**: server restart 후 Image metadata, Measurement와 upload file을 다시 조회할 수 있어야 한다.
- **NFR-REL-06**: export는 snapshot 단위로 만들고 실패 시 partial ZIP을 성공 응답으로 제공하지 않는다.
- **NFR-REL-07**: 같은 snapshot은 `exported_at`과 ZIP metadata를 제외하면 동일한 content와 ordering을 생성해야 한다.
- **NFR-REL-08**: demo reset은 전용 demo data와 runtime upload만 대상으로 하며 source sample을 건드리지 않는다.

## NFR-MNT: 유지보수성

- **NFR-MNT-01**: frontend, API, domain/service와 persistence 경계를 분리한다.
- **NFR-MNT-02**: Python과 TypeScript의 type checking을 적용하고 public contract에는 명시적 type을 사용한다.
- **NFR-MNT-03**: lint, format, unit/integration test와 frontend build를 반복 가능한 명령으로 제공한다.
- **NFR-MNT-04**: dependency version은 lock file로 고정하고 자동 생성 migration도 review 가능한 source로 저장한다.
- **NFR-MNT-05**: 요구사항 ID, story, design rule과 test case를 추적할 수 있게 test 이름 또는 문서에 연결한다.
- **NFR-MNT-06**: local setup, migration, sample preflight, demo reset, test와 외부 AI 검증 순서를 README에 기록한다.

## NFR-TST: 테스트 가능성

- **NFR-TST-01**: 거리·환산·반올림은 database 없는 pure unit test로 검증한다.
- **NFR-TST-02**: image validation, repository와 migration은 실제 PostgreSQL을 사용하는 integration test로 검증한다.
- **NFR-TST-03**: upload→measurement→reload→export 핵심 흐름을 API 또는 browser integration test로 검증한다.
- **NFR-TST-04**: `context.md`, `data.json`, `task.md`, `checks.json` 파일명, JSON parsing, ordering, UTF-8과 expected summary를 contract test로 검증한다.
- **NFR-TST-05**: 1000×800px 기준 좌표와 50%/100% rendering 복원을 browser test로 검증한다.
- **NFR-TST-06**: Property-Based Testing extension은 비활성화되어 example-based test를 기본으로 한다.

## NFR-USA: 사용성과 접근성

- **NFR-USA-01**: 1280px 이상 desktop demo를 우선하고 최신 Chrome/Edge를 지원한다.
- **NFR-USA-02**: loading 중 중복 action을 막고 success, empty, validation error와 failure를 구분한다.
- **NFR-USA-03**: 상태를 색상만으로 전달하지 않고 text label과 message를 함께 제공한다.
- **NFR-USA-04**: form label, button name, focus order와 keyboard 접근을 유지한다. 이미지 위 point 선택은 mouse demo를 P0로 하되 대체 설명을 제공한다.
- **NFR-USA-05**: 활성 CTA와 미구현 roadmap을 시각·행동 모두에서 구분한다.
- **NFR-USA-06**: 저장 측정과 선택 overlay의 연결을 같은 강조 상태로 표시한다.

## NFR-OBS: 진단 가능성

- **NFR-OBS-01**: server는 request outcome, validation/storage/export failure와 migration 상태를 구조화된 log로 남긴다.
- **NFR-OBS-02**: log에는 secret, image binary, 전체 note와 database URL을 남기지 않는다.
- **NFR-OBS-03**: MVP는 external monitoring service나 alerting을 요구하지 않는다.

## Beta 준비 판정

PostgreSQL 선택은 1,000명 규모로 확장할 기반을 제공하지만 그 자체로 beta 준비 완료를 의미하지 않는다. 아래 항목은 broad internal beta 전 별도 gate다.

1. 실제 concurrency와 upload profile 정의
2. 해당 profile의 load test와 pool 조정
3. authentication·authorization 결정
4. PostgreSQL 및 upload directory backup/restore 검증
5. 운영 host, log·monitoring과 책임자 결정

이 gate들은 현재 해커톤 Code Generation 범위에 자동 포함되지 않는다.
