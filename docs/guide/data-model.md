# 데이터 모델 & 마이그레이션

NANoDB의 영속 계층(persistence)과 파일 저장 레이아웃을 다룹니다. 여기서 다루는 범위는 "무엇이 어떻게 저장되는가"입니다. 저장된 데이터를 다루는 서비스 로직은 [백엔드](/guide/backend), HTTP 응답 형태는 [API](/guide/api-reference)를 참고하세요. 전체 그림은 [아키텍처](/guide/architecture)에 있습니다.

스택: **PostgreSQL + SQLAlchemy(동기) + Alembic**. 이미지 원본과 파생물은 데이터베이스가 아니라 디스크(`var/uploads`)에 저장하고, DB에는 그 경로(키)만 둡니다.

- ORM 매핑: `src/backend/nanodb/persistence/models.py`
- 엔진/트랜잭션: `src/backend/nanodb/persistence/database.py`
- 리포지토리: `src/backend/nanodb/persistence/repositories.py`
- 도메인 값 객체: `src/backend/nanodb/domain/entities.py`
- 마이그레이션: `alembic/`, `alembic.ini`
- 파일 저장: `src/backend/nanodb/adapters/file_store.py`, `adapters/derived_store.py`

## 1. 엔티티 개요 & ER 다이어그램

데이터베이스에는 5개의 테이블이 있습니다.

| 테이블 | 역할 | 모델 클래스 |
| --- | --- | --- |
| `images` | 등록된 이미지 한 장의 메타데이터 | `ImageModel` |
| `measurements` | 이미지 위에서 측정된 값 하나(길이/각도/곡률) | `MeasurementModel` |
| `measurement_items` | 제품별 측정 항목 정의(이름 + 기하 타입) | `MeasurementItemModel` |
| `catalog_options` | 등록 폼 콤보박스가 쓰는 관리형 목록 | `CatalogOptionModel` |
| `segmentation_results` | 이미지 한 장의 multi-Otsu 세그멘테이션 결과(이미지당 최대 1행) | `SegmentationResultModel` |

관계와 카디널리티(외래키는 `models.py`에 정의):

```text
                     ┌──────────────────────┐
                     │   catalog_options    │  (독립 테이블: FK 없음)
                     │  등록 콤보박스 목록  │  category+value 유니크
                     └──────────────────────┘
                       논리적으로만 images의
                       image_type/product_id/lot_id/
                       wafer_id/process_step 값을 채움

  ┌───────────────────┐            ┌──────────────────────┐
  │ measurement_items │            │  segmentation_results│
  │  제품별 측정 정의 │            │  이미지당 최대 1행   │
  └─────────┬─────────┘            └──────────┬───────────┘
            │ item_id (nullable)              │ image_id (UNIQUE)
            │ ON DELETE SET NULL              │ ON DELETE CASCADE
            │                                 │
            │            ┌────────────────────┴──┐
            │            │        images         │
            │            │   이미지 메타데이터   │
            │            └───────────┬───────────┘
            │                        │ image_id
            │                        │ ON DELETE RESTRICT
            │            ┌───────────┴───────────┐
            └───────────>│     measurements      │
                         │   측정값(증거 데이터) │
                         └───────────────────────┘

  images 1 ──< N measurements        (RESTRICT: 측정값이 남아 있으면 이미지 삭제 불가)
  measurement_items 1 ──< N measurements (SET NULL: 정의가 지워져도 측정값은 남음)
  images 1 ──1 segmentation_results   (CASCADE: 이미지 삭제 시 함께 삭제)
```

