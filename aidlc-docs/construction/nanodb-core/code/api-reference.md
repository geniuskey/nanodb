# NANoDB Core API Reference

생성된 backend의 실제 HTTP 계약을 필드 단위로 정리한 참조 문서다. 상위 요약과
서비스 조립은 [api-layer-summary.md](api-layer-summary.md)를 참고한다. 모든 경로는
`/api` prefix를 가지며 backend는 built frontend와 same-origin으로 제공된다.

## 공통 규칙

- 요청/응답 본문은 UTF-8 JSON이다. 이미지 등록만 `multipart/form-data`, 파일 제공은
  이미지 media type, context export는 `application/zip`을 사용한다.
- 좌표계는 원본 이미지 픽셀 기준이다. 좌상단 원점, X 오른쪽, Y 아래이며 유효 좌표는
  `0 <= x < pixel_width`, `0 <= y < pixel_height`이다.
- 계산은 저장 정밀도로 수행하고 표시값만 소수점 둘째 자리 half-up으로 반올림한다.
- 실패 응답은 아래 error envelope를 사용한다.

### Error envelope

```json
{ "code": "IMAGE_NOT_FOUND", "message": "사용자용 메시지", "detail": { "field": "start" } }
```

- `code`: 안정적인 대문자 식별자. `detail.field`는 선택적이다.
- `*_NOT_FOUND` 코드는 HTTP 404, 그 외 도메인 규칙 위반은 422, 예상하지 못한 오류는
  일반 메시지의 500(`INTERNAL_ERROR`)으로 매핑된다.
- 응답에는 저장 파일 키, database URL, 절대 경로, secret이 포함되지 않는다.

### 도메인 error code

| Code | 의미 |
| --- | --- |
| `IMAGE_NOT_FOUND`, `IMAGE_FILE_NOT_FOUND` | 이미지 또는 저장 파일을 찾을 수 없음 |
| `REQUIRED_FIELD` | 필수 메타데이터 문자열 누락 |
| `UNSUPPORTED_IMAGE_FORMAT`, `INVALID_IMAGE_FILE`, `INVALID_IMAGE_DIMENSIONS` | 디코딩 불가·미지원 형식·비정상 크기 |
| `EMPTY_FILE`, `FILE_TOO_LARGE` | 빈 파일 또는 20MB 초과 |
| `INVALID_CALIBRATION` | 보정값이 양수 유한수가 아님 |
| `POINT_OUT_OF_BOUNDS`, `IDENTICAL_POINTS`, `NON_FINITE_NUMBER` | 좌표 범위·동일 점·비유한 좌표 |
| `INVALID_MEASUREMENT_VALUE`, `INVALID_MEASUREMENT_RESULT`, `INVALID_MEASUREMENT_ORDER` | 측정값·결과·정렬 계약 위반 |
| `NO_MEASUREMENTS`, `MIXED_IMAGE_EXPORT` | 측정 없는 export·다중 이미지 혼합 |
| `INVALID_SCHEMA_VERSION`, `INCONSISTENT_MEASUREMENT`, `INCONSISTENT_SUMMARY` | export snapshot 검증 실패 |
| `INVALID_FILE_KEY`, `INVALID_ROUNDING_DIGITS` | 내부 계약 위반(요청으로 도달 불가) |

## Endpoint

### `GET /api/health/live`

프로세스 liveness. `{ "status": "alive" }`를 반환한다.

### `GET /api/health/ready`

PostgreSQL(`SELECT 1`)과 upload root 읽기/쓰기 준비를 확인한다. 성공 시
`ReadinessView { status, database, upload_root }` 모두 `"ready"`. dependency 실패 시 오류.

### `GET /api/summary`

실제 집계를 반환한다.

- 응답 `SummaryView`: `image_count:int`, `measurement_count:int`, `calculated_at:datetime`.

### `POST /api/images`

`multipart/form-data`로 이미지를 등록한다.

- 필드: `file`(PNG/JPEG, ≤20MB), `image_type`(`SEM`|`TEM`), `product_id`, `lot_id`,
  `wafer_id`(비어 있지 않은 문자열), `calibration_nm_per_pixel`(양수 유한수).
- 성공: `ImageView`(아래). 서버가 크기·형식·보정을 재검증하고 픽셀 크기를 디코딩한다.
- 실패: `REQUIRED_FIELD`, `UNSUPPORTED_IMAGE_FORMAT`, `INVALID_IMAGE_FILE`,
  `EMPTY_FILE`, `FILE_TOO_LARGE`, `INVALID_CALIBRATION`.

### `GET /api/images`

최신순 이미지 목록.

- 응답: `ImageListView[]` = `ImageView` + `measurement_count:int`. N+1 없이 집계한다.

### `GET /api/images/{image_id}`

이미지 상세와 최신순 측정.

- 응답: `ImageDetailView` = `ImageView` + `measurements: MeasurementView[]`.
- 실패: `IMAGE_NOT_FOUND`(404).

### `GET /api/images/{image_id}/file`

저장 키로 원본 이미지 바이너리를 제공한다. 원본 filename은 경로 조합에 사용하지 않는다.

- 실패: `IMAGE_NOT_FOUND`, `IMAGE_FILE_NOT_FOUND`.

### `POST /api/images/{image_id}/measurements`

원본 좌표 두 점을 서버가 재계산·저장한다.

- 요청 `MeasurementInputSchema`: `parameter_type`(`CD`|`Depth`|`Thickness`),
  `start{ x,y }`, `end{ x,y }`(유한수), `note`(선택, ≤4000자).
- 서버가 저장 이미지의 보정값으로 `distance_px`, `value_nm`을 다시 계산한다.
  클라이언트가 보낸 값은 신뢰하지 않는다.
- 성공: `MeasurementView`. 실패: `IMAGE_NOT_FOUND`, `POINT_OUT_OF_BOUNDS`,
  `IDENTICAL_POINTS`, `NON_FINITE_NUMBER`.

### `GET /api/images/{image_id}/measurements`

해당 이미지의 최신순 측정 목록. 응답 `MeasurementView[]`. 실패 `IMAGE_NOT_FOUND`.

### `GET /api/images/{image_id}/context-export`

고정 네 파일 ZIP을 생성한다: `context.md`, `data.json`, `task.md`, `checks.json`
(UTF-8, `schema_version` `1.0`). 완전한 ZIP bytes가 만들어진 뒤에만 성공 응답한다.

- 실패: `IMAGE_NOT_FOUND`, `NO_MEASUREMENTS`(측정 없음), snapshot/생성 검증 오류.
- 이미지 바이너리·절대 경로·secret은 포함하지 않는다.

## 응답 View 필드

- `ImageView`: `id, original_filename, image_type, product_id, lot_id, wafer_id,
  calibration_nm_per_pixel, pixel_width, pixel_height, created_at, file_url`.
- `MeasurementView`: `id, image_id, parameter_type, start_x, start_y, end_x, end_y,
  distance_px, calibration_nm_per_pixel, value_nm, note, measurement_method,
  reference_status, created_at`.
- `measurement_method`는 `manual_two_point`, `reference_status`는 `unreviewed`이다.
