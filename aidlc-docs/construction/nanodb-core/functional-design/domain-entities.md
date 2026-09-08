# NANoDB Core Domain Entities

## Image

등록된 원본 이미지와 제조 식별정보의 aggregate root다.

| 속성 | 의미 | 제약 |
| --- | --- | --- |
| `id` | 내부 식별자 | 유일, 불변 |
| `original_filename` | 사용자 파일명 | 필수, 표시 용도 |
| `stored_filename` | 내부 file key | 필수, 사용자 입력을 그대로 사용하지 않음 |
| `image_type` | 이미지 종류 | `SEM` 또는 `TEM` |
| `product_id` | Product 식별 문자열 | 필수 |
| `lot_id` | Lot 식별 문자열 | 필수 |
| `wafer_id` | Wafer 식별 문자열 | 필수 |
| `calibration_nm_per_pixel` | 픽셀당 nm | 유한한 양수 |
| `pixel_width` | 원본 너비 | 양의 정수 |
| `pixel_height` | 원본 높이 | 양의 정수 |
| `created_at` | 등록 시각 | ISO 8601로 표현 가능한 시각 |

Image 원본과 보정값을 수정·삭제하는 MVP 기능은 없다.

## Measurement

Image에서 파생된 수동 두 점 측정이다.

| 속성 | 의미 | 제약 |
| --- | --- | --- |
| `id` | 내부 식별자 | 유일, 불변 |
| `image_id` | 소유 Image | 존재하는 Image를 참조 |
| `parameter_type` | 사용자가 선택한 항목 | `CD`, `Depth`, `Thickness` 중 하나 |
| `start_x`, `start_y` | 원본 시작 좌표 | Image 범위 안 |
| `end_x`, `end_y` | 원본 끝 좌표 | Image 범위 안, 시작점과 다름 |
| `distance_px` | 유클리드 픽셀 거리 | 서버 계산, 유한한 양수 |
| `calibration_nm_per_pixel` | 측정 당시 보정값 snapshot | 유한한 양수 |
| `value_nm` | 실제 길이 | 서버 계산, 유한한 양수 |
| `note` | 사용자 메모 | 선택값, 텍스트 |
| `measurement_method` | 측정 방식 | MVP에서는 `manual_two_point` |
| `reference_status` | 근거 상태 | MVP에서는 `unreviewed` |
| `created_at` | 생성 시각 | ISO 8601로 표현 가능한 시각 |

Measurement는 인증된 정답이나 Product/Lot/Wafer의 대표 표본을 의미하지 않는다.

## ExportSnapshot

내보내기 시점에 생성되는 비영속 value object다.

| 속성 | 의미 | 제약 |
| --- | --- | --- |
| `schema_version` | data contract version | 필수 고정 version |
| `exported_at` | 내보내기 시각 | snapshot 생성 시각 |
| `image` | 선택 Image 사본 | 정확히 한 개 |
| `measurements` | 연결 Measurement 사본 | 한 개 이상, ID 오름차순 |
| `synthetic_check` | 독립 계산 사례 | 1000×800px, 500px, 100nm 사례 |
| `expected_summary` | 항목별 기대 집계 | 저장 snapshot에서 결정적으로 계산 |

ExportSnapshot은 다른 Image, 이미지 바이너리, 내부 절대 경로, 비밀정보와 감사 로그를 포함하지 않는다.

## DemoSampleManifestEntry

데모 입력의 사용 승인과 보정값을 확인하기 위한 준비 데이터다. runtime Image와 동일하지 않다.

| 속성 | 의미 | 제약 |
| --- | --- | --- |
| `sample_id` | 원천 sample 식별자 | 필수 |
| `demo_file` | 등록 가능한 PNG/JPEG 위치 | 존재하고 decoding 가능 |
| `source_sha256` | 원천 TIFF hash | TIFF 파생본이면 필수 |
| `converted_at` | 파생 시각 | TIFF 파생본이면 필수 |
| `image_type` | SEM/TEM | 필수 |
| `product_id`, `lot_id`, `wafer_id` | 제조 식별정보 | 필수 |
| `calibration_nm_per_pixel` | 보정값 | 유한한 양수 |
| `authorization_status` | 사용 승인 상태 | 최소 `PROJECT_AUTHORIZED` |

## ExternalVerificationEvidence

앱 밖 AI 개발 검증의 근거 묶음이다. MVP runtime database entity로 강제하지 않고 재현 가능한 파일 기반 evidence로 보존할 수 있다.

| 속성 | 의미 |
| --- | --- |
| `input_schema_version` | 사용한 export contract version |
| `prompt` | 최초 전달 요청 |
| `model_and_version` | 확인 가능한 도구·모델 정보 |
| `generated_code` | 실제 생성 결과 |
| `execution_command` | 로컬 실행 명령 |
| `executed_at` | 실행 시각 |
| `result` | 통과, 실패 또는 미검증 |
| `comparison_metrics` | 준비 시간, 추가 요청 수, 검증 통과 수 |

## 관계와 소유권

- Image 1개는 Measurement 0개 이상을 소유한다.
- Measurement는 정확히 1개의 Image에 속하며 독립적으로 존재하지 않는다.
- ExportSnapshot은 정확히 1개의 Image와 그 Image의 저장 Measurement만 참조한다.
- DemoSampleManifestEntry는 등록 전 준비 데이터이며 등록 후 생성된 Image ID를 소유하지 않아도 된다.
- ExternalVerificationEvidence는 사용한 ExportSnapshot version과 결과를 연결하지만 Core runtime의 상태 변경을 유발하지 않는다.
