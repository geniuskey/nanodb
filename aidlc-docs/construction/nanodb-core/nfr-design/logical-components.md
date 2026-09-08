# NANoDB Core Logical Components

## Frontend

| Logical component | 책임 | 주요 의존성 |
| --- | --- | --- |
| App Router/Shell | 네 page route, navigation, 공통 error boundary | React Router 또는 동등한 최소 router |
| API Client | JSON, multipart와 ZIP response 처리, error envelope 해석 | browser fetch |
| Home Feature | 실제 summary, CTA와 roadmap 상태 | API Client |
| Image Catalog Feature | latest Image list, empty/failure state | API Client |
| Image Registration Feature | preview, form validation, submit state | API Client, browser File API |
| Measurement Feature | draft point, server result, saved selection | API Client, Coordinate Adapter |
| Coordinate Adapter | rendering rectangle과 original coordinate 상호 변환 | DOM image dimensions |
| SVG Overlay | draft/saved line과 endpoint 표시 | Coordinate Adapter |
| Export Feature | 포함 정보 안내, enablement와 ZIP download | API Client, browser download API |

Frontend는 database model이나 local filesystem path를 알지 않는다.

## Backend

| Logical component | 책임 | 주요 의존성 |
| --- | --- | --- |
| Application Factory | config loading, route와 middleware 조립 | Settings, API Routes |
| Settings | database URL, upload root, pool과 runtime profile | environment |
| Request Context | correlation ID, timing과 request-scoped log context | middleware |
| Error Mapper | domain/application error를 safe API envelope로 변환 | exception types |
| Image Routes | upload/list/detail/file transport 처리 | Image Service |
| Measurement Routes | measurement create/list transport 처리 | Measurement Service |
| Summary Route | 실제 count 조회 | Summary Service |
| Export Route | validation 후 ZIP response 제공 | Context Export Service |
| Image Service | staged upload, Image 저장과 조회 조정 | Image Repository, File Store, Image Decoder |
| Measurement Service | Image 확인, server 계산과 저장 | Repositories, Measurement Calculator |
| Summary Service | Image/Measurement count 조정 | Repositories |
| Context Export Service | snapshot validation과 네 파일 조립 | Repositories, Export Builder |
| Measurement Calculator | 좌표 validation, distance, nm와 display rounding | 없음, pure logic |
| Export Builder | allowlist serialization, summary/check와 ZIP 생성 | standard JSON/ZIP APIs |
| Image Decoder | PNG/JPEG 확인과 pixel dimension 읽기 | Pillow adapter |
| Image Repository | Image persistence와 aggregate list query | SQLAlchemy Session |
| Measurement Repository | Measurement persistence와 ordered lookup | SQLAlchemy Session |
| File Store | temporary write, atomic rename, open과 compensation delete | configured upload root |
| Database Session Provider | request/command transaction과 pool | SQLAlchemy, Psycopg, PostgreSQL |

## Build 및 Runtime Support

| Logical component | 책임 | 범위 |
| --- | --- | --- |
| Migration Runner | 빈 PostgreSQL schema 생성과 upgrade | Alembic command |
| Sample Preflight | manifest, image, dimension, calibration과 authorization 확인 | 기존 Python sample utility 확장 |
| Demo Reset | 전용 demo rows와 runtime upload를 known state로 복원 | source sample 제외 |
| Static Asset Server | production React build와 image file response | same-origin |
| Structured Logger | safe request/result/error event | local stdout/stderr |
| Readiness Check | PostgreSQL 연결과 upload root 사용 가능 여부 확인 | startup/demo 진단 |

external monitoring, queue, cache, object storage와 model API client는 포함하지 않는다.

## 주요 interface

### Repository ports

- `ImageRepository.save(image)`
- `ImageRepository.find(image_id)`
- `ImageRepository.list_with_measurement_count()`
- `ImageRepository.count()`
- `MeasurementRepository.save(measurement)`
- `MeasurementRepository.list_by_image(image_id, order)`
- `MeasurementRepository.count()`

### File Store port

- `write_temporary(stream, size_limit)`
- `promote(temporary_key, final_key)`
- `open(final_key)`
- `delete_if_exists(key)`

### Pure domain interfaces

- `to_original_point(display_point, rendered_rect, original_size)`
- `calculate_measurement(start, end, calibration)`
- `round_for_display(value, digits=2)`
- `build_expected_summary(measurements)`
- `validate_export_snapshot(image, measurements)`

정확한 language signature와 path는 Code Generation 계획에서 확정한다.

## Interaction: Image 등록

1. Registration Feature가 multipart request를 API Client로 보낸다.
2. Image Route가 transport field를 확인하고 Image Service를 호출한다.
3. Image Service가 File Store temporary write와 Image Decoder 검증을 수행한다.
4. service가 transaction 안에서 Image metadata를 준비하고 file을 final key로 promote한다.
5. commit 성공 후 Image view를 반환한다.
6. 실패하면 rollback과 가능한 file cleanup을 수행하고 Error Mapper가 safe response를 만든다.

## Interaction: Measurement 저장과 복원

1. Coordinate Adapter가 click을 original point로 변환한다.
2. Measurement Feature는 point와 parameter type만 저장 command에 사용한다.
3. Measurement Service가 Image를 읽고 Measurement Calculator로 server value를 만든다.
4. Measurement Repository가 server 결과를 저장한다.
5. UI는 반환 entity로 list와 SVG Overlay를 갱신한다.
6. reload 때 상세 API의 original point를 Coordinate Adapter가 다시 표시 좌표로 바꾼다.

## Interaction: Context Export

1. Export Feature가 포함 정보와 저장 Measurement 여부를 표시한다.
2. Export Route가 Context Export Service를 호출한다.
3. service는 한 transaction에서 선택 Image와 ordered Measurement를 읽는다.
4. Export Builder가 snapshot을 검증하고 네 UTF-8 entry를 memory 또는 bounded temporary buffer에 만든다.
5. 완전한 archive 생성 후에만 ZIP success response를 반환한다.

## Failure와 retry 경계

- validation failure는 retry하지 않고 사용자 수정이 필요한 결과로 반환한다.
- PostgreSQL 또는 filesystem failure는 자동 write retry하지 않는다.
- frontend는 실패를 표시하고 사용자가 명시적으로 다시 시도하게 한다.
- partial file은 compensation cleanup 대상이며 partial database entity는 rollback한다.
- unavailable dependency는 readiness 실패로 나타내며 가용하다고 표시하지 않는다.

## Beta 확장 seam

현재 구현에는 넣지 않지만 다음 교체 지점을 유지한다.

- Settings 기반 pool tuning
- File Store port를 통한 향후 shared storage 교체
- API boundary 앞 authentication/authorization 추가
- structured log sink와 monitoring 연결
- list pagination 추가

이 seam은 미래 변경 위치를 제한할 뿐 현재 beta capacity나 보안 준비 완료를 보장하지 않는다.

## NFR Component 매핑

| NFR 범주 | 책임 component |
| --- | --- |
| Scalability/Performance | Repository aggregate query, Session Provider, scoped Export Builder |
| Availability | Readiness Check, Migration Runner, documented startup |
| Security | Settings, File Store, Image Decoder, Export Builder, Error Mapper |
| Reliability | Services, transaction provider, File Store compensation, pure calculator |
| Maintainability | feature modules, service/adapter ports, explicit settings |
| Testability | pure domain interfaces, repository integration boundary, stable frontend components |
| Usability | page features, state model, SVG Overlay |
| Observability | Request Context, Structured Logger, Error Mapper |
