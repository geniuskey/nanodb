# Component Methods

언어와 프레임워크에 독립적인 고수준 계약이다. 검증 수식과 상세 오류 규칙은 Functional Design에서 확정한다.

| 컴포넌트 | 메서드 | 입력 | 출력 | 목적 |
| --- | --- | --- | --- | --- |
| Image Service | `registerImage(file, metadata)` | 이미지 파일, 종류, Product/Lot/Wafer, 보정값 | `ImageView` | 파일과 메타데이터 저장 |
| Image Service | `listImages()` | 없음 | `ImageSummary[]` | 최신순 이미지와 측정 건수 조회 |
| Image Service | `getImage(imageId)` | 이미지 ID | `ImageView` | 측정 화면에 필요한 이미지 조회 |
| Measurement Service | `createMeasurement(imageId, input)` | 항목, 원본 두 점, 메모 | `MeasurementView` | 서버 계산 후 측정 저장 |
| Measurement Service | `listMeasurements(imageId)` | 이미지 ID | `MeasurementView[]` | 저장 측정 최신순 조회 |
| Summary Service | `getSummary()` | 없음 | `SummaryView` | 실제 이미지·측정 수와 기준 시각 조회 |
| Context Export Service | `buildExport(imageId)` | 이미지 ID | `DownloadPayload` | 네 파일을 담은 로컬 ZIP 생성 |
| Image Repository | `save/find/list/count` | 도메인 데이터 또는 ID | 저장·조회 결과 | Image 레코드 지속성 |
| Measurement Repository | `save/listByImage/count` | 측정 데이터 또는 이미지 ID | 저장·조회 결과 | Measurement 레코드 지속성 |
| File Store | `save/open` | 안전한 내부 파일 키 | 파일 결과 | 원본 이미지 저장·조회 |

`ImageView`, `MeasurementView`, `SummaryView`, `DownloadPayload`의 구체 필드는 승인된 요구사항의 Image, Measurement와 CTX 계약을 따른다.