::: tip 관계 규칙의 의도
- `measurements.image_id`는 **RESTRICT**입니다. 측정값이 붙은 이미지는 곧바로 지울 수 없고, 서비스가 측정값을 먼저 지운 뒤에 이미지를 지웁니다(`ImageRepository.delete` docstring 참고).
- `measurements.item_id`는 **SET NULL**입니다. 측정 항목 정의(`measurement_items`)를 나중에 삭제해도 이미 기록된 측정값은 사라지지 않습니다. "증거는 정의보다 오래 남는다"는 원칙입니다.
- `segmentation_results.image_id`는 **CASCADE**이며 `UNIQUE`입니다. 이미지 삭제 시 DB 행은 자동으로 지워지지만, 디스크의 파생 파일은 DB가 소유하지 않으므로 서비스가 별도로 지웁니다.
:::

## 2. 테이블별 컬럼 사전

모든 타입/제약은 `models.py`에서 그대로 인용했습니다.

### 2.1 `images` (`ImageModel`)

| 컬럼 | 타입 | 제약 | 의미 |
| --- | --- | --- | --- |
| `id` | Integer | PK | 이미지 식별자 |
| `original_filename` | String(512) | NOT NULL | 업로드된 원래 파일 이름(표시용) |
| `stored_filename` | String(255) | NOT NULL, UNIQUE | `var/uploads` 안의 실제 저장 키(불투명 UUID) |
| `display_filename` | String(255) | UNIQUE, NULL 허용 | 브라우저가 직접 못 그리는 포맷(예: TIFF)의 파생 PNG 키. NULL이면 원본을 그대로 서빙 |
| `image_type` | String(64) | NOT NULL | 이미징 종류(SEM/TEM/Layout 등). 과거엔 SEM/TEM 고정 enum이었으나 관리형 자유 텍스트로 완화됨 |
| `product_id` | String(255) | NOT NULL | 제품 ID |
| `lot_id` | String(255) | NOT NULL | 랏 ID |
| `wafer_id` | String(255) | NOT NULL | 웨이퍼 ID |
| `process_step` | String(255) | NULL 허용 | 공정 단계(예: "Gate Etch"). 이미지 전체를 설명하는 선택 항목 |
| `note` | Text | NULL 허용 | 이미지 전체에 대한 자유 텍스트 비고. 카탈로그와 무관한 개별 값 |
| **`calibration_nm_per_pixel`** | Float | NOT NULL, `> 0` | **픽셀당 나노미터 배율.** 측정값을 물리 단위로 환산하는 핵심 값 |
| `pixel_width` | Integer | NOT NULL, `> 0` | 원본 픽셀 폭 |
| `pixel_height` | Integer | NOT NULL, `> 0` | 원본 픽셀 높이 |
| `created_at` | DateTime(tz) | NOT NULL, `now()` | 등록 시각 |

인덱스: `ix_images_created_id (created_at, id)` — 최신순 목록 조회용.

### 2.2 `measurements` (`MeasurementModel`)

