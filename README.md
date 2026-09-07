<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo/nanodb_logo_horizontal_dark.png">
    <img src="assets/logo/nanodb_logo_horizontal.png" alt="NANoDB — Nano Assets, Never orphaned Database" width="720">
  </picture>
</p>

<p align="center">
  <strong>NANoDB: Nano Assets, Never orphaned Database.</strong><br>
  나노 자산은 고아가 되지 않는다<br>
  <sub>데이터는 쌓이고, 툴은 이어진다.</sub>
</p>

# NANoDB

NANoDB는 SEM/TEM 이미지를 Product, Lot, Wafer 등의 제조 식별정보와 함께 등록하고, 이미지 위 두 점을 선택해 실제 길이를 측정·저장하는 경량 웹 애플리케이션입니다. 이름은 `Nano Assets, Never orphaned Database`에서 왔으며, 나노 자산이 담당자나 도구의 변화 속에서도 고아가 되지 않게 하는 것을 지향합니다.

> 현재 저장소에는 MVP 요구사항, AI-DLC 워크플로우, 로고와 검증된 샘플 데이터가 준비되어 있습니다. 웹 애플리케이션 구현은 다음 단계입니다.

## MVP에서 보여줄 것

1. PNG/JPEG 이미지를 제조 메타데이터와 함께 등록합니다.
2. 파일명, Product, Lot, Wafer로 이미지를 검색합니다.
3. 이미지 위에서 두 점을 선택해 CD, Depth, Thickness를 측정합니다.
4. `nm/pixel` 보정값으로 실제 길이를 계산합니다.
5. 저장된 좌표와 측정값을 새로고침 후에도 같은 위치에 복원합니다.
6. 홈에서 실제 이미지 수, 측정 수, 항목별 표본 수와 평균을 확인합니다.

윤곽 라벨링, 피처 자동 추출, Tool 등록, Lineage, Report는 이번 8시간 MVP의 후속 로드맵입니다.

## 샘플 데이터

| 데이터 묶음 | 수량 | 내용 | Manifest |
| --- | ---: | --- | --- |
| TEM | 12 | DRAM, Flash, Logic TEM 샘플과 TIFF private tag | [`data/samples/tem/metadata.csv`](data/samples/tem/metadata.csv) |
| Layout | 2 | 4T APS 센서 레이아웃, 1T1C DRAM 레이아웃 | [`data/samples/layout/metadata.csv`](data/samples/layout/metadata.csv) |

각 manifest에는 안정적인 sample ID, 파일명, SHA-256, 도메인 메타데이터와 프로젝트 사용 승인 상태가 들어 있습니다. TIFF 파일은 일반 Git 바이너리로 함께 관리합니다.

샘플 TIFF는 원본 데이터와 메타데이터 처리 검증용입니다. 현재 MVP의 브라우저 직접 등록 형식은 PNG/JPEG이며, TIFF 직접 업로드나 웹 표시 변환은 후속 범위입니다.

### 샘플 검증

Python 3.10 이상을 권장합니다.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

python scripts/verify_tem_samples.py
python scripts/verify_layout_samples.py
```

검증기는 다음 항목을 확인합니다.

- Manifest에 기록된 파일의 누락 또는 초과
- SHA-256 파일 무결성
- 이미지 크기, 색상 모드와 압축 형식
- TEM TIFF private tag와 manifest 값의 일치

### TEM 메타데이터 읽기

```powershell
python scripts/tem_metadata.py data/samples/tem/images/tem_001.tif
```

`write_meta()`는 원본을 덮어쓰지 않고 별도 파생 TIFF만 생성합니다. `scrap_step`은 현재 숫자형 문자열과 코드형 문자열이 혼재하므로 도메인 정의가 확정될 때까지 문자열로 취급합니다.

## 저장소 구조

```text
nanodb_mvp/
├── assets/logo/                 # 라이트·다크 로고
├── data/samples/
│   ├── tem/                     # TEM 이미지와 manifest
│   └── layout/                  # 센서·DRAM layout과 manifest
├── scripts/                     # 메타데이터 읽기와 샘플 검증
├── requirements/                # 8시간 MVP 요구사항
├── references/                  # 로고·홈 탭 기준 PDF
├── aidlc-docs/                  # AI-DLC 상태와 산출물
├── AGENTS.md                    # Codex용 AI-DLC 지침
└── CLAUDE.md                    # Claude Code용 AI-DLC 지침
```

## 요구사항 문서

- [NANoDB 8시간 MVP 요구사항](requirements/nanodb-mvp-requirements.md)
- [홈 탭 요구사항](requirements/home-tab-requirements.md)
- [의도적 제외사항](requirements/constraints.md)
- [AI-DLC 통합 요구사항](aidlc-docs/inception/requirements/requirements.md)

## 데이터 관리 원칙

- 원본 이미지는 직접 수정하지 않습니다.
- 측정과 수정 실험 결과는 원본과 분리된 파생 데이터로 저장합니다.
- 이미지 교체 시 manifest의 SHA-256과 메타데이터를 함께 갱신합니다.
- 런타임 업로드, SQLite 파일, 생성 결과는 Git에 커밋하지 않습니다.
- 공개 통계, 예시 KPI와 실제 데이터 집계값을 명확히 구분합니다.

## 개발 워크플로우

이 저장소에는 AWS Labs AI-DLC v1.0.1 워크플로우가 설치되어 있습니다.

- Codex: `AGENTS.md`, `.agents/skills/aidlc/`
- Claude Code: `CLAUDE.md`, `.aidlc-rule-details/`
- 진행 상태: `aidlc-docs/aidlc-state.md`

## 프로젝트 상태

- [x] 8시간 MVP 범위 정의
- [x] 홈 탭 요구사항 정리
- [x] 라이트·다크 로고 준비
- [x] TEM/Layout 샘플과 manifest 검증
- [ ] 웹 애플리케이션 구현
- [ ] 핵심 데모 시나리오 검증

## License

프로젝트 전체의 오픈소스 라이선스는 아직 지정되지 않았습니다. 샘플 데이터의 `PROJECT_AUTHORIZED` 표시는 이 저장소에서의 사용 승인을 뜻하며 별도의 SPDX 라이선스 선언은 아닙니다.
