# NANoDB Core Business Rules

## BR-IMG: 이미지 등록

- **BR-IMG-01**: 파일, 종류, Product, Lot, Wafer와 보정값은 모두 필수다. 문자열은 공백만으로 구성될 수 없다.
- **BR-IMG-02**: 파일은 한 개만 받으며 최대 크기는 20MB다.
- **BR-IMG-03**: 실제 decoding 결과가 PNG 또는 JPEG여야 한다. 확장자와 MIME 선언만으로 승인하지 않는다.
- **BR-IMG-04**: `image_type`은 `SEM` 또는 `TEM`만 허용한다.
- **BR-IMG-05**: `calibration_nm_per_pixel`은 숫자로 해석 가능하고 유한하며 0보다 커야 한다.
- **BR-IMG-06**: 원본 pixel width와 height는 decoding 결과의 양의 정수여야 한다.
- **BR-IMG-07**: 내부 file key는 시스템이 만들며 원본 파일명을 경로나 저장 키로 직접 사용하지 않는다.
- **BR-IMG-08**: file과 metadata가 모두 준비돼야 등록 성공이다. 부분 실패한 항목은 목록에 노출하지 않는다.
- **BR-IMG-09**: 원본 이미지를 수정, 덮어쓰기 또는 삭제하는 사용자 기능을 제공하지 않는다.

## BR-CAT: 목록·상세·요약

- **BR-CAT-01**: Image 목록은 최신 등록순으로 반환한다. 동일 시각에는 ID로 결정적 순서를 만든다.
- **BR-CAT-02**: 각 Image의 측정 건수는 현재 저장된 연결 Measurement 수다.
- **BR-CAT-03**: 존재하지 않는 Image 상세를 성공 빈값으로 반환하지 않는다.
- **BR-CAT-04**: Measurement 목록은 최신 생성순으로 반환한다.
- **BR-SUM-01**: 전체 Image와 Measurement 수는 실제 저장 데이터를 집계한다.
- **BR-SUM-02**: 집계 기준 시각을 결과에 포함하고 화면에서 시간대를 표시한다.
- **BR-SUM-03**: 데이터가 없으면 0 또는 `측정 없음`을 사용하며 예시 KPI로 대체하지 않는다.
- **BR-SUM-04**: 항목별 평균과 검색은 P1이며 P0에 포함하지 않는다.

## BR-MEA: 두 점 측정

- **BR-MEA-01**: `parameter_type`은 `CD`, `Depth`, `Thickness` 중 하나다.
- **BR-MEA-02**: 모든 좌표는 숫자이며 유한해야 한다.
- **BR-MEA-03**: 각 점은 원본 기준 `0 <= x < pixel_width`, `0 <= y < pixel_height`를 만족해야 한다.
- **BR-MEA-04**: 시작점과 끝점은 같을 수 없다.
- **BR-MEA-05**: 서버는 `sqrt((end_x - start_x)^2 + (end_y - start_y)^2)`로 `distance_px`를 계산한다.
- **BR-MEA-06**: 서버는 Image의 보정값으로 `value_nm = distance_px * calibration_nm_per_pixel`을 계산한다.
- **BR-MEA-07**: 클라이언트가 보낸 `distance_px`, 보정값 또는 `value_nm`은 저장 기준으로 신뢰하지 않는다.
- **BR-MEA-08**: `distance_px`와 `value_nm`은 유한한 양수여야 한다.
- **BR-MEA-09**: 저장 시 사용한 보정값과 반올림 전 계산값을 Measurement에 보존한다.
- **BR-MEA-10**: 표시값은 decimal half-up 방식으로 소수점 둘째 자리까지 만든다. 저장값은 표시 반올림으로 변경하지 않는다.
- **BR-MEA-11**: 저장 성공 응답은 생성된 Measurement를 포함해 UI가 즉시 목록과 overlay를 갱신할 수 있어야 한다.
- **BR-MEA-12**: MVP Measurement는 `manual_two_point`, `unreviewed`로 해석한다. 이를 자동 경계 판정이나 인증된 정답으로 표현하지 않는다.

## BR-RES: 좌표 변환과 복원

- **BR-RES-01**: browser click은 CSS 영역이 아니라 실제로 표시된 이미지 사각형을 기준으로 해석한다.
- **BR-RES-02**: 표시 좌표에서 이미지 사각형의 offset을 뺀 뒤 원본/표시 크기 비율을 적용해 원본 좌표로 변환한다.
- **BR-RES-03**: viewer 여백이나 letterbox 영역 클릭은 이미지 밖 입력으로 거부한다.
- **BR-RES-04**: 저장된 원본 좌표가 source of truth이며 resize와 reload 때마다 표시 좌표를 다시 계산한다.
- **BR-RES-05**: 알려진 기준 사례에서 100%와 50% 표시 크기 모두 각 끝점이 원본 기준 1px 이내로 복원되어야 한다.
- **BR-RES-06**: 정확한 좌표 `(100,100)`과 `(400,500)`의 거리는 500px이고 0.2nm/pixel 적용값은 100nm다.
- **BR-RES-07**: 수동 클릭 기준 사례는 100nm 대비 0.4nm 이내를 허용한다.

