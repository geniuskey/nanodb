# API 레퍼런스

NANoDB 백엔드가 제공하는 HTTP API의 전체 레퍼런스입니다. 모든 엔드포인트는 실제 소스(`src/backend/nanodb/api/`)에서 확인한 라우트, 스키마, 에러 규약만을 반영합니다.

관련 문서: [개요](/guide/) · [개발 환경](/guide/getting-started) · [아키텍처](/guide/architecture) · [백엔드](/guide/backend) · [프론트엔드](/guide/frontend) · [데이터 모델](/guide/data-model) · [컨텍스트 내보내기](/guide/context-export) · [테스트·빌드·배포](/guide/testing-and-ci) · [용어집](/guide/glossary) · [확장·기여](/guide/contributing)

## 개요

- **Base path**: 모든 라우트는 `APIRouter(prefix="/api")` 아래에 있습니다. 즉 이 문서의 경로는 모두 `/api`로 시작합니다.
- **Content type**: 요청/응답 본문은 JSON(`application/json`)이 기본입니다. 예외는 이미지 등록(`multipart/form-data`)과 파일 응답 계열(`FileResponse`, `image/tiff`, `application/zip`)입니다.
- **인증**: 현재 범위에서는 인증·인가가 **없습니다**. 이 API는 내부용(INTERNAL)으로 설계되어 있으며, 신뢰된 네트워크 뒤에서 운영하는 것을 전제로 합니다. 공개 노출 시에는 별도 게이트웨이가 필요합니다.
- **상관관계 ID**: 미들웨어(`api/middleware.py`)가 모든 요청에 상관관계 ID를 부여합니다. 요청 헤더 `x-correlation-id`를 주면 그대로 사용하고, 없으면 서버가 생성합니다. 응답 헤더 `x-correlation-id`로 되돌려주며, 요청 완료 로그(`method`, `route`, `status`, `duration_ms`)에도 기록됩니다. 장애 추적 시 이 값을 함께 전달하세요.
- **자동 문서**: FastAPI 앱(`api/app.py`)은 `FastAPI(title="NANoDB Core", version="0.1.0")`로 생성되며 `docs_url`/`openapi_url`을 끄지 않았습니다. 따라서 기본값 그대로 대화형 문서 `\/docs`(Swagger UI), `\/redoc`, 스키마 `\/openapi.json`이 활성화되어 있습니다. 다만 이들은 `/api` 접두사 밖의 루트 경로이며, 프론트엔드 정적 파일 라우트(`/{frontend_path:path}`)와 공존합니다.

::: warning 프론트엔드 catch-all 주의
`api/app.py`의 `_install_frontend`는 빌드된 프론트엔드가 있을 때 `GET /{frontend_path:path}` catch-all을 등록합니다. `/api/*`가 아닌 경로는 이 catch-all이 처리하므로, 새 API 라우트는 반드시 `/api` 접두사(라우터 사용) 안에 두어야 합니다.
:::

## 공통 규약

