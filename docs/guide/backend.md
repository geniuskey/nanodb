# 백엔드

이 문서는 NANoDB 백엔드의 **로직 계층**(services · domain · adapters)을 다룹니다. 코드는
`src/backend/nanodb/`에 있으며 Python 3.12 · FastAPI 기반입니다. 전체 그림은
[아키텍처](/guide/architecture)를, 개발 환경 준비는 [개발 환경](/guide/getting-started)을 참고하세요.

경계선을 분명히 해 둡니다. 이 페이지는 **비즈니스 로직**만 설명합니다.

- DB 스키마·테이블·마이그레이션은 [데이터 모델](/guide/data-model)에서 다룹니다.
- HTTP 엔드포인트 계약(경로·요청/응답 스키마·상태 코드)은 [API 레퍼런스](/guide/api-reference)에서 다룹니다.
- 컨텍스트 내보내기 ZIP의 내부 구조(네 파일 포맷)는 [컨텍스트 내보내기](/guide/context-export)에서 다룹니다.

여기서는 위 세 곳으로 링크만 걸고 내용을 중복하지 않습니다.

::: warning 문서-구현 불일치 (반드시 읽어 주세요)
[소개](/guide/) 및 저장소 `index.md`는 "자동 계측·윤곽 검출은 없습니다. 측정은 수동 두 점
방식의 미검토 참고값"이라고 설명합니다. 그러나 **현재 백엔드에는 자동 세그멘테이션(multi-Otsu)과
자동 특징 추출(폭/높이/간격/곡률/측벽 각도)이 실제로 구현되어 있습니다** — `domain/segmentation.py`,
`domain/features.py`, `services/segmentation_service.py`, `services/feature_service.py`,
`services/batch_service.py`가 그 증거입니다. 마케팅 문구가 구현보다 뒤처져 있는 상태이므로, 새로
합류하는 엔지니어는 "코드가 진실"이라는 전제로 이 페이지를 읽어야 합니다. 자세한 내용은
아래 [도메인 로직 심화](#도메인-로직-심화)에서 다룹니다.
:::

## 계층별 책임 & 규칙

백엔드는 안쪽으로 갈수록 프레임워크 의존이 줄어드는 다섯 계층으로 나뉩니다.

| 계층 | 위치 | 책임 | 의존 규칙 |
| --- | --- | --- | --- |
| `api` | `api/*.py` | FastAPI 앱 팩토리, 라우트, 요청/응답 스키마, 예외→응답 매핑 | services를 호출. 도메인 규칙을 직접 구현하지 않음 |
| `services` | `services/*.py` | 유스케이스 오케스트레이션(트랜잭션 경계, repository·adapter·domain 조합) | domain·persistence·adapters를 조합. HTTP를 모름 |
| `domain` | `domain/*.py` | 순수 계산·검증·엔티티. 부수효과 없음 | **FastAPI·SQLAlchemy·파일 I/O에 의존하지 않음** |
| `persistence` | `persistence/*.py` | SQLAlchemy 모델·세션·repository | [데이터 모델](/guide/data-model) 참고 |
| `adapters` | `adapters/*.py` | 파일·이미지·TIFF 태그 등 외부 I/O 격리 | domain 엔티티만 반환. FastAPI를 모름 |

핵심 규칙은 **도메인이 순수하다**는 것입니다. `domain/` 어디에도 FastAPI·SQLAlchemy import가 없고,
파일을 읽거나 쓰지 않습니다(세그멘테이션 결과 렌더링조차 matplotlib가 아니라 Pillow만 사용해
서버에서 안전하게 import되도록 했습니다 — `domain/segmentation.py` 9~11행 주석). 부수효과가 필요한
작업은 모두 서비스가 adapter를 통해 수행합니다.

두 번째 규칙은 **값은 서버가 계산한다**는 것입니다. 측정값은 클라이언트가 보낸 숫자를 저장하지 않고,
항상 좌표에서 서버가 다시 계산합니다(`services/measurement_service.py`의 `create` ·
`update_geometry`). 내보내기 검증기도 저장된 값을 좌표에서 재계산해 대조합니다
(`domain/calculations.py`의 `validate_export_snapshot`).

의존성 조립은 `api/app.py`의 `create_app()` 한 곳에서 이뤄집니다. 세션 팩토리·`FileStore`·
`DerivedStore`를 만든 뒤 각 서비스에 생성자 주입하고 `app.state`에 보관합니다. 예를 들어
`FeatureExtractionService`는 `SegmentationService`를 주입받고, `SegmentationBatchService`는
그 둘을 다시 주입받습니다(`api/app.py` 53~68행).

## 서비스 카탈로그

`services/`의 각 파일과 주요 공개 메서드입니다. HTTP 매핑은 [API 레퍼런스](/guide/api-reference)를 보세요.

| 파일 | 책임 | 주요 공개 메서드 |
| --- | --- | --- |
| `image_service.py` | 이미지 등록·조회·수정·삭제, 브라우저용 미리보기 파생 | `register` · `list_images` · `get_image` · `update` · `delete` · `image_path` |
| `measurement_service.py` | 서버 계산 측정 생성/조회, 주석·좌표 수정, 되돌리기 | `create` · `list_for_image` · `update_annotation` · `update_geometry` · `revert_geometry` · `delete` |
| `measurement_item_service.py` | 제품별 측정 항목 정의(이름 + 기하 타입) | `list_for_product` · `create` · `update` · `delete` |
| `catalog_service.py` | 등록 콤보박스용 관리 목록(image_type/product/lot/wafer/process_step) | `list_all` · `create` · `rename` · `delete` |
| `segmentation_service.py` | multi-Otsu 세그멘테이션 실행·저장·서빙, 태그 TIFF 갱신 | `run` · `get` · `variant_path` · `tagged_path` · `refresh_tags` |
| `feature_service.py` | 라벨맵에서 자동 측정 도출·저장, 태그 갱신 | `run` |
| `batch_service.py` | 여러 이미지에 세그멘테이션(+선택적 특징 추출) 일괄 실행 | `run` |
| `summary_service.py` | 홈 KPI 집계(이미지 수·측정 수·타입별 통계) | `get` |
| `context_export_service.py` | 단일 이미지 스냅샷 검증 후 ZIP 생성 오케스트레이션 | `build` |
| `export_builder.py` | 결정적 UTF-8 ZIP 4파일 빌더(모듈 함수) | `build_context_zip` |

측정값 라이프사이클에서 눈여겨볼 점은 **보정(correction) 이력**입니다. `update_geometry`는 좌표를
옮기고 값을 재계산하되, 첫 수정 때 원본 좌표·값을 `original_points`/`original_value`에 보존하고
`adjusted_at`을 찍습니다. `revert_geometry`는 그 원본을 정확히 복원합니다. 값·타입·보정단위는
불변이고 좌표만 교정 가능하다는 정책입니다(`measurement_service.py` 121~196행).

## 도메인 로직 심화

### calculations.py — 두 점과 보정값으로 길이/각도/곡률 계산

측정의 핵심 수학입니다. `MeasurementType`은 세 가지이고
(`domain/entities.py`), 타입마다 점 개수가 고정됩니다(length 2, angle 3, curvature 3 —
`POINT_COUNT_BY_TYPE`).

진입점은 `calculate_measurement(measurement_type, points, calibration_nm_per_pixel, *, pixel_width, pixel_height)`
입니다. 먼저 `_validate_geometry`로 보정값(>0)·점 개수·이미지 경계 안쪽 여부를 검사한 뒤 타입별로 분기합니다.

- **length (CD/Depth/Thickness)** — `_calculate_length`. 두 점의 픽셀 거리에 보정값을 곱합니다.

  ```python
  distance_px = math.hypot(b.x - a.x, b.y - a.y)   # _distance
  value = distance_px * calibration_nm_per_pixel   # 단위: nm
  ```

  즉 CD·Depth·Thickness는 모두 "두 점 사이 길이"라는 동일한 length 측정이며, 무엇을 잰 것인지는
  측정 항목(`item`)의 이름과 `label`이 구분합니다. 값 자체는 `nm/pixel` 보정값에 선형 비례합니다.
  두 점이 `_MIN_SEPARATION_PX`(1e-6px)보다 가까우면 `IDENTICAL_POINTS`로 거부합니다.

- **angle** — `_calculate_angle`. 첫 점이 꼭짓점, 나머지 둘이 팔 끝입니다. 두 팔 벡터의 내적으로
  코사인을 구하고 `[-1, 1]`로 클램프한 뒤 `math.degrees(math.acos(...))`. 보정값과 무관하며 단위는 deg.

- **curvature** — `_calculate_curvature` → `_fit_circle_radius_px`. 세 점을 지나는 외접원의
  반지름(circumradius)을 구해 보정값을 곱합니다. 세 점이 일직선이면(삼각형 넓이 ≈ 0) `COLLINEAR_POINTS`로
  거부합니다. 공식은:

  ```python
  area2 = (x2-x1)*(y3-y1) - (y2-y1)*(x3-x1)   # 삼각형 넓이의 2배(부호 포함)
  R_px  = (a*b*c) / (2 * abs(area2))          # a,b,c는 세 변 길이
  value = R_px * calibration_nm_per_pixel     # 단위: nm
  ```

계산 결과가 유한 양수가 아니면 `INVALID_MEASUREMENT_RESULT`로 막습니다. 표시용 반올림은
`round_for_display`(기본 2자리, `ROUND_HALF_UP`)가 담당하되 **저장 값은 float 원본을 유지**합니다.

집계·검증도 이 모듈에 있습니다. `build_expected_summary`는 타입별 평균을 고정 순서로 계산하고
(`math.fsum` 사용), `validate_export_snapshot`은 스냅샷의 모든 측정값을 좌표에서 재계산해
저장값과 `abs_tol=1e-9`로 대조하며 불일치 시 `INCONSISTENT_MEASUREMENT`를 던집니다.

### segmentation.py + segmentation_service — multi-Otsu 세그멘테이션

`domain/segmentation.py`는 `scripts/segment_tem_demo`의 동작을 그대로 이식한 shade 기반
multi-Otsu 파이프라인입니다(`METHOD = "multi-otsu"`). 결정적이라 같은 이미지·파라미터면 항상 같은 결과가 나옵니다.

파이프라인(`run_segmentation` → `segment` → `summarize`):

1. **로드** — `load_gray`가 TIFF/PNG/JPEG를 `[0,1]` 그레이스케일 float로 읽음(RGB면 `rgb2gray`).
2. **다운스케일 판단** — 픽셀 수가 `_MAX_WORKING_PIXELS`(1,200,000)를 넘으면 시간 예산을 지키려
   축소해 처리한 뒤, 라벨맵을 nearest-neighbour(`order=0`)로 원 해상도로 복원. 좌표·면적이 원본
   픽셀 기준을 유지하도록 함. `downscaled` 플래그로 기록.
3. **디노이즈** — `denoise_tv_chambolle(gray, weight=denoise_weight)` (total-variation).
4. **임계값** — `threshold_multiotsu(smooth, classes=classes)`. 히스토그램을 요청한 class 수로
   쪼갤 수 없으면(균일/공백 이미지) `UNSEGMENTABLE_IMAGE`.
5. **라벨링** — `np.digitize`로 0(가장 어두움)..classes-1(가장 밝음) 라벨 부여.
6. **소영역 정리** — `min_size > 0`이면 class별로 `remove_small_objects`/`remove_small_holes`.
   scikit-image ≥ 0.26에서 `min_size` 대신 `max_size`를 쓰므로 이식 동작 유지를 위해
   `max_size = min_size - 1`로 넘김(112~128행 주석).
7. **요약** — `summarize`가 class별 픽셀 수·면적 비율·평균 강도·`area_nm2`(보정값² × 픽셀,
   보정값 없으면 None) 산출 → `SegmentationClassStat`.

파라미터(`SegmentationParams`, 기본값): `classes=4`(허용 2~6), `denoise_weight=0.08`(>0),
`min_size=400`(≥0). class 범위는 `_validate_classes`가, 나머지는 서비스의 `run`이 검사합니다.

파생 아티팩트 변형(variant) — `SegmentationService.run`이 세 가지를 씁니다.

- `segmentation_map.png` — `render_map_png`. 고정 팔레트(`_PALETTE`, dark→light)로 class 색칠.
- `boundary_overlay.png` — `render_boundary_png`. `find_boundaries(mode="outer")` 경계를
  주황색(`_BOUNDARY_COLOR = (255,64,0)`)으로 그레이 원본 위에 덧칠.
- `labels.npy` — 원 해상도 uint8 라벨맵(특징 추출 입력).

렌더링은 Pillow만 사용합니다(matplotlib 없음). 이 세 파일과 DB 행 저장은 [데이터 모델](/guide/data-model)이,
서빙 경로는 `variant_path("map"|"boundary")`·`tagged_path`가 담당합니다. 원본 TIFF일 때만
`tagged.tif`도 만듭니다(다음 항목).

#### 태그 TIFF

원본이 TIFF면 `_maybe_write_tagged`가 분석 결과를 사설 TIFF 태그에 담은 파생본을 만듭니다. 특징
추출이 끝난 뒤 `refresh_tags(image_id, features)`가 65011(features) 태그를 갱신합니다. 세부
태그 규격은 아래 [어댑터: tiff_tags](#tiff-tags-tiff-사설-태그) 참고.

### features.py + feature_service — 자동 특징 추출

`domain/features.py`는 라벨맵에서 구조적 특징을 뽑아 **앱 측정의 점(points)** 으로 표현합니다
(`scripts/tem/measure.py` 기하 이식). 특징이 스스로 값을 내지 않고 점만 만들기 때문에, 저장 시점의
값은 결국 `calculate_measurement`가 그 점에서 다시 계산합니다 — 자동 측정도 수동 측정·내보내기
검증기와 **완전히 같은 계산 경로**를 지나게 한 설계입니다.

진입점 `extract_features(labels, *, target_class, min_area=200, curvature_frac=0.6, sidewall_band=(0.2, 0.8), max_radius_factor=3.0)`.

- **target_class** — 특징을 뽑을 class 인덱스(0~5). `feature_service`의 기본값은 0(가장 어두운 class).
- **min_area** — 이보다 작은 연결요소는 무시. 대표 영역이 하나도 없으면 `None` 반환 → 서비스가
  `NO_FEATURE_REGION`.
- **대표 영역 선택**(`_pick_region`) — 경계에 닿지 않은 내부 영역을 우선하고, 비슷한 크기의 단위가
  둘 이상이면(반복 패턴: 셀 배열·컨택홀 필드) **이미지 중심에 가장 가까운** 단위를 고름
  (`_PATTERN_AREA_FRAC = 0.5`). 단일 구조면 가장 큰 것을 사용.

산출되는 특징(`FEATURE_ORDER` 순서, 각각 `FeaturePrimitive`로):

| key | 타입 | 내용 |
| --- | --- | --- |
| `width_cd` | length | 중앙값 scan-line 폭(`auto: 폭(CD)`) |
| `height` | length | bbox 높이(중심 열의 위–아래) |
| `spacing` | length | 대표 영역과 가장 가까운 비교 가능 이웃의 centroid 간격(pitch) |
| `circle_radius` | curvature | 둥근 단위(원형 셀/컨택홀)의 외접원 반경 |
| `bottom_curvature` | curvature | 트렌치/돔 바닥 호의 곡률 반경 |
| `sidewall_angle_left` / `sidewall_angle_right` | angle | 좌/우 측벽의 수직 대비 기울기 |

각 특징은 degenerate하면 값을 지어내지 않고 이유와 함께 **건너뜁니다**(`SkippedFeature`). 주요 게이트:

- **원형 판정**(`_circle_feature`) — 경계에 닿지 않고(clipped 아님), 외접원 fit이 타이트하며
  (`_CIRCLE_MAX_RMS_FRAC = 0.14`), 채움 비율이 disc 범위(`_CIRCLE_FILL_RANGE = (0.72, 1.28)`,
  얇은 호/링 배제), bbox 종횡비가 정사각형에 가까울 때(`_CIRCLE_ASPECT_RANGE`)만 원으로 인정. 원형이면
  바닥 호·측벽은 "원형 단위라 없음"으로 건너뜀.
- **바닥 곡률**(`_curvature_feature`) — `curvature_frac`이 정하는 중앙 프레임 폭에서 바닥 경계점을
  뽑아, 최소 sagitta(`_MIN_ARC_SAGITTA_PX = 2.0`)만큼 휘고 원호 fit이 충분히 좋을 때
  (`_ARC_MAX_RMS_FRAC = 0.2`)만 emit. 반경이 `max_radius_factor × 폭`을 넘으면 "거의 평평"으로 skip.
- **측벽 각도**(`_sidewall_feature`) — `sidewall_band` 높이 구간의 좌/우 edge 점으로 tilt 측정.
  수평 이동이 `_MIN_TILT_PX = 1.0` 미만이면 "수직 벽(측정할 tilt 없음)"으로 skip.

각 특징에는 fit 잔차 등에서 유도한 `confidence`(0~1)가 붙습니다.

`FeatureExtractionService.run(image_id, params)`의 흐름(`services/feature_service.py`):

1. `FeatureParams` 검증(`_validate`): `target_class` 0~5, `min_area` ≥ 0,
   `sidewall_band`은 `0 ≤ lo < hi ≤ 1`, `curvature_frac`은 `(0, 1]`.
2. 세그멘테이션 결과가 없으면 `SEGMENTATION_NOT_FOUND`. `labels.npy`를 `DerivedStore.load_array`로 로드.
3. `extract_features` 호출 → 각 primitive의 점을 `calculate_measurement`로 값 계산(`_compute`).
   여기서 계산이 실패하면(예: 점이 겹침) 그 특징만 런타임 skip에 추가.
4. **기존 auto 행 교체** — `MeasurementRepository.delete_auto_by_image`로 이전 자동 측정을 지우되,
   **사람이 손댄(adjusted) auto 행은 남기고** 그 수를 `preserved_adjusted`로 보고. 사람 수정은
   추출기가 재현할 수 없는 작업이기 때문. 수동(MANUAL) 측정은 항상 보존.
5. 새 측정을 `source=MeasurementSource.AUTO`, `confidence`와 함께 저장.
6. `SegmentationService.refresh_tags`로 TIFF features 태그 갱신.

즉 자동 측정과 수동 측정은 저장·화면에서 `source`(manual/auto)로 명확히 구분되며, 자동값은 검증된
참조가 아니라 `reference_status = unreviewed` 상태입니다(`domain/entities.py`의 `MeasurementSource` 주석).

### batch_service — 여러 이미지 일괄 처리

`SegmentationBatchService.run(image_ids, segmentation_params, *, extract_features, feature_params)`은
per-image 서비스 위의 얇은 오케스트레이션입니다.

- 요청 순서를 유지하되 중복 id는 한 번만 처리.
- 이미지마다 독립 처리하며 **한 장의 실패가 나머지를 중단시키지 않음**(`_process_one`이
  `DomainError`를 잡아 해당 행만 `error`로 기록).
- 세그멘테이션은 성공했으나 특징 추출이 실패하면, 그 이미지는 여전히 `ok`(세그멘테이션은 유효)이되
  feature 실패 코드를 함께 보고.
- 결과는 `BatchOutcome(requested, succeeded, failed, items)`로, 각 `BatchItemResult`에
  `status`·`replaced`·`feature_count`·`skipped_count`·`code`·`message`가 담김.

## 어댑터

외부 I/O를 격리하는 계층입니다. 모두 domain 엔티티/기본형만 주고받고 FastAPI를 모릅니다.

### file_store — 원본 업로드 저장

`FileStore(root, *, size_limit=20MB)`. `root` 아래 `.staging/`에 스테이징합니다.

- **레이아웃** — 원본은 flat opaque key(`{uuid}.{ext}`)로 `root`에 저장. 업로드는 먼저
  `write_temporary`로 `.staging/{uuid}.upload`에 청크 단위로 쓰며 20MB 초과 시 `FILE_TOO_LARGE`,
  0바이트면 `EMPTY_FILE`. 이후 `promote`가 `os.replace`로 원자적으로 최종 경로에 올림.
- **key 안전성** — `_safe_key`가 `Path(key).name != key`거나 `.`/`..`이면 `INVALID_FILE_KEY`로
  경로 traversal 차단.
- **읽기/서빙** — `path_for_response(key)`는 파일이 없으면 `IMAGE_FILE_NOT_FOUND`. `open(key)`는
  컨텍스트 매니저.
- **준비 점검** — `check_read_write`가 `.staging`에 probe 파일을 쓰고 읽어 스토리지 가용성을 확인.

`ImageService.register`는 이 스테이징+promote 위에 트랜잭션을 얹어, 실패 시 임시/최종 파일과 DB를
함께 롤백합니다(`image_service.py` 165~176행).

### derived_store — 파생 아티팩트 저장

`DerivedStore(root)`. `root/derived/{image_id}/name` 구조로 이미지별로 묶어 저장하므로 한
이미지의 세그멘테이션 산출물을 단위로 지울 수 있습니다(`remove_image_dir`).

- **key** — `key_for(image_id, name)` → `derived/{image_id}/{name}`. `_safe_name`으로 이름 검증,
  `_image_dir`로 양수 id 검증.
- **원자적 쓰기** — `write_bytes`/`write_array`는 `.{uuid}.tmp`에 쓴 뒤 `os.replace`. 반쯤 쓰인
  파일을 읽거나 동시 실행이 서로 깨뜨리는 일을 방지.
- **배열** — `write_array`/`load_array`는 `allow_pickle=False`로 `.npy` 저장/로드(라벨맵).
- **경로 가드** — `resolve(key)`가 `base` 밖을 가리키면 `INVALID_DERIVED_KEY`, 파일 부재 시
  `path_for_response`가 `DERIVED_FILE_NOT_FOUND`.

세그멘테이션 map/boundary/labels와 tagged TIFF가 모두 여기에 저장됩니다.

### image_decoder — 포맷·메타데이터

`ImageDecoder`는 Pillow로 실제 파일 내용을 검증합니다. 지원 포맷은 **PNG·JPEG·TIFF**
(`supported_formats`).

- `inspect(path)` — `verify()` 후 다시 열어 `load()`하고 포맷·크기를 읽어 `DecodedImage` 반환.
  해독 불가면 `INVALID_IMAGE_FILE`, 미지원 포맷이면 `UNSUPPORTED_IMAGE_FORMAT`, 크기가 양수 아니면
  `INVALID_IMAGE_DIMENSIONS`.
- `DecodedImage.browser_renderable` — PNG/JPEG만 `<img>`로 직접 표시 가능(`BROWSER_RENDERABLE_FORMATS`).
  TIFF는 아님.
- `render_web_preview(path)` — 브라우저가 못 그리는 포맷(TIFF)을 위해 **원본 픽셀 크기 그대로** PNG
  미리보기를 생성. 저장된 측정 좌표가 뷰어의 파생본에 1:1로 매핑되도록 크기를 보존. PNG가 담을 수
  없는 모드(CMYK, 16-bit 등)는 RGB로 변환(`_PNG_SAFE_MODES`).

### tiff_tags — TIFF 사설 태그

`write_tagged_tiff`는 원본을 절대 수정하지 않고, 등록 태그 5개(65000~65004, `BASE_TAGS`)를 그대로
복사한 뒤 분석 태그 4개(`EXTENDED_TAGS`)를 얹은 **파생 TIFF**를 만듭니다.

| tag | 이름 | 내용 |
| --- | --- | --- |
| 65010 | `segmentation` | `multi-Otsu k=4 · [t1, t2, t3]` 요약 문자열 |
| 65011 | `features` | 특징 이름→값 JSON 객체 |
| 65012 | `class_area_nm2` | class별 nm² 면적 JSON 배열(null 허용) |
| 65013 | `source_sha256` | 원본 파일의 SHA-256 hex |

`sha256_of_file`은 1MB 청크로 해시를 계산합니다. `read_tags`는 알려진 태그를 모두 문자열로 읽어옵니다.
소스와 대상 경로가 같으면 `INVALID_TAG_DESTINATION`으로 막습니다.

## 설정

`settings.py`의 `Settings`는 pydantic-settings 기반으로 `.env`(UTF-8) 또는 환경변수에서 읽습니다
(`extra="ignore"`).

| 필드 | 환경변수 | 기본값 | 용도 |
| --- | --- | --- | --- |
| `database_url` | `DATABASE_URL` | `postgresql+psycopg://nanodb:nanodb@127.0.0.1:5432/nanodb` | DB 접속 URL |
| `upload_root` | `UPLOAD_ROOT` | `var/uploads` | 원본·파생 파일 루트(`FileStore`·`DerivedStore` 공용) |
| `nanodb_profile` | `NANODB_PROFILE` | `demo` | 실행 프로파일 |
| `database_pool_size` | `DATABASE_POOL_SIZE` | `5` (≥1) | 커넥션 풀 크기 |
| `database_max_overflow` | `DATABASE_MAX_OVERFLOW` | `5` (≥0) | 풀 오버플로 |
| `database_pool_timeout` | `DATABASE_POOL_TIMEOUT` | `10.0` (>0) | 풀 대기 타임아웃(초) |
| `frontend_dist` | `FRONTEND_DIST` | `dist/frontend` | 정적 프론트엔드 산출물 경로 |
| `log_level` | `LOG_LEVEL` | `INFO` | 로깅 레벨 |

환경변수 이름은 필드명의 대문자형입니다(pydantic-settings 기본). `create_app()`이 이 설정으로
엔진·세션 팩토리·스토어·서비스를 조립합니다(`api/app.py`).

## 에러 모델

도메인 실패는 모두 `domain/errors.py`의 `DomainError(ValueError)`로 표현합니다. 필드는
`code`(기계용 식별자), `message`(사람용), `field`(원인 필드, 선택), `status`(명시적 HTTP 상태, 선택)입니다.

`api/errors.py`의 `install_error_handlers`가 이를 HTTP로 매핑합니다.

- `status`가 명시되면 그 값을 사용.
- 아니면 `code`가 `*_NOT_FOUND`로 끝나면 **404**, 그 외 교정 가능한 실패는 **422**.
- 예상치 못한 예외는 로깅 후 **500** `INTERNAL_ERROR`(내부 정보 미노출).

응답은 `ErrorEnvelope(code, message, detail)` 형태입니다. 서비스가 명시 상태를 주는 예:
`variant`가 잘못되면 `status=400`(`INVALID_SEGMENTATION_VARIANT`), TIFF 아닌데 tagged 요청 시
`status=409`(`IMAGE_NOT_TIFF`), 수정 안 된 측정을 되돌리려 하면 `status=409`
(`MEASUREMENT_NOT_ADJUSTED`). 상태 코드별 전체 계약은 [API 레퍼런스](/guide/api-reference)를 보세요.

## 새 기능을 백엔드에 추가하는 흐름

새 유스케이스를 더할 때 계층 규칙을 지키는 순서:

1. **domain 먼저** — 순수 계산/검증이면 `domain/`에 함수·엔티티로 추가하고 단위 테스트. FastAPI·
   SQLAlchemy·파일 I/O를 import하지 않습니다. 실패는 `DomainError(code, message, field=...)`.
2. **persistence** — 새 테이블/컬럼이 필요하면 [데이터 모델](/guide/data-model) 절차를 따라 모델과
   repository 메서드를 추가.
3. **adapter** — 외부 I/O(파일·이미지·외부 포맷)가 필요하면 `adapters/`에 격리하고 domain 타입만 반환.
4. **service** — 위 조각을 조합해 트랜잭션 경계를 잡는 서비스 메서드를 작성. 값은 서버에서 계산하고,
   기존 서비스(예: `SegmentationService`)가 필요하면 생성자 주입.
5. **api** — 라우트·스키마를 더하고 `create_app()`에 서비스를 조립. HTTP 계약은
   [API 레퍼런스](/guide/api-reference).
6. **에러 코드** — 새 `code`가 404/422 관례에 맞지 않으면 `DomainError(status=...)`로 명시.

기여 규약·테스트·PR 절차는 [확장·기여](/guide/contributing)와 [테스트·빌드·배포](/guide/testing-and-ci)를 참고하세요.