## BR-CTX: 개발 컨텍스트 내보내기

- **BR-CTX-01**: 저장 Measurement가 한 건 이상인 Image만 내보낼 수 있다.
- **BR-CTX-02**: 한 번의 export는 선택 Image 한 개와 그 Image의 저장 Measurement 전체만 포함한다.
- **BR-CTX-03**: ZIP에는 UTF-8 `context.md`, `data.json`, `task.md`, `checks.json`만 필수 파일명으로 넣는다. 사용자 입력을 archive path로 쓰지 않는다.
- **BR-CTX-04**: 이미지 바이너리, 다른 Image, 전체 database, 내부 절대 경로, 비밀정보와 감사 로그를 포함하지 않는다.
- **BR-CTX-05**: `data.json`은 `schema_version`, `exported_at`, `image`, `measurements`를 포함하며 Measurement는 ID 오름차순이다.
- **BR-CTX-06**: `context.md`는 좌상단 원점, 오른쪽 X, 아래쪽 Y, 좌표 범위, 유클리드 거리, nm 환산과 표시 반올림을 설명한다.
- **BR-CTX-07**: `task.md`는 `parameter_type,count,mean_nm` CSV를 요청한다. 순서는 CD, Depth, Thickness이고 측정이 있는 항목만 출력한다.
- **BR-CTX-08**: 평균은 저장 정밀도로 계산하고 표시만 소수점 둘째 자리로 반올림한다.
- **BR-CTX-09**: `checks.json`은 snapshot 기대 건수·반올림 전 평균, 0.000001nm 허용 오차와 500px·100nm 독립 사례를 포함한다.
- **BR-CTX-10**: export에는 `measurement_method: manual_two_point`, `reference_status: unreviewed`를 포함한다. 이는 고정된 MVP 계약값으로 계산할 수 있으며 별도 database column을 요구하지 않는다.
- **BR-CTX-11**: 같은 snapshot은 `exported_at`과 ZIP metadata를 제외하면 동일한 계약 내용과 순서를 생성한다.
- **BR-CTX-12**: 한국어 메모와 특수문자는 JSON parsing과 압축 해제 후 보존되어야 한다.
- **BR-CTX-13**: 내보내기 전에 제조 식별정보, 원본 파일명과 메모가 포함됨을 사용자에게 알린다.
- **BR-CTX-14**: 앱은 외부 전송, 모델 호출이나 생성 코드 실행을 수행하지 않는다.
- **BR-CTX-15**: 내보내기 검증 또는 생성이 실패하면 부분 ZIP을 성공 결과로 제공하지 않는다.

## BR-DAT: 데모 데이터와 초기화

- **BR-DAT-01**: 데모에는 승인된 PNG/JPEG와 metadata가 최소 3세트 있어야 한다.
- **BR-DAT-02**: 승인 상태는 최소 `PROJECT_AUTHORIZED`여야 한다.
- **BR-DAT-03**: TIFF 파생 PNG는 원천 ID, SHA-256과 변환 시각을 추적하고 pixel width와 height를 유지한다.
- **BR-DAT-04**: 리샘플링한 파생본에 원천 보정값을 그대로 재사용하지 않는다.
- **BR-DAT-05**: 초기화 대상은 전용 demo database 데이터와 runtime upload다. source sample은 대상이 아니다.
- **BR-DAT-06**: 초기화 완료 후 알려진 Image와 Measurement 건수를 확인한다.

## BR-EVL: 외부 검증 근거

- **BR-EVL-01**: 독립 집계 사례는 CD 10nm·20nm와 Depth 30nm이며 기대 결과는 CD 2건·15.00nm, Depth 1건·30.00nm, Thickness 행 없음이다.
- **BR-EVL-02**: CSV header, row order와 count는 정확히 일치해야 한다.
- **BR-EVL-03**: 실제 생성 코드를 최소 한 번 검토·실행하고 prompt, code, command, input version과 결과를 남겨야 개발 지원 gate가 완료된다.
- **BR-EVL-04**: 실패, 미실행 또는 도구 부재를 성공으로 표현하지 않는다.
- **BR-EVL-05**: 수작업 설명과 context 사용 비교는 같은 과제·원천 데이터·사용자를 사용하며 준비 시간, 추가 요청 수와 통과 수를 기록한다.

## 오류 결과

| 조건 | 도메인 결과 |
| --- | --- |
| 수정 가능한 입력 오류 | field 또는 action 수준의 명확한 오류 |
| 존재하지 않는 대상 | 대상 없음 |
| 저장소 실패 | 저장 실패, 성공 entity 없음 |
| 유효하지 않은 export snapshot | export 거부, ZIP 없음 |
| 예상하지 못한 실패 | 내부 상세를 제외한 일반 오류 |