- **경로 파라미터**: `{image_id}`, `{measurement_id}`, `{option_id}`, `{item_id}`는 정수입니다. 정수로 파싱할 수 없으면 FastAPI가 `422`를 반환합니다(도메인 에러 아님).
- **본문 검증 실패**: Pydantic 스키마 위반은 FastAPI 기본 `422`(`detail` 배열 형태)로 반환됩니다. 이는 아래 [에러 응답 규약](#에러-응답-규약)의 도메인 에러 봉투와 형식이 다릅니다.
- **날짜/시간**: `created_at`, `adjusted_at` 등은 ISO 8601 `datetime`입니다.
- **enum 값**:
  - `measurement_type`: `length`(2점, 값 단위 nm) · `angle`(3점, 첫 점이 꼭짓점, 값 단위 deg) · `curvature`(3점, 원 적합 반지름 nm)
  - `source`: `manual` · `auto`
  - `reference_status`: 현재 `unreviewed`만 존재
  - `catalog category`: `image_type` · `product_id` · `lot_id` · `wafer_id` · `process_step`

---

## 엔드포인트 레퍼런스

### Health

| 메서드 | 경로 | 설명 | 성공 |
| --- | --- | --- | --- |
| GET | `/api/health/live` | 프로세스 생존 확인 | `200` |
| GET | `/api/health/ready` | DB `SELECT 1` + 업로드 저장소 read/write 점검 | `200` |

`GET /api/health/live` 응답:

```json
{ "status": "alive" }
```

`GET /api/health/ready` 응답(`ReadinessView`): DB나 파일 저장소 점검이 실패하면 예외가 발생해 준비되지 않은 상태로 나타납니다.

```json
{ "status": "ready", "database": "ready", "upload_root": "ready" }
```

### Summary

| 메서드 | 경로 | 설명 | 성공 |
| --- | --- | --- | --- |
| GET | `/api/summary` | 전체 이미지·측정 집계 | `200` |

응답(`SummaryView`):

```json
{
  "image_count": 12,
  "measurement_count": 87,
  "calculated_at": "2026-09-09T04:00:00Z",
  "types": [
    {
      "measurement_type": "length",
      "unit": "nm",
      "count": 54,
      "mean": 128.4,
      "min": 11.2,
      "max": 402.9
    }
  ]
}
```

### Images

| 메서드 | 경로 | 설명 | 성공 |
| --- | --- | --- | --- |
| POST | `/api/images` | 이미지 등록(multipart) | `201` |
| GET | `/api/images` | 이미지 목록(필터 지원) | `200` |
| GET | `/api/images/{image_id}` | 이미지 상세 + 측정 목록 | `200` |
| PATCH | `/api/images/{image_id}` | 이미지 메타데이터 수정 | `200` |
| GET | `/api/images/{image_id}/file` | 원본 이미지 파일 다운로드 | `200` |
| DELETE | `/api/images/{image_id}` | 이미지 삭제 | `204` |

#### POST /api/images

`multipart/form-data`. 폼 필드:

| 필드 | 타입 | 필수 | 비고 |
| --- | --- | --- | --- |
| `file` | 파일(UploadFile) | 예 | 원본 이미지. 20MB 이하, 비어 있으면 안 됨 |
| `image_type` | string | 예 | |
| `product_id` | string | 예 | |
| `lot_id` | string | 예 | |
| `wafer_id` | string | 예 | |
| `calibration_nm_per_pixel` | float | 예 | 픽셀당 나노미터 |
| `process_step` | string | 아니오 | 기본 `null` |
| `note` | string | 아니오 | 기본 `null` |

응답(`ImageView`, `201`):

```json
{
  "id": 7,
  "original_filename": "wafer-01.tif",
  "image_type": "SEM",
  "product_id": "P-100",
  "lot_id": "L-22",
  "wafer_id": "W-3",
  "process_step": "etch",
  "note": null,
  "calibration_nm_per_pixel": 0.85,
  "pixel_width": 2048,
  "pixel_height": 2048,
  "created_at": "2026-09-09T03:59:00Z",
  "file_url": "/api/images/7/file"
}
```

주요 에러: `FILE_TOO_LARGE`(20MB 초과, `field: file`) · `EMPTY_FILE` · `INVALID_IMAGE_FILE` · `UNSUPPORTED_IMAGE_FORMAT` · `INVALID_IMAGE_DIMENSIONS`.

#### GET /api/images

쿼리 파라미터(모두 선택):

| 파라미터 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `q` | string | ≤200자 | 자유 텍스트 검색 |
| `image_type` | string | ≤64자 | 이미지 타입 필터 |
| `product_id` | string | ≤255자 | 제품 ID 필터 |

응답: `ImageListView[]` — `ImageView`의 모든 필드에 `measurement_count`(정수)를 더한 형태.

#### GET /api/images/{image_id}

응답: `ImageDetailView` — `ImageView` 필드에 `measurements: MeasurementView[]`(해당 이미지의 측정 목록)를 더한 형태.

#### PATCH /api/images/{image_id}

본문(`ImageUpdateSchema`). 업로드된 파일·픽셀 크기·등록일은 변경 불가이며, 등록 시 입력한 항목만 수정합니다.

| 필드 | 타입 | 제약 |
| --- | --- | --- |
| `image_type` | string | 1–64자 |
| `product_id` | string | 1–255자 |
| `lot_id` | string | 1–255자 |
| `wafer_id` | string | 1–255자 |
| `process_step` | string \| null | ≤255자 |
| `note` | string \| null | ≤4000자 |
| `calibration_nm_per_pixel` | float | `> 0` |

::: tip 캘리브레이션 변경 의미
캘리브레이션을 바꿔도 이미 저장된 측정값은 그대로 유지됩니다. 각 측정은 계산 당시의 캘리브레이션을 보존하며, 변경은 이후 새로 만든 측정에만 적용됩니다.
:::

응답: `ImageView`(`200`). 주요 에러: `IMAGE_NOT_FOUND`.

#### GET /api/images/{image_id}/file

원본 이미지 바이너리(`FileResponse`). 주요 에러: `IMAGE_NOT_FOUND`, `IMAGE_FILE_NOT_FOUND`.

#### DELETE /api/images/{image_id}

성공 시 본문 없이 `204`. 주요 에러: `IMAGE_NOT_FOUND`.

### Measurements

측정은 이미지에 종속됩니다(`/api/images/{image_id}/measurements`).

| 메서드 | 경로 | 설명 | 성공 |
| --- | --- | --- | --- |
| POST | `/api/images/{image_id}/measurements` | 측정 생성(서버가 값 계산) | `201` |
| GET | `/api/images/{image_id}/measurements` | 이미지의 측정 목록 | `200` |
| PATCH | `/api/images/{image_id}/measurements/{measurement_id}` | 라벨·노트(주석) 수정 | `200` |
| PATCH | `/api/images/{image_id}/measurements/{measurement_id}/geometry` | 점 좌표 교정 후 재계산 | `200` |
| POST | `/api/images/{image_id}/measurements/{measurement_id}/geometry/reset` | 최초 생성 geometry로 되돌림 | `200` |
| DELETE | `/api/images/{image_id}/measurements/{measurement_id}` | 측정 삭제 | `204` |

#### POST .../measurements

본문(`MeasurementInputSchema`):

| 필드 | 타입 | 제약 |
| --- | --- | --- |
| `measurement_type` | enum | `length`/`angle`/`curvature` |
| `points` | `{x,y}[]` | 2–3개(타입에 맞게). 좌표는 유한 실수 |
| `item_id` | int \| null | 제품별 측정 항목 연결(선택) |
| `label` | string \| null | ≤255자 |
| `note` | string \| null | ≤4000자 |

값(`value`)과 단위(`unit`)는 서버가 `measurement_type`·캘리브레이션·점 좌표로 계산합니다. 클라이언트가 보낸 값은 신뢰하지 않습니다.

응답(`MeasurementView`, `201`):

```json
{
  "id": 41,
  "image_id": 7,
  "item_id": null,
  "measurement_type": "length",
  "points": [ { "x": 100.0, "y": 220.5 }, { "x": 340.0, "y": 221.0 } ],
  "value": 204.1,
  "unit": "nm",
  "calibration_nm_per_pixel": 0.85,
  "label": "CD-line",
  "note": null,
  "measurement_method": "two_point_length",
  "source": "manual",
  "confidence": null,
  "reference_status": "unreviewed",
  "original_points": null,
  "original_value": null,
  "adjusted_at": null,
  "created_at": "2026-09-09T04:01:00Z"
}
```

`MeasurementView` 필드 설명:

| 필드 | 의미 |
| --- | --- |
| `points`/`value` | 현재 상태의 점과 값 |
| `source` | `manual`(사람) 또는 `auto`(특징 추출기 생성) |
| `confidence` | `auto`일 때만 0..1 자기추정값, `manual`은 `null` |
| `original_points`/`original_value`/`adjusted_at` | 교정 이력. 사람이 점을 옮긴 순간 `adjusted_at`이 채워지고, 최초 생성 시점의 점·값이 `original_*`에 남습니다. 미교정 상태면 셋 다 `null` |

주요 에러: `IMAGE_NOT_FOUND` · `INVALID_POINT_COUNT` · `IDENTICAL_POINTS` · `DEGENERATE_ANGLE` · `COLLINEAR_POINTS` · `POINT_OUT_OF_BOUNDS` · `INVALID_CALIBRATION`.

#### PATCH .../{measurement_id} (주석)

본문(`MeasurementAnnotationSchema`): `label`, `note`(둘 다 선택, 위 제약과 동일). 측정 증거(점·값)는 불변이며 주석만 함께 교체됩니다. 응답: `MeasurementView`.

#### PATCH .../{measurement_id}/geometry

본문(`MeasurementGeometrySchema`): `points`(2–3개). 점 개수는 저장된 타입과 일치해야 합니다. 타입·캘리브레이션은 그대로 두고 값을 서버에서 재계산합니다. 응답: `MeasurementView`(교정 후 `adjusted_at`·`original_*` 채워짐).

#### POST .../{measurement_id}/geometry/reset

교정한 측정을 최초 생성 geometry로 되돌립니다. 응답: `MeasurementView`. 아직 교정되지 않은 측정에 호출하면 `MEASUREMENT_NOT_ADJUSTED`(**409**).

#### DELETE .../{measurement_id}

`204`. 주요 에러: `MEASUREMENT_NOT_FOUND`.

### Catalog

등록 콤보박스에 들어가는 관리형 조회 목록입니다.

| 메서드 | 경로 | 설명 | 성공 |
| --- | --- | --- | --- |
| GET | `/api/catalog` | 전체 옵션 목록 | `200` |
| POST | `/api/catalog` | 옵션 생성 | `201` |
| PATCH | `/api/catalog/{option_id}` | 옵션 값 변경(rename) | `200` |
| DELETE | `/api/catalog/{option_id}` | 옵션 삭제 | `204` |

`POST /api/catalog` 본문(`CatalogCreateSchema`): `category`(enum), `value`(1–255자).
`PATCH /api/catalog/{option_id}` 본문(`CatalogUpdateSchema`): `value`(1–255자).

응답(`CatalogOptionView`):

```json
{ "id": 3, "category": "image_type", "value": "SEM", "is_predefined": true }
```

주요 에러: `OPTION_NOT_FOUND` · `DUPLICATE_OPTION` · `PREDEFINED_OPTION`(사전 정의 옵션 변경/삭제 시) · `VALUE_TOO_LONG` · `REQUIRED_FIELD`.

### Measurement Items

제품별 측정 항목 정의입니다.

| 메서드 | 경로 | 설명 | 성공 |
| --- | --- | --- | --- |
| GET | `/api/measurement-items?product_id=...` | 제품의 항목 목록 | `200` |
| POST | `/api/measurement-items` | 항목 생성 | `201` |
| PATCH | `/api/measurement-items/{item_id}` | 항목 수정 | `200` |
| DELETE | `/api/measurement-items/{item_id}` | 항목 삭제 | `204` |

`GET`의 `product_id`는 **필수 쿼리 파라미터**(1–255자)입니다.
`POST` 본문(`MeasurementItemCreateSchema`): `product_id`(1–255자), `name`(1–255자), `measurement_type`(enum).
`PATCH` 본문(`MeasurementItemUpdateSchema`): `name`(1–255자), `measurement_type`(enum). — `product_id`는 변경 대상이 아님.

응답(`MeasurementItemView`):

```json
{
  "id": 9,
  "product_id": "P-100",
  "name": "Gate CD",
  "measurement_type": "length",
  "created_at": "2026-09-09T02:00:00Z"
}
```

주요 에러: `MEASUREMENT_ITEM_NOT_FOUND` · `DUPLICATE_MEASUREMENT_ITEM` · `REQUIRED_FIELD`.

### Segmentation

| 메서드 | 경로 | 설명 | 성공 |
| --- | --- | --- | --- |
| POST | `/api/images/{image_id}/segmentation` | 세그멘테이션 실행 | `200` |
| GET | `/api/images/{image_id}/segmentation` | 저장된 세그멘테이션 결과 조회 | `200` |
| GET | `/api/images/{image_id}/segmentation/{variant}` | 결과 이미지(`map`/`boundary`) 다운로드 | `200` |
| POST | `/api/segmentation/batch` | 여러 이미지 일괄 처리 | `200` |

#### POST .../segmentation

본문(`SegmentationRequestSchema`, 선택 — 없으면 전부 기본값):

| 필드 | 타입 | 기본 | 제약 |
| --- | --- | --- | --- |
| `classes` | int | 4 | 2–6 |
| `denoise_weight` | float | 0.08 | `> 0` |
| `min_size` | int | 400 | `≥ 0` |

응답(`SegmentationResultView`):

```json
{
  "image_id": 7,
  "method": "multi_otsu",
  "classes": 4,
  "denoise_weight": 0.08,
  "min_size": 400,
  "thresholds": [45.0, 98.0, 160.0],
  "class_stats": [
    {
      "class_index": 0,
      "intensity_range": [0.0, 45.0],
      "pixels": 120344,
      "area_fraction": 0.29,
      "mean_intensity": 22.1,
      "area_nm2": 86900.0
    }
  ],
  "duration_ms": 412,
  "downscaled": false,
  "has_tagged_tiff": true,
  "map_url": "/api/images/7/segmentation/map",
  "boundary_url": "/api/images/7/segmentation/boundary",
  "created_at": "2026-09-09T04:05:00Z",
  "replaced": true
}
```

`replaced`는 이번 실행이 같은 이미지의 이전 결과를 대체했을 때 `true`이며, 단순 `GET` 조회에서는 항상 `false`입니다.

#### GET .../segmentation/{variant}

`variant`는 `map` 또는 `boundary`. 결과 이미지를 `FileResponse`로 반환합니다. 그 외 값은 `INVALID_SEGMENTATION_VARIANT`(**400**, `field: variant`).

#### POST /api/segmentation/batch

본문(`SegmentationBatchRequestSchema`):

| 필드 | 타입 | 기본 | 제약 |
| --- | --- | --- | --- |
| `image_ids` | int[] | — | 1–200개 |
| `classes` | int | 4 | 2–6 |
| `denoise_weight` | float | 0.08 | `> 0` |
| `min_size` | int | 400 | `≥ 0` |
| `extract_features` | bool | false | true면 각 이미지 세그멘테이션 후 특징 추출 실행 |
| `target_class` | int | 0 | 0–5 (특징 추출 대상 클래스) |

응답(`SegmentationBatchResultView`): 배치는 개별 이미지 실패를 전체 실패로 만들지 않고 항목별로 집계합니다.

```json
{
  "requested": 3,
  "succeeded": 2,
  "failed": 1,
  "items": [
    { "image_id": 7, "status": "ok", "replaced": true, "feature_count": 5, "skipped_count": 1, "code": null, "message": null },
    { "image_id": 8, "status": "error", "replaced": false, "feature_count": null, "skipped_count": null, "code": "UNSEGMENTABLE_IMAGE", "message": "..." }
  ]
}
```

주요 에러(개별 실행): `IMAGE_NOT_FOUND` · `INVALID_SEGMENTATION_CLASSES` · `UNSEGMENTABLE_IMAGE`.

### Features

| 메서드 | 경로 | 설명 | 성공 |
| --- | --- | --- | --- |
| POST | `/api/images/{image_id}/features` | 세그멘테이션 결과에서 자동 측정 추출 | `200` |

본문(`FeatureExtractionRequestSchema`, 선택 — 없으면 전부 기본값):

| 필드 | 타입 | 기본 | 제약 |
| --- | --- | --- | --- |
| `target_class` | int | 0 | 0–5 (0 = 가장 어두운 클래스) |
| `min_area` | int | 200 | `≥ 0` |
| `curvature_frac` | float | 0.6 | `0 < x ≤ 1` |
| `sidewall_band` | float[2] | `[0.2, 0.8]` | `[low, high]`, `0 ≤ low < high ≤ 1` |
| `max_radius_factor` | float | 3.0 | `> 0` |

응답(`FeatureExtractionResultView`):

```json
{
  "image_id": 7,
  "target_class": 0,
  "region_area_px": 120344,
  "region_clipped": false,
  "measurements": [ /* MeasurementView[] (source: "auto") */ ],
  "skipped": [ { "key": "left_sidewall", "reason": "degenerate geometry" } ],
  "preserved_adjusted": 2
}
```

`measurements`는 이번 실행에서 저장된 자동 측정(이미지 상세에도 나타남)입니다. `skipped`는 방출되지 않은 특징을 이유와 함께 정직하게 남깁니다. `preserved_adjusted`는 사람이 교정해 둔 자동 측정을 이번 실행이 대체하지 않고 그대로 둔 개수입니다.

### Tagged / Context Export

| 메서드 | 경로 | 설명 | 성공 | Content-Type |
| --- | --- | --- | --- | --- |
| GET | `/api/images/{image_id}/tagged` | 태그가 삽입된 TIFF 사본 | `200` | `image/tiff` |
| GET | `/api/images/{image_id}/context-export` | 이미지 컨텍스트 번들 | `200` | `application/zip` |

`GET .../tagged`는 TIFF 원본에 대해서만 제공됩니다. TIFF가 아니면 `IMAGE_NOT_TIFF`(**409**), 태그 사본이 없으면 `TAGGED_IMAGE_NOT_FOUND`.

`GET .../context-export`는 `application/zip`을 반환하며 `Content-Disposition: attachment; filename="nanodb-image-{id}.zip"` 헤더를 붙입니다. ZIP 내부 구성(포함 파일, 스키마 버전 등)은 [컨텍스트 내보내기](/guide/context-export) 문서를 참고하세요. 주요 에러: `IMAGE_NOT_FOUND`.

---

## 에러 응답 규약

도메인 규칙 위반(`DomainError`)은 `api/errors.py`의 핸들러가 일관된 JSON 봉투로 변환합니다(`ErrorEnvelope`):

```json
{
  "code": "IMAGE_NOT_FOUND",
  "message": "Image was not found.",
  "detail": { "field": "file" }
}
```

- `code`: 기계 판독용 에러 코드(문자열).
- `message`: 사람이 읽는 설명.
- `detail`: 선택. 특정 입력 필드와 관련될 때 `{ "field": "<name>" }`이 채워지고, 아니면 `null`.

### 상태 코드 매핑

`DomainError`의 HTTP 상태는 `api/errors.py`에서 다음 규칙으로 정해집니다:

| 조건 | 상태 |
| --- | --- |
| `status`가 명시된 에러 | 그 값 그대로 |
| 코드가 `_NOT_FOUND`로 끝남 | `404` |
| 그 외 모든 교정 가능 실패 | `422` |
| 예상치 못한 예외(도메인 외) | `500`, `code: INTERNAL_ERROR` |

명시적 상태를 쓰는 에러(코드가 `_NOT_FOUND`가 아니어도 아래 상태로 나감):

| code | status | 발생 지점 |
| --- | --- | --- |
| `MEASUREMENT_NOT_ADJUSTED` | 409 | 교정되지 않은 측정에 geometry reset 호출 |
| `IMAGE_NOT_TIFF` | 409 | TIFF가 아닌 이미지에 tagged 요청 |
| `INVALID_SEGMENTATION_VARIANT` | 400 | `map`/`boundary` 외 variant 요청 |

::: warning 두 가지 다른 에러 형식
- **도메인 에러**: 위 `ErrorEnvelope` 형식(`code`/`message`/`detail`).
- **FastAPI 검증 에러**: Pydantic 스키마 위반 및 경로 파라미터 파싱 실패는 FastAPI 기본 `422`(`{"detail": [...]}` 배열)로 반환됩니다. 클라이언트는 두 형식을 모두 처리해야 합니다.

예상치 못한 서버 오류는 상관관계 ID와 함께 로그로만 남고, 응답에는 내부 정보를 노출하지 않는 일반 `500` 봉투가 반환됩니다.
:::

### 주요 에러 코드 목록

| code | 대략적 의미 | 상태(기본) |
| --- | --- | --- |
| `IMAGE_NOT_FOUND` / `MEASUREMENT_NOT_FOUND` / `OPTION_NOT_FOUND` / `MEASUREMENT_ITEM_NOT_FOUND` / `IMAGE_FILE_NOT_FOUND` / `DERIVED_FILE_NOT_FOUND` / `TAGGED_IMAGE_NOT_FOUND` | 리소스 없음 | 404 |
| `FILE_TOO_LARGE` (20MB 초과) / `EMPTY_FILE` / `INVALID_IMAGE_FILE` / `UNSUPPORTED_IMAGE_FORMAT` / `INVALID_IMAGE_DIMENSIONS` | 업로드 파일 문제 | 422 |
| `INVALID_POINT_COUNT` / `IDENTICAL_POINTS` / `DEGENERATE_ANGLE` / `COLLINEAR_POINTS` / `POINT_OUT_OF_BOUNDS` / `INVALID_CALIBRATION` / `NON_FINITE_NUMBER` | 측정 계산 입력 문제 | 422 |
| `DUPLICATE_OPTION` / `PREDEFINED_OPTION` / `VALUE_TOO_LONG` / `REQUIRED_FIELD` | 카탈로그 규칙 | 422 |
| `DUPLICATE_MEASUREMENT_ITEM` | 측정 항목 중복 | 422 |
| `INVALID_SEGMENTATION_CLASSES` / `UNSEGMENTABLE_IMAGE` | 세그멘테이션 실패 | 422 |
| `MEASUREMENT_NOT_ADJUSTED` / `IMAGE_NOT_TIFF` | 상태 충돌 | 409 |
| `INVALID_SEGMENTATION_VARIANT` | 잘못된 variant | 400 |
| `INTERNAL_ERROR` | 예기치 못한 실패 | 500 |

---

## curl 예시

이미지 등록(multipart):

```bash
curl -X POST http://localhost:8000/api/images \
  -F "file=@wafer-01.tif" \
  -F "image_type=SEM" \
  -F "product_id=P-100" \
  -F "lot_id=L-22" \
  -F "wafer_id=W-3" \
  -F "calibration_nm_per_pixel=0.85" \
  -F "process_step=etch"
```

측정 생성(길이, 2점):

```bash
curl -X POST http://localhost:8000/api/images/7/measurements \
  -H "Content-Type: application/json" \
  -d '{
    "measurement_type": "length",
    "points": [ { "x": 100, "y": 220.5 }, { "x": 340, "y": 221 } ],
    "label": "CD-line"
  }'
```