측정값은 시스템의 "증거 데이터"입니다. 좌표·값·타입은 불변, 라벨·메모만 편집 가능합니다([6장](#_6-불변성-규칙) 참고).

| 컬럼 | 타입 | 제약 | 의미 |
| --- | --- | --- | --- |
| `id` | Integer | PK | 측정값 식별자 |
| `image_id` | Integer | FK→`images.id` (RESTRICT), NOT NULL, index | 소속 이미지 |
| `item_id` | Integer | FK→`measurement_items.id` (SET NULL), NULL 허용 | 실현한 제품 측정 항목. NULL이면 임시(ad-hoc) 측정 |
| **`measurement_type`** | String(16) | NOT NULL, CHECK `IN ('length','angle','curvature')` | 기하 타입 |
| **`points`** | JSONB | NOT NULL | **원본 픽셀 좌표의 순서 있는 배열** `[[x, y], ...]`. length는 2점, angle/curvature는 3점 |
| `value` | Float | NOT NULL, `> 0` | 계산된 결과값 |
| `unit` | String(8) | NOT NULL | 값의 단위(length/curvature=`nm`, angle=`deg`) |
| `calibration_nm_per_pixel` | Float | NOT NULL, `> 0` | 측정 당시의 배율(이미지 값의 스냅샷) |
| `label` | String(255) | NULL 허용 | 무엇을 쟀는지 이름(도형 옆에 표시). **편집 가능** |
| `note` | Text | NULL 허용 | 자유 관찰 메모. **편집 가능** |
| `source` | String(16) | NOT NULL, default `manual`, CHECK `IN ('manual','auto')` | 출처: 사람이 그린 `manual` vs 특징 추출기의 `auto` |
| `confidence` | Float | NULL 허용, CHECK `NULL OR 0..1` | auto 측정의 0~1 자기추정 신뢰도(manual은 NULL) |
| `original_points` | JSONB(`none_as_null`) | NULL 허용 | 첫 보정 시 한 번만 기록되는 최초 좌표 |
| `original_value` | Float | NULL 허용 | 첫 보정 시 한 번만 기록되는 최초 값 |
| `adjusted_at` | DateTime(tz) | NULL 허용 | 사람이 좌표를 옮긴 시각 |
| `created_at` | DateTime(tz) | NOT NULL, `now()` | 생성 시각 |

제약 두 가지가 특히 중요합니다.

- **보정 트레일 무결성** `ck_measurements_adjustment_complete`: `adjusted_at` / `original_points` / `original_value` 세 컬럼은 "셋 다 NULL(미보정)" 또는 "셋 다 값 있음(보정됨)"만 허용합니다. 그래서 `original_points`는 `JSONB(none_as_null=True)`로 매핑되어, 트레일을 지울 때 JSON `'null'`이 아니라 SQL `NULL`이 기록됩니다.
- **좌표 저장 방식**: 좌표는 개별 컬럼(`start_x` 등)이 아니라 `points` JSONB 하나에 담깁니다. 이는 마이그레이션 `0006`에서 2점 고정 구조를 다형 기하 구조로 일반화한 결과입니다([4장](#_4-마이그레이션) 참고).

인덱스: `ix_measurements_image_created (image_id, created_at, id)`, 그리고 `image_id` 단일 인덱스.

### 2.3 `measurement_items` (`MeasurementItemModel`)

| 컬럼 | 타입 | 제약 | 의미 |
| --- | --- | --- | --- |
| `id` | Integer | PK | 항목 식별자 |
| `product_id` | String(255) | NOT NULL | 이 정의가 속한 제품 |
| `name` | String(255) | NOT NULL | 측정 대상 이름(예: "Gate CD") |
| `measurement_type` | String(16) | NOT NULL, CHECK `IN ('length','angle','curvature')` | 이 항목의 기하/단위 고정 |
| `created_at` | DateTime(tz) | NOT NULL, `now()` | 생성 시각 |

제약: `uq_measurement_items_product_name (product_id, name)` — 제품마다 자기 측정 항목 카탈로그를 갖고, 이름은 제품 내 유일. 인덱스 `ix_measurement_items_product (product_id)`.

### 2.4 `catalog_options` (`CatalogOptionModel`)

등록 폼의 콤보박스(이미지 종류/제품/랏/웨이퍼/공정 단계)를 채우는 관리형 목록입니다. `images`와 외래키 관계는 없고, 값만 논리적으로 공급합니다.

| 컬럼 | 타입 | 제약 | 의미 |
| --- | --- | --- | --- |
| `id` | Integer | PK | 옵션 식별자 |
| `category` | String(32) | NOT NULL, CHECK `IN ('image_type','product_id','lot_id','wafer_id','process_step')` | 어느 목록에 속하는지 |
| `value` | String(255) | NOT NULL | 선택 값 |
| `is_predefined` | Boolean | NOT NULL, default `false` | 기본 제공 값(삭제 보호) 여부. 운영자가 추가한 값은 삭제 가능 |
| `created_at` | DateTime(tz) | NOT NULL, `now()` | 생성 시각 |

제약: `uq_catalog_options_category_value (category, value)` — 등록 시 idempotent upsert(`ensure_many`)가 이 유니크 제약으로 충돌을 무시합니다. 인덱스 `ix_catalog_options_category`.

### 2.5 `segmentation_results` (`SegmentationResultModel`)

| 컬럼 | 타입 | 제약 | 의미 |
| --- | --- | --- | --- |
| `id` | Integer | PK | 결과 식별자 |
| `image_id` | Integer | FK→`images.id` (CASCADE), NOT NULL, **UNIQUE**, index | 대상 이미지(이미지당 1행) |
| `method` | String(64) | NOT NULL | 세그멘테이션 방법 이름 |
| `classes` | Integer | NOT NULL, CHECK `2..6` | 클래스 개수 |
| `denoise_weight` | Float | NOT NULL, `> 0` | 노이즈 제거 가중치 |
| `min_size` | Integer | NOT NULL, `>= 0` | 최소 영역 크기 |
| `thresholds` | JSONB | NOT NULL | multi-Otsu 임계값 배열 |
| `class_stats` | JSONB | NOT NULL | 클래스별 통계(픽셀 수, 면적 비율, 평균 밝기 등) 배열 |
| `map_path` | String(512) | NOT NULL | 세그멘테이션 맵 PNG의 저장 키 |
| `boundary_path` | String(512) | NOT NULL | 경계 오버레이 PNG의 저장 키 |
| `labels_path` | String(512) | NOT NULL | 라벨 맵 `.npy`의 저장 키(원본 해상도) |
| `tagged_path` | String(512) | NULL 허용 | 태그된 TIFF의 저장 키(있을 때만) |
| `duration_ms` | Integer | NOT NULL, `>= 0` | 처리 시간(ms) |
| `downscaled` | Boolean | NOT NULL, default `false` | 시간 예산을 맞추려 축소 처리했는지 여부(라벨 맵 자체는 항상 원본 해상도) |
| `created_at` | DateTime(tz) | NOT NULL, `now()` | 생성 시각 |

::: warning 경로는 절대 경로가 아니라 "저장 키"
`map_path` 등은 업로드 루트 기준 상대 키(예: `derived/{image_id}/segmentation_map.png`)입니다. 데이터 디렉터리를 옮겨도 동작하도록 절대 경로를 저장하지 않습니다([5장](#_5-파일-파생물-저장-레이아웃) 참고).
:::

## 3. 도메인 엔티티 ↔ ORM 모델 ↔ 저장 매핑

NANoDB는 프레임워크에 독립적인 **도메인 값 객체**(`domain/entities.py`, 불변 `@dataclass(frozen=True, slots=True)`)와 **ORM 모델**(`persistence/models.py`)을 분리합니다. 둘 사이를 잇는 것이 **리포지토리**(`persistence/repositories.py`)의 `_to_*` 변환 함수입니다.

| 도메인 값 객체 | ORM 모델 | 리포지토리 | 변환 함수 |
| --- | --- | --- | --- |
| `Image` | `ImageModel` | `ImageRepository` | `_to_image` |
| `Measurement` | `MeasurementModel` | `MeasurementRepository` | `_to_measurement` |
| `MeasurementItem` | `MeasurementItemModel` | `MeasurementItemRepository` | `_to_measurement_item` |
| `CatalogOption` | `CatalogOptionModel` | `CatalogRepository` | `_to_catalog_option` |
| `SegmentationResult` | `SegmentationResultModel` | `SegmentationResultRepository` | `_to_segmentation_result` |

변환은 단순 복사가 아니라 타입 승격을 수행합니다.

- **문자열 → StrEnum**: `model.measurement_type`(str) → `MeasurementType(...)`, `model.source` → `MeasurementSource(...)`, `model.category` → `CatalogCategory(...)`.
- **JSONB → 값 객체 튜플**: `points`(`[[x,y],...]`)는 `tuple(Point(x, y), ...)`로, 반대로 저장 시 `[[point.x, point.y] for point in points]`로 되돌립니다(`MeasurementRepository.create`).
- **JSONB dict → 통계 객체**: `class_stats`는 `_class_stat_from_entry`가 `object`로 들어온 JSONB를 구체 숫자 타입으로 되살립니다.

```python
# repositories.py — points 왕복 변환
points=tuple(Point(float(x), float(y)) for x, y in model.points)   # 읽기
points=[[point.x, point.y] for point in points]                    # 쓰기
```

::: warning 저장되지 않는 도메인 필드 (불일치 주의)
`Measurement` 도메인 객체에는 `reference_status: ReferenceStatus = UNREVIEWED` 필드와 `measurement_method`(= `source`의 별칭), `is_adjusted` 프로퍼티가 있지만, 이 중 **`reference_status`는 대응하는 컬럼이 `measurements` 테이블에 없습니다.** 현재는 항상 기본값 `unreviewed`로만 존재하는 파생/예약 필드입니다. 스키마를 확장해 이 상태를 영속화하려면 컬럼과 마이그레이션을 새로 추가해야 합니다.
:::

엔진과 트랜잭션 경계는 `database.py`가 관리합니다. `session_scope`는 성공 시 한 번 커밋, 실패 시 롤백하는 컨텍스트 매니저이고, 세션 팩토리는 `expire_on_commit=False`로 커밋 후에도 객체 접근이 가능합니다.

## 4. 마이그레이션

### 4.1 Alembic 설정

- `alembic.ini`: `script_location = alembic`, `prepend_sys_path = src/backend`(그래서 `nanodb.*` 임포트가 됨). `sqlalchemy.url`에 기본 로컬 URL이 하드코딩되어 있으나, 실제로는 아래 env.py가 덮어씁니다.
- `alembic/env.py`:
  - `target_metadata = Base.metadata` — `models.py`의 `Base`를 대상으로 autogenerate가 동작합니다.
  - **환경변수 우선**: `DATABASE_URL`이 있으면 그 값으로 `sqlalchemy.url`을 치환합니다(`%`는 `%%`로 이스케이프). 컨테이너/CI에서 이 변수로 대상 DB를 지정합니다. 앱 런타임의 기본값은 `settings.py`의 `database_url`(동일한 로컬 DSN)입니다.
  - `compare_type=True` — 컬럼 타입 변경을 autogenerate가 감지합니다.
  - 온라인 모드는 `NullPool`로 연결합니다.

### 4.2 마이그레이션 만들기/적용하기

```bash
# 적용 (head까지)
make migrate                 # 내부적으로: uv run alembic upgrade head

# 새 리비전 자동 생성 (모델 변경 후)
uv run alembic revision --autogenerate -m "설명"

# 되돌리기
uv run alembic downgrade -1
```

`make up`은 `db → migrate → app` 순서로 컨테이너 스택을 띄우며 마이그레이션을 자동 적용합니다. 대상 DB를 바꾸려면 `DATABASE_URL`을 지정하세요.

::: tip autogenerate 후 반드시 검토
`--autogenerate`는 컬럼 추가/삭제/타입 변경은 잘 잡지만, 데이터 백필(backfill)이나 CHECK 제약 문구 변경은 놓칠 수 있습니다. 아래 기존 마이그레이션들이 좋은 본보기입니다 — 특히 `0005`, `0006`은 손으로 백필 SQL을 넣었습니다.
:::

### 4.3 기존 버전 목록 (시간순)

`down_revision`으로 이어진 선형 체인입니다(분기 없음). `alembic/versions/`:

| 리비전 | 파일 | 변경 내용 |
| --- | --- | --- |
| `20260908_0001` | `create_core_tables` | 최초 스키마: `images`, `measurements` 생성. 당시 `image_type`은 `SEM/TEM` 고정, 측정값은 `parameter_type(CD/Depth/Thickness)` + 2점 좌표(`start_x/y`, `end_x/y`, `distance_px`, `value_nm`) 구조 |
| `20260908_0002` | `add_image_display_filename` | `images.display_filename` 추가(+ 유니크 제약). TIFF 등 브라우저 비호환 포맷의 파생 PNG 키 |
| `20260908_0003` | `create_annotations_table` | 화살표/원 라벨링용 `annotations` 테이블 생성 (**이후 0004에서 폐기됨**) |
| `20260908_0004` | `measurement_annotation` | `annotations` 테이블 제거. 대신 `measurements.label`과 `images.process_step` 컬럼 추가 — 정보를 실제 소유 행으로 이동 |
| `20260908_0005` | `create_catalog_options` | `catalog_options` 테이블 생성, `image_type`을 String(3)→String(64) 자유 텍스트로 완화(CHECK 제거). 기본값(TEM/SEM, W01~W25) + 기존 이미지의 distinct 값 시드 |
| `20260908_0006` | `measurement_geometry_types` | **가장 큰 변경.** `measurement_items` 테이블 신설. `measurements`를 2점 CD/Depth/Thickness 구조에서 다형 기하(`measurement_type`, `points` JSONB, `value`, `unit`, `item_id`) 구조로 일반화. 기존 행은 length 측정으로 백필 |
| `20260909_0007` | `segmentation_and_measurement_source` | `segmentation_results` 테이블 신설. `measurements`에 `source`(manual/auto), `confidence` 추가 |
| `20260909_0008` | `measurement_adjustment` | `measurements`에 보정 트레일 `original_points`, `original_value`, `adjusted_at` 추가 + 무결성 CHECK(`ck_measurements_adjustment_complete`) |
| `20260909_0009` | `seed_layout_image_type` | `catalog_options`에 `image_type='Layout'`을 predefined로 시드(idempotent) |
| `20260909_0010` | `image_note` | `images.note`(자유 텍스트 비고) 추가 |

모든 마이그레이션에 `downgrade()`가 구현되어 있습니다. 단 `0006`의 downgrade는 되돌릴 수 없는 데이터 손실을 동반합니다 — angle/curvature 측정값은 2점 구조로 표현할 수 없어 `DELETE`됩니다.

## 5. 파일/파생물 저장 레이아웃

DB에는 경로(키)만, 실제 바이트는 `upload_root`(기본 `var/uploads`, `settings.py`) 아래에 둡니다. 저장소는 두 어댑터가 나눠 담당합니다.

```text
var/uploads/                         # upload_root (settings.upload_root)
├── .staging/                        # FileStore: 업로드 중인 임시 파일(*.upload)
├── <uuid>.png                       # 원본 업로드 (stored_filename = 이 파일명)
├── <uuid>.tif                       # 원본 (TIFF 등)
├── <uuid>.png                       # display_filename (TIFF의 브라우저용 파생 PNG)
└── derived/                         # DerivedStore: 이미지별 파생물 그룹
    └── <image_id>/                  # 예: derived/7/
        ├── segmentation_map.png     # map_path
        ├── boundary_overlay.png     # boundary_path
        ├── labels.npy               # labels_path (원본 해상도 라벨 맵)
        └── tagged.tif               # tagged_path (있을 때만)
```

두 어댑터의 설계 차이:

- **`FileStore`** (`file_store.py`): 원본 업로드용. 평평한 불투명 키(UUID)를 사용. 업로드는 `.staging/`에 먼저 쓴 뒤(`write_temporary`) 크기 한도(기본 20MB)와 빈 파일 검사를 통과하면 `os.replace`로 원자적 승격(`promote`). `_safe_key`로 경로 순회(path traversal) 차단.
- **`DerivedStore`** (`derived_store.py`): 세그멘테이션 등 생성물용. `derived/{image_id}/name` 구조로 이미지별로 묶어, 이미지 삭제 시 `remove_image_dir`로 통째로 제거. 임시 파일에 쓰고 `os.replace`로 원자적 교체하므로 반쯤 쓰인 파일이 읽히거나 동시 실행이 서로를 깨뜨리지 않음. `resolve`가 `is_relative_to(base)`로 경로 순회를 차단.

::: warning 커밋 대상 vs .gitignore
`.gitignore`에 **`var/`가 통째로 무시**됩니다(그리고 `storage/uploads/`도). 즉 원본·파생 파일과 업로드 디렉터리는 저장소에 커밋되지 않습니다. 데이터베이스와 디스크는 별개 수명주기를 가지므로, 백업/복원 시 **DB 행과 `var/uploads`를 함께** 다뤄야 정합성이 유지됩니다. 이미지 행을 지우면 CASCADE로 `segmentation_results` 행은 지워지지만, 디스크의 파생 파일은 서비스가 명시적으로 지워야 합니다(DB가 소유하지 않음).
:::

## 6. 불변성 규칙

측정값은 "증거"로 취급됩니다. 무엇이 편집 가능한지가 리포지토리 메서드로 강제됩니다(`repositories.py`).

| 대상 | 편집 가능? | 근거 |
| --- | --- | --- |
| `measurements.label`, `measurements.note` | **가능** | `update_annotation`이 이 둘만 교체. "증거가 딛고 선 것(좌표/타입/값/배율)은 불변" |
| `measurements.points`, `value`, `unit` | 보정으로만 | `update_geometry`가 좌표를 옮기고 값을 **재계산**. 첫 보정 시 원본을 `original_*`에 1회 보존, `adjusted_at` 기록. `revert_geometry`로 되돌리기 가능 |
| `measurements.measurement_type`, `calibration_nm_per_pixel` | **불가** | 어떤 메서드도 변경하지 않음. 값이 항상 저장된 좌표로부터 재도출 가능해야 함(export 검증기가 이를 재계산) |
| `images` 메타데이터(`image_type`, `product_id`, `lot_id`, `wafer_id`, `process_step`, `note`, `calibration_nm_per_pixel`) | **가능** | `ImageRepository.update`가 갱신 |
| `images.stored_filename`, `pixel_width/height` | **불가** | `update` docstring: "파일, 저장 키, 픽셀 치수는 그대로 둔다. 등록 시 사람이 넣은 메타데이터만 쓰기 가능" |

auto 측정 재실행 시 보존 규칙도 여기에 뿌리를 둡니다: `delete_auto_by_image`는 `source='auto'`인 행만 지우되, `adjusted_at`이 설정된(=사람이 보정한) auto 측정은 사람의 작업이므로 보존합니다.

## 7. 스키마 변경하는 법 (요약 레시피)

1. `persistence/models.py`에서 모델을 수정합니다(컬럼·제약·인덱스).
2. 값 객체가 바뀌면 `domain/entities.py`의 dataclass와 `repositories.py`의 `_to_*` 변환·`create`/`update`를 함께 맞춥니다. (한쪽만 고치면 [3장의 불일치](#_3-도메인-엔티티-orm-모델-저장-매핑)처럼 "저장되지 않는 필드"가 생깁니다.)
3. 마이그레이션을 생성합니다: `uv run alembic revision --autogenerate -m "..."`.
4. 자동 생성물을 **검토**하고, 필요하면 데이터 백필 SQL과 CHECK 제약을 손으로 추가합니다(`0005`/`0006`이 본보기). `downgrade()`도 채웁니다.
5. `make migrate`로 적용하고 테스트를 돌립니다.
6. 새 파생 파일 종류가 생기면 저장 키를 DB 컬럼(String)에 두고 파일은 `DerivedStore`로 씁니다 — 절대 경로를 저장하지 마세요.

자세한 기여 절차와 코딩 규칙은 [확장·기여](/guide/contributing)를, 테스트·마이그레이션 CI는 [테스트·빌드·배포](/guide/testing-and-ci)를 참고하세요. 용어는 [용어집](/guide/glossary)에 있습니다.
