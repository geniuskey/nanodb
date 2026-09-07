# TEM sample data

이 디렉터리는 NanoDB 로컬 데모와 개발 검증에 사용하는 TEM 샘플 manifest를 보관한다.

## 구조

- `images/`: 로컬 TIFF 샘플. 재배포 권한 확인 전까지 `.gitignore`로 제외한다.
- `metadata.csv`: 이미지 파일명, 정규화된 메타데이터, 원래 파일명, SHA-256, 출처 상태를 기록한 manifest다.
- `scripts/tem_metadata.py`: TIFF private tag `65000`~`65004`를 읽고 파생 복사본을 만드는 도구다.

## 기준 데이터

TIFF에 내장된 private tag를 메타데이터 원본으로 취급한다. `metadata.csv`는 샘플 목록, 파일 무결성, 출처와 라이선스 상태를 확인하기 위한 manifest다.

현재 로컬에 존재하는 12개 TIFF만 manifest에 포함한다. 기존 CSV에만 있던 `TEM8.tif`와 `KakaoTalk_20260907_155859065_02.tif` 행은 대응 파일이 없어 제외했다.

## 사용권 확인

현재 모든 항목은 다음 상태다.

- `source=project_owner_provided`
- `license=PROJECT_AUTHORIZED`
- `is_synthetic=unknown`

프로젝트 소유자가 공개 저장소 사용을 승인한 샘플이다. `PROJECT_AUTHORIZED`는 SPDX 라이선스 식별자가 아니라 이 프로젝트에서의 공개 사용 승인 상태를 뜻한다.

## 메타데이터 읽기

프로젝트 루트에서 다음과 같이 실행한다.

```powershell
python -m pip install -r requirements.txt
python scripts/tem_metadata.py data/samples/tem/images/tem_001.tif
```

## 무결성 확인

파일을 변경하거나 교체하면 SHA-256을 다시 계산해 manifest와 일치하는지 확인한다. 원본 샘플은 직접 수정하지 않는다. 메타데이터 수정 실험은 `write_meta()`로 `var/derived/` 아래에 새 파일을 만든다.

```powershell
python scripts/verify_tem_samples.py
```

해시, TIFF 내장 메타데이터, 누락·초과 파일을 검사한다. `license=UNVERIFIED`는 경고이며, 파일이나 메타데이터 불일치는 오류다.

## 알려진 스키마 주의사항

`scrap_step`에는 숫자형 문자열과 `STEP_ETCH_01` 같은 코드형 문자열이 함께 있다. 도메인 의미가 확정되기 전까지 문자열로 읽고, 숫자 계산에 사용하지 않는다.
