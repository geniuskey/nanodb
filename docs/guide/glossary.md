# 용어집

이 페이지는 반도체 계측을 처음 접하는 후속 엔지니어가 코드와 다른 가이드 문서를 읽을 때
길을 잃지 않도록 만든 도메인·프로젝트 용어 사전입니다. 가능한 한 실제 코드에 정의된 값과
이름에 근거해 정리했고, 각 용어에는 코드 상 위치와 더 깊이 다루는 문서 링크를 붙였습니다.

깊이 다루는 문서: [아키텍처](/guide/architecture) · [백엔드](/guide/backend) ·
[데이터 모델](/guide/data-model) · [API 레퍼런스](/guide/api-reference) ·
[컨텍스트 내보내기](/guide/context-export) · [프론트엔드](/guide/frontend)

> 표기 규칙: "값"은 코드에 실제로 존재하는 리터럴을 뜻하고 `등폭체`로 씁니다. 정의는 과장
> 없이 코드가 하는 일만 적었습니다. 코드와 홍보 문구가 어긋나는 지점은 그대로 밝혔습니다.

## 도메인 용어 (계측·반도체)

| 용어 (영문) | 정의 | 코드 상 위치 / 링크 |
| --- | --- | --- |
| SEM (Scanning Electron Microscope) | 주사전자현미경. 표면을 전자빔으로 훑어 얻는 이미지로, 반도체 계측의 주 입력 중 하나입니다. 코드에서는 별도 타입이 아니라 `image_type` 카탈로그의 시드(seed) 옵션 문자열일 뿐입니다. | `CatalogCategory.IMAGE_TYPE` (`domain/entities.py`) · [데이터 모델](/guide/data-model) |
| TEM (Transmission Electron Microscope) | 투과전자현미경. 얇은 시료를 전자빔이 투과해 얻는 단면 이미지로, 깊이·두께·측벽 각도 관찰에 쓰입니다. SEM과 마찬가지로 고정 enum이 아니라 `image_type` 카탈로그의 시드 옵션입니다. | `CatalogCategory.IMAGE_TYPE` · [데이터 모델](/guide/data-model) |
| CD (Critical Dimension) | 핵심 치수. 게이트 폭, 라인 폭처럼 공정 관리의 기준이 되는 가로 치수입니다. 코드에 `CD`라는 측정 타입은 없습니다. CD는 의미상의 이름으로, 실제로는 `length` 측정으로 재고 라벨(예: "Gate CD")로 표시합니다. 자동 추출기는 이 폭 특징을 `width_cd` 키로 emit합니다. | `FEATURE_WIDTH = "width_cd"` (`domain/features.py`) · [측정 항목](#측정-개념) |
| Depth / Thickness (깊이·두께) | 트렌치 깊이, 박막 두께 등 세로 방향 치수. CD와 마찬가지로 코드에는 전용 측정 타입이 없고, 두 점을 세로로 찍는 `length` 측정과 사람이 붙이는 라벨로 표현합니다. 소개 문서가 말하는 "CD/Depth/Thickness 측정"은 모두 이 `length` 기하로 실현됩니다. | `MeasurementType.LENGTH` (`domain/entities.py`) |
| 측벽 각도 (sidewall angle) | 트렌치·구조물의 옆벽이 수직에서 기울어진 정도. 자동 추출기가 좌/우 측벽 edge에 직선을 최소제곱 적합해 바닥점에서의 기울기를 `angle` 측정으로 만듭니다. 벽이 사실상 수직이면(수평 이동 `< 1px`) 값을 지어내지 않고 skip합니다. | `_sidewall_feature`, `FEATURE_SIDEWALL_LEFT/RIGHT` (`domain/features.py`) |
| 곡률 반경 (curvature radius) | 원형 셀/컨택홀의 반경, 또는 트렌치 바닥 호(arc)의 곡률 반경. 세 점을 지나는 원을 적합해 반경을 nm로 냅니다. 바닥이 거의 평평하면("곡률은 원형이 보이면 그때만") 측정하지 않습니다. | `MeasurementType.CURVATURE`, `_fit_circle_radius_px` (`domain/calculations.py`); `_circle_feature`, `_curvature_feature` (`domain/features.py`) |
| 피치·간격 (pitch / spacing) | 반복 구조 사이의 중심 간 거리. 자동 추출기가 대표 region과 비교 가능한 이웃 region의 centroid를 잇는 `length`로 냅니다. | `_spacing_feature`, `FEATURE_SPACING` (`domain/features.py`) |
| 웨이퍼·랏·제품 (wafer / lot / product) | 이미지 출처를 식별하는 제조 메타데이터. `wafer_id`, `lot_id`, `product_id`로 저장되며 각각 카탈로그로 관리되는 콤보박스 값입니다. `product_id`는 측정 항목(카탈로그)의 범위 기준이기도 합니다. | `Image`, `CatalogCategory` (`domain/entities.py`) · [데이터 모델](/guide/data-model) |
| 공정 단계 (process step) | 이미지를 촬영한 공정 스텝(예: "Gate Etch"). 이미지 전체를 설명하는 선택적 자유 텍스트이며 개별 측정에 붙지 않습니다. | `Image.process_step` (`domain/entities.py`) |

## 측정 개념

| 용어 (영문) | 정의 | 코드 상 위치 / 링크 |
| --- | --- | --- |
| nm/pixel 보정 (calibration) | 이미지 1픽셀이 실제 몇 나노미터인지 나타내는 배율. 픽셀 거리에 이 값을 곱해 nm 값을 얻습니다. 반드시 `> 0`이어야 하며, 각도 측정에는 영향을 주지 않습니다. 각 측정은 계산 당시의 보정값을 함께 저장하므로, 이미지 보정값을 나중에 바꿔도 기존 측정은 자기 값을 유지합니다. | `calibration_nm_per_pixel` (`Image`, `Measurement`); `_validate_geometry`, `INVALID_CALIBRATION` (`domain/calculations.py`) |
| 좌표계 — 원본 픽셀 (image / original-pixel coordinates) | 저장·계산의 기준 좌표계. 원점은 좌상단, X는 오른쪽, Y는 아래로 증가합니다. 유효 점은 `0 <= x < pixel_width`, `0 <= y < pixel_height`. 측정 점은 항상 이 원본 픽셀로 저장되어 새로고침 후에도 같은 위치에 복원됩니다. | `_validate_point`, `POINT_OUT_OF_BOUNDS` (`domain/calculations.py`); `context.md` 서두 (`services/export_builder.py`) |
| 좌표계 — 화면 좌표 (screen coordinates) | 브라우저에서 이미지가 확대·이동된 상태의 픽셀 좌표. 사용자는 화면에서 클릭하지만, 저장 전 원본 픽셀 좌표로 환산됩니다. 저장·API·내보내기는 화면 좌표를 절대 쓰지 않습니다. | [프론트엔드](/guide/frontend) |
| 두 점 측정 / points (two-point selection) | 이미지 위에 순서대로 점을 찍어 기하를 정의하는 방식. `length`는 2점, `angle`·`curvature`는 3점(각도는 꼭짓점 먼저)입니다. 점 순서는 그대로 저장되어 도형을 다시 그리고 값을 재계산할 수 있습니다. | `Measurement.points`, `POINT_COUNT_BY_TYPE` (`domain/entities.py`) |
| measurement_type | 측정이 어떻게 그려지고 값이 무엇을 뜻하는지 고정하는 enum. 값은 `length`(선분 길이, nm), `angle`(꼭짓점 각도, deg), `curvature`(적합 원 반경, nm) 셋뿐입니다. 단위는 `UNIT_BY_TYPE`, 점 개수는 `POINT_COUNT_BY_TYPE`로 매핑됩니다. | `MeasurementType` (`domain/entities.py`) · [API 레퍼런스](/guide/api-reference) |
| 측정 값 (value / unit) | 서버가 점 좌표로부터 계산한 결과. `length`/`curvature`는 nm, `angle`은 deg. 값은 클라이언트가 아니라 항상 서버가 계산하며(신뢰 경계), 저장 정밀도는 float, 화면 표기는 소수 둘째 자리 반올림(half-up)입니다. | `calculate_measurement`, `round_for_display` (`domain/calculations.py`) |
| 측정 항목 (measurement item) | 한 제품 안에서 재사용하는, 이름 붙은 측정 정의. `name`(무엇을 재는가, 예: "Gate CD")과 `measurement_type`의 쌍이 제품 내에서 유일합니다. 측정 인스턴스는 `item_id`로 항목을 참조하며, 항목 없이 임시(ad-hoc) 측정도 가능합니다. | `MeasurementItem`, `Measurement.item_id` (`domain/entities.py`) |
| 라벨·메모 (label / note) | 측정에 붙는 두 개의 선택적 자유 텍스트. `label`은 무엇을 쟀는지 이름(도형 옆 캡션), `note`는 관찰 메모입니다. 둘 다 값에 영향을 주지 않고, 저장된 측정에서 유일하게 수정 가능한 필드입니다(좌표·값·보정값은 불변). 집계는 라벨이 아니라 `measurement_type`으로 묶습니다. | `Measurement.label/note`, `MeasurementAnnotationSchema` (`api/schemas.py`) |
| 미검토 참고값 (unreviewed reference value) | 이 앱의 측정은 자동 계측의 "정답(ground truth)"이 아니라 검토되지 않은 참고값이라는 원칙. 모든 측정의 `reference_status`는 `unreviewed`이며, 수동/자동을 저장·화면에서 구분해 기계 출력을 검증된 값처럼 제시하지 않습니다. | `ReferenceStatus.UNREVIEWED` (`domain/entities.py`); 소개 "한계" 절 (`docs/index.md`) |
| 출처 (source: manual / auto) | 측정을 누가 만들었는가. `manual`은 사람이 그린 것, `auto`는 특징 추출기가 세그멘테이션 라벨맵에서 파생한 것입니다. `auto`에는 0~1 자기추정 `confidence`가 붙습니다(`manual`은 null). | `MeasurementSource`, `Measurement.confidence` (`domain/entities.py`) |
| 보정 이력 (correction trail / adjusted) | 저장된 측정의 점을 사람이 옮길 수 있으나 조용히 덮어쓰지 않는 장치. 첫 보정 시 최초 기하·값을 `original_points`/`original_value`에 남기고 `adjusted_at`을 기록합니다. 세 값이 모두 null이면 아직 최초 산출 그대로입니다. | `Measurement.original_points/original_value/adjusted_at`, `is_adjusted` (`domain/entities.py`) |
| 예상 요약 (expected summary) | 내보내기 검증에 쓰는, measurement_type별 평균값 집계(고정 타입 순서). 내보낸 스냅샷의 이 요약이 측정과 일치하지 않으면 검증이 실패합니다. | `build_expected_summary`, `ExpectedSummaryEntry` (`domain/calculations.py`) |
| 홈 집계 (summary / KPI) | 홈 화면의 이미지 수·측정 수와 타입별 count/mean/min/max 통계. 같은 타입 안에서만 단위가 같아 비교 가능하며 타입 간(nm vs deg)에는 비교하지 않습니다. | `MeasurementTypeStat`, `SummaryView` (`domain/entities.py`, `api/schemas.py`) |

## 세그멘테이션·특징 추출 용어

| 용어 (영문) | 정의 | 코드 상 위치 / 링크 |
| --- | --- | --- |
| 세그멘테이션 (segmentation, multi-Otsu) | 이미지 밝기 히스토그램을 multi-Otsu로 여러 계급(class)으로 나누는 명암 기반 분할. 결정론적이며(무작위 상태 없음) 같은 입력·파라미터면 같은 결과가 나옵니다. `scripts/segment_tem_demo`의 동작을 그대로 이식했습니다. | `run_segmentation`, `segment` (`domain/segmentation.py`) |
| classes (계급 수) | 밝기를 몇 개 밴드로 나눌지. 2~6 사이 정수, 기본 4. 0=가장 어두움 … classes-1=가장 밝음. | `SegmentationRequestSchema.classes`, `_MIN/_MAX_CLASSES` (`api/schemas.py`, `domain/segmentation.py`) |
| denoise_weight | 분할 전 total-variation(TV) 노이즈 제거 강도. 기본 `0.08`, `> 0`. 클수록 부드러워집니다. | `SegmentationRequestSchema.denoise_weight`, `denoise_tv_chambolle` (`domain/segmentation.py`) |
| min_size | 계급별 소형 객체 정리 임계값(픽셀). 이보다 작은 조각·구멍은 제거·메움. 기본 `400`, `0`이면 정리 안 함. | `SegmentationRequestSchema.min_size`, `remove_small_objects/holes` (`domain/segmentation.py`) |
| thresholds / class_stats | 분할이 낸 계급 경계 밝기값들과 계급별 통계(픽셀 수, 면적 비율, 평균 밝기, 그리고 보정값이 있으면 `area_nm2 = pixels × nm/px²`). | `SegmentationClassStat`, `summarize` (`domain/entities.py`, `domain/segmentation.py`) |
| downscaled (다운스케일) | 픽셀 수가 예산(1.2M px)을 넘으면 축소해 분할한 뒤 라벨맵을 원본 해상도로 되돌렸는지 여부. 저장 라벨맵과 좌표·면적은 항상 원본 픽셀 기준입니다. | `_MAX_WORKING_PIXELS`, `run_segmentation` (`domain/segmentation.py`) |
| 특징 추출 (feature extraction) | 세그멘테이션 라벨맵에서 구조적 특징을 뽑아 자동(`auto`) 측정으로 만드는 단계. 각 특징은 값을 직접 내지 않고 측정 "점"으로 표현되어, 저장 값은 `calculate_measurement`가 좌표로부터 계산합니다(내보내기 검증과 바이트 단위로 일치). | `extract_features`, `FeaturePrimitive` (`domain/features.py`) |
| 특징 파라미터 (feature params) | 추출 실행의 조정 값: `target_class`(측정할 계급, 0=가장 어두움), `min_area`(최소 region 크기), `curvature_frac`(바닥 호 샘플 폭), `sidewall_band`(측벽 적합에 쓸 세로 구간 `[low, high]`), `max_radius_factor`(곡률 반경 상한). | `FeatureExtractionRequestSchema` (`api/schemas.py`); `extract_features` 기본값 (`domain/features.py`) |
| 대표 region / 반복 패턴 (representative region) | 한 계급 안에서 측정 대상으로 고르는 연결 성분. 비교 가능한 단위가 둘 이상인 반복 패턴(셀 행, N×M 격자, 홀 필드)에서는 잘린 가장자리 단위 대신 이미지 중심에 가장 가까운 단위를 고릅니다. 단일 구조면 가장 큰 것을 씁니다. | `_pick_region`, `_PATTERN_AREA_FRAC` (`domain/features.py`) |
| skipped feature (건너뛴 특징) | 기하가 퇴화(예: 평평한 바닥엔 곡률 없음, 수직 벽엔 기울기 없음)해 측정을 만들 수 없을 때, 지어내지 않고 사유와 함께 남기는 항목. | `SkippedFeature`, `FeatureExtractionResultView.skipped` (`domain/features.py`, `api/schemas.py`) |
| 특징 키 (feature keys) | 안정적 식별자이자 자동 측정 라벨 접미사이자 TIFF `features` 태그의 키: `width_cd`, `height`, `spacing`, `circle_radius`, `bottom_curvature`, `sidewall_angle_left/right`. | `FEATURE_*`, `FEATURE_ORDER` (`domain/features.py`) |
| 배치 처리 (batch) | 여러 이미지에 세그멘테이션(선택적으로 특징 추출까지)을 한 번에 돌리는 요청. 이미지당 성공/실패와 특징 수를 개별 보고합니다. | `SegmentationBatchRequestSchema`, `SegmentationBatchResultView` (`api/schemas.py`) |

## 데이터·내보내기·시스템 용어

| 용어 (영문) | 정의 | 코드 상 위치 / 링크 |
| --- | --- | --- |
| 개발 컨텍스트 내보내기 (Development Context export) | 이 앱의 대표 산출물. 선택한 이미지 하나와 그 저장 측정 전부를, 좌표계·단위·계산 규칙·검증 정답과 함께 고정 스키마 ZIP으로 내보내 외부 AI 개발 도구가 사람의 반복 설명 없이 소비하도록 합니다. | `ContextExportService`, `GET /api/images/{image_id}/context-export` (`services/`, `api/routes.py`) · [컨텍스트 내보내기](/guide/context-export) |
| 4파일 ZIP (context.md / data.json / task.md / checks.json) | 내보내기의 고정 구성. `context.md`=사람·AI가 읽는 규칙 설명, `data.json`=이미지·측정 데이터, `task.md`=개발 과제 지시, `checks.json`=검증용 예상 요약과 합성 계산. 파일 이름·순서·타임스탬프까지 고정해 결정론적입니다. | `ENTRY_NAMES`, `build_context_zip` (`services/export_builder.py`) |
| schema_version | 내보내기 스키마 버전 문자열. 소비 측이 형식 변화를 감지하도록 `data.json`·`checks.json`에 담깁니다. 현재 코드 값은 `"3.1"`입니다(문서에 남은 `2.0`/`3.0`은 과거 값). | `ContextExportService.schema_version` (`services/context_export_service.py`) |
| 내보내기 스냅샷 (ExportSnapshot) | 내보낼 이미지·측정·예상 요약을 담는 불변 값. 검증기가 측정 값을 좌표에서 재계산해 저장값과 일치하는지, 측정이 모두 선택 이미지에 속하는지, ID 순서인지 확인합니다(불일치면 내보내기 거부). | `ExportSnapshot`, `validate_export_snapshot` (`domain/entities.py`, `domain/calculations.py`) |
| 파생물 (derived artifacts) | 원본에서 생성된 부산물: 세그멘테이션 컬러맵·경계 PNG, 라벨맵, 그리고 TIFF 원본일 때의 태그 사본. `<upload_root>/derived/{image_id}/`에 이미지별로 묶여 원자적으로 저장됩니다. 원본은 절대 수정하지 않습니다. | `DerivedStore` (`adapters/derived_store.py`); `SegmentationResult.*_path` (`domain/entities.py`) |
| 태그 TIFF (tagged TIFF) | 분석 결과를 사설 TIFF 태그에 담은 파생 사본(`tagged.tif`). 등록 태그(65000–65004)는 그대로 복사하고, 분석 태그를 추가: 65010 `segmentation`, 65011 `features`(JSON), 65012 `class_area_nm2`, 65013 `source_sha256`. TIFF 원본에 대해서만 만들어집니다. | `write_tagged_tiff`, `EXTENDED_TAGS` (`adapters/tiff_tags.py`) |
| 표시용 파생 PNG (display_filename) | `<img>`가 그대로 못 그리는 형식(예: TIFF)을 브라우저에서 보여주기 위한 PNG 사본. null이면 원본을 직접 제공합니다. | `Image.display_filename` (`domain/entities.py`) |
| 카탈로그 옵션 (catalog option) | image_type·product_id·lot_id·wafer_id·process_step 콤보박스를 채우는 관리형 조회 목록의 개별 값. `is_predefined`로 표시된 시드 값(TEM/SEM, W01–W25 등)은 삭제가 막혀 있고, 운영자가 추가한 값은 삭제 가능합니다. | `CatalogOption`, `CatalogCategory` (`domain/entities.py`) · [데이터 모델](/guide/data-model) |
| upload root / var/uploads | 업로드 원본과 파생물이 놓이는 루트 디렉터리(기본 `var/uploads`). 상대 저장 키로 다루므로 데이터 디렉터리를 옮겨도 동작합니다. Git에 커밋하지 않습니다. | `Settings.upload_root` (`settings.py`); `FileStore`/`DerivedStore` (`adapters/`) |
| NANODB_PROFILE | 런타임 프로파일 환경변수(기본 `demo`). 파괴적 demo 도구(`seed-demo`, `reset`)의 가드로 쓰여, `NANODB_PROFILE=demo`가 아니면 실행을 거부해 운영 DB를 실수로 초기화하는 것을 막습니다. | `Settings.nanodb_profile` (`settings.py`); `scripts/reset_demo.py`, `Makefile` |
| DATABASE_URL | PostgreSQL 연결 문자열(코드 외부 환경변수 주입). 코드에 비밀값을 하드코딩하지 않는 원칙의 일부입니다. | `Settings.database_url` (`settings.py`); `.env.example` |
| 에러 봉투 (ErrorEnvelope / DomainError) | 도메인 규칙 위반을 `code`·`message`·선택적 `field`로 표현하는 일관 오류 형식. 예: `INVALID_CALIBRATION`, `COLLINEAR_POINTS`, `UNSEGMENTABLE_IMAGE`. | `ErrorEnvelope` (`api/schemas.py`); `DomainError` (`domain/errors.py`) |
| AI-DLC (AI-Driven Development Lifecycle) | 이 프로젝트를 만든 단계형 워크플로우(INCEPTION → CONSTRUCTION). 각 단계 산출물이 다음 단계로 이어진 흔적이 `aidlc-docs/`에 남아 있습니다(`inception/`, `construction/`, `aidlc-state.md`, `audit.md`). 앱 런타임의 일부가 아니라 개발 방법론입니다. | `aidlc-docs/`, `CLAUDE.md` |

---

정의가 코드와 어긋나 보이면 코드가 정답입니다. 특히 `MeasurementType`은 `length`/`angle`/
`curvature` 셋뿐이며, CD·Depth·Thickness·측벽 각도·피치는 모두 이 셋 위에 라벨과 특징
추출로 얹은 의미 계층이라는 점을 기억하세요.
