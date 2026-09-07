# Layout sample data

이 디렉터리는 NanoDB에서 레이아웃 이미지 조회와 메타데이터 표시를 시연하기 위한 로컬 샘플을 보관한다.

## 구조

- `images/`: 센서와 DRAM TIFF 레이아웃 이미지
- `metadata.csv`: 분류, 구조, 배열 크기, 이미지 속성, SHA-256과 출처 상태를 기록한 manifest
- `scripts/verify_layout_samples.py`: manifest와 실제 파일의 해시·크기·포맷을 검증하는 도구

## 샘플 분류

| sample_id | 분류 | 화면에서 확인한 내용 |
| --- | --- | --- |
| `layout_001` | Image sensor | 4T APS pixel layout, 2 × 2 pixel unit |
| `layout_002` | DRAM | Generic 1T1C DRAM, 32 × 8 cell array partial view |

`physical_unit=um`은 이미지에 표시된 축척 단위만 뜻한다. 정확한 `um/pixel` 보정값은 별도 측정이나 원본 설계 데이터 없이 추정하지 않는다. 기술 정보가 화면에 없는 센서 샘플은 `technology=UNSPECIFIED`로 기록했다.

## 기준 데이터와 사용권

`metadata.csv`를 이 샘플 묶음의 manifest로 사용한다. 원본 TIFF에는 표준 이미지 태그만 있으며 NanoDB private metadata tag를 새로 쓰지 않는다.

현재 모든 샘플은 다음 상태다.

- `source=project_owner_provided`
- `license=PROJECT_AUTHORIZED`
- `is_synthetic=unknown`

프로젝트 소유자가 공개 저장소 사용을 승인한 샘플이다. `PROJECT_AUTHORIZED`는 SPDX 라이선스 식별자가 아니라 이 프로젝트에서의 공개 사용 승인 상태를 뜻한다.

## 검증

프로젝트 루트에서 실행한다.

```powershell
python scripts/verify_layout_samples.py
```

라이선스 미확정은 경고로, 파일 누락·초과·해시 또는 이미지 속성 불일치는 오류로 처리한다.
