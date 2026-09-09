# 컨텍스트 내보내기

NANoDB의 **개발 컨텍스트 내보내기(Development Context export)** 는 하나의 이미지에 저장된 측정 근거를 좌표계·단위·계산 규칙·검증용 정답과 함께 ZIP 하나로 묶어 내보내는 기능이다. 이 페이지는 그 ZIP이 정확히 어떤 파일로 구성되는지, 어떻게 조립되는지, 외부 AI 개발 도구가 이를 어떻게 소비하는지, 그리고 스키마를 확장할 때 무엇을 조심해야 하는지를 실제 코드에 근거해 설명한다.

관련 문서: [개요](/guide/) · [아키텍처](/guide/architecture) · [백엔드](/guide/backend) · [데이터 모델](/guide/data-model) · [API](/guide/api-reference) · [테스트·빌드·배포](/guide/testing-and-ci) · [용어집](/guide/glossary) · [확장·기여](/guide/contributing)

## 1. 왜 이 기능이 핵심인가

이 기능은 NANoDB의 차별점이다. 측정값만 넘기면 외부 AI 도구는 좌표 원점이 어디인지, 단위가 무엇인지, 값을 어떻게 다시 계산하는지, 무엇이 정답인지를 매번 사람이 다시 설명해야 한다. 컨텍스트 내보내기는 그 설명을 근거와 함께 파일로 고정해 함께 내보내므로, 외부 도구가 사람의 재설명 없이 데이터를 소비할 수 있게 한다. 다만 정직하게 말하면 이것이 토큰 절감이나 성능 향상을 증명하는 것은 아니다. 이 기능이 보장하는 것은 "설명 자산과 검증 절차가 존재한다"는 사실뿐이며, 실제 비교 결과는 아래 [외부 AI 검증 데모](#_5-외부-ai-검증-데모)에 pass/fail/unverified로 기록될 뿐이다.

내보내기 진입점은 백엔드 라우트 하나다 (`src/backend/nanodb/api/routes.py:449`):

```python
@router.get("/images/{image_id}/context-export")
def context_export(image_id: int, request: Request) -> Response:
    content = request.app.state.context_export_service.build(image_id)
    return Response(
        content=content,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="nanodb-image-{image_id}.zip"'
        },
    )
```

응답은 `application/zip`이며 다운로드 파일명은 `nanodb-image-{id}.zip`이다. API 세부는 [API 레퍼런스](/guide/api-reference)를 참고한다.

## 2. ZIP 구조

ZIP은 고정된 네 개의 UTF-8 파일만 담는다. 파일 목록과 순서는 `src/backend/nanodb/services/export_builder.py`의 상수로 고정되어 있다.

```python
ENTRY_NAMES = ("context.md", "data.json", "task.md", "checks.json")
```

빌더는 결정론적(deterministic) 출력을 위해 각 엔트리에 고정 타임스탬프(`1980-01-01`)와 고정 권한(`0o600`), `ZIP_DEFLATED` 압축을 사용한다. 즉 같은 스냅샷을 내보내면 바이트 단위로 동일한 ZIP이 나온다.

::: warning 확인된 스키마 버전
현재 코드의 `schema_version`은 **`3.1`** 이다. `ContextExportService.schema_version = "3.1"`(`context_export_service.py`)에서 정의되고 `data.json`·`checks.json`에 그대로 실린다. (일부 문서에서 언급되던 `2.0`은 이전 계약이며, 현재 코드와 다르다. 아래 5절의 불일치 주의 참고.)
:::

### context.md — 좌표계·계산 규칙·주의사항

측정 데이터를 어떻게 해석해야 하는지를 담은 사람이 읽는 설명서다. 내용은 `_context_markdown()`에 하드코딩되어 있어 이미지와 무관하게 고정이다. 핵심만 옮기면:

- 좌표는 **원본 이미지 픽셀**: 원점은 좌상단, X는 오른쪽, Y는 아래로 증가. 유효 좌표는 `0 <= x < pixel_width`, `0 <= y < pixel_height`.
- 각 측정은 `measurement_type`과 순서 있는 `points` 목록을 가진다.
  - `length`: 2점, 값 = 픽셀 거리 × `calibration_nm_per_pixel` (단위 nm)
  - `angle`: 3점(꼭짓점 먼저, 그다음 두 팔 끝), 값 = 꼭짓점 각도(deg), 캘리브레이션 영향 없음
  - `curvature`: 3점을 지나는 원을 피팅해 반지름 × 캘리브레이션 (단위 nm)
- 계산은 저장 정밀도로 수행하고, 표시값만 소수점 둘째 자리에서 half-up 반올림.
- `label`은 그 측정에 붙인 캡션(예: "Gate CD"), `note`는 관찰 메모다. **둘 다 자유 텍스트이며 값에 영향을 주지 않고, 그룹핑 기준도 아니다.** 그룹은 항상 `measurement_type`으로 묶는다.
- `adjusted_at`이 채워지면 `points`/`value`는 보정 후 값이고, `original_points`/`original_value`가 보정 전 값을 함께 담는다.
- 값은 항상 `points`에서 다시 계산할 수 있다. 측정은 참조(reference)이지 인증된 정답이나 자동 경계 검출이 아니다.
- 이미지 바이너리는 포함하지 않는다. 시각적 맥락이 필요하면 NANoDB에서 직접 본다.

### data.json — 이미지 1건과 그 모든 저장 측정

내보내기의 실제 데이터다. `_data_json()`이 스냅샷에서 조립한다. `measurements` 배열은 저장된 측정 전부를 담고, 각 측정에는 그 측정의 `label`과 `note`가 함께 실린다. 필드는 코드와 정확히 일치한다:

```json
{
  "schema_version": "3.1",
  "exported_at": "2026-09-09T12:39:14.031260+00:00",
  "image": {
    "id": 1,
    "original_filename": "demo_tem_001.png",
    "image_type": "TEM",
    "product_id": "DEMO-DRAM-1Z",
    "lot_id": "LOTDEMO01",
    "wafer_id": "W01",
    "process_step": null,
    "pixel_width": 500,
    "pixel_height": 316,
    "calibration_nm_per_pixel": 0.6295
  },
  "measurements": [
    {
      "id": 1,
      "image_id": 1,
      "item_id": null,
      "measurement_type": "length",
      "points": [[120.0, 80.0], [168.0, 80.0]],
      "calibration_nm_per_pixel": 0.6295,
      "value": 30.216,
      "unit": "nm",
      "label": "Gate CD",
      "note": "DRAM active CD, line 1",
      "measurement_method": "manual",
      "reference_status": "unreviewed",
      "adjusted_at": null,
      "original_points": null,
      "original_value": null,
      "created_at": "2026-09-09T12:39:00.712277+00:00"
    }
  ]
}
```

주의할 점:
- `image.process_step`은 사용자가 기록하지 않으면 `null`이다.
- `measurement_method`는 사람이 그린 측정이면 `manual`, 세그먼테이션에서 특징 추출기가 파생한 측정이면 `auto`다.
- `points`는 `[[x, y], ...]` 형태의 좌표 배열이다(과거 `start_x`/`end_x` 평면 필드가 아님).
- `adjusted_at`이 `null`이 아니면 `original_points`/`original_value`가 보정 전 값을 담아, 두 판독을 비교할 수 있게 한다.

### task.md — 내보낸 데이터로 수행할 개발 작업

외부 도구에게 시킬 예시 작업이다. 고정 텍스트이며(`_task_markdown()`), 현재 계약에서는 다음을 요구한다:

```markdown
# Development Task

Read data.json and write a CSV with columns measurement_type,unit,count,mean.
Group by measurement_type, not by the free-text label.
Output only measurement types with measurements, ordered length, angle, curvature.
Means are only comparable within a measurement_type because units differ across types.
Calculate means with stored precision and display mean to two decimal places.
Do not call external services and do not infer image boundaries.
```

즉 출력 CSV 컬럼은 `measurement_type,unit,count,mean`, 그룹 기준은 `measurement_type`, 순서는 `length, angle, curvature`다.

### checks.json — 검증용 정답

`task.md`의 결과를 나중에 대조할 정답이다. `_checks_json()`이 조립하며, `expected_summary`는 `build_expected_summary()`가 계산한 타입별 평균이다:

```json
{
  "schema_version": "3.1",
  "tolerance": 0.000001,
  "expected_summary": [
    { "measurement_type": "length", "unit": "nm", "count": 3, "mean": 30.32 },
    { "measurement_type": "angle", "unit": "deg", "count": 1, "mean": 88.7 }
  ],
  "synthetic_calculation": {
    "measurement_type": "length",
    "image_size_px": [1000, 800],
    "points": [[100, 100], [400, 500]],
    "calibration_nm_per_pixel": 0.2,
    "expected_distance_px": 500,
    "expected_value": 100,
    "unit": "nm",
    "purpose": "coordinate arithmetic only; not image boundary ground truth"
  }
}
```

`synthetic_calculation`은 실제 이미지와 무관한 좌표 산술 sanity check다. `(100,100)→(400,500)`은 거리 500px, 캘리브레이션 0.2를 곱해 100nm — 도구의 좌표 계산이 맞는지 이미지 경계와 무관하게 확인하는 용도다.

## 3. 생성 파이프라인

ZIP은 두 층으로 조립된다.

**오케스트레이션** — `ContextExportService.build(image_id)` (`services/context_export_service.py`):
1. 세션을 열고 `ImageRepository(session).find(image_id)`로 이미지를 찾는다. 없으면 `DomainError("IMAGE_NOT_FOUND", ...)`.
2. `MeasurementRepository(session).list_by_image(image_id, export_order=True)`로 그 이미지의 측정을 내보내기 순서로 가져온다.
3. `ExportSnapshot`을 구성한다: `schema_version`, `exported_at`(UTC now), `image`, `measurements`, 그리고 `build_expected_summary(measurements)`로 만든 `expected_summary`.
4. `validate_export_snapshot(snapshot)`로 스냅샷을 검증한다(값이 유한하고 0보다 큰지 등, `domain/calculations.py`).
5. `build_context_zip(snapshot)`를 호출해 bytes를 반환한다.

**직렬화** — `build_context_zip(snapshot)` (`services/export_builder.py`):
- 네 파일의 내용을 각각 `_context_markdown()`, `_data_json()`, `_task_markdown()`, `_checks_json()`으로 만든다.
- `ENTRY_NAMES` 순서대로 고정 타임스탬프·권한·`ZIP_DEFLATED`로 ZIP에 기록한다.

데이터 출처를 한 줄로 요약하면: `data.json`은 `ExportSnapshot.image`/`measurements`에서, `checks.json`의 `expected_summary`는 도메인의 `build_expected_summary()`에서 나온다. `context.md`와 `task.md`는 이미지와 무관한 고정 텍스트다. 도메인·리포지토리 계층은 [백엔드](/guide/backend)와 [데이터 모델](/guide/data-model)에서 다룬다.

## 4. 소비 방법

외부 개발자나 AI 도구가 이 ZIP으로 분석/요약 코드를 만드는 흐름은 다음과 같다.

1. 이미지 상세에서 내보내기를 호출해 ZIP을 받는다.

   ```bash
   curl -OJ http://localhost:8000/api/images/1/context-export
   unzip nanodb-image-1.zip -d image-1
   ```

2. `context.md`(좌표계·계산 규칙), `data.json`(측정 데이터), `task.md`(할 일)를 도구에 붙인다. **`checks.json`은 붙이지 않는다** — 정답이므로 검증 단계에서만 쓴다.
3. 도구는 `context.md`의 규칙에 따라 `data.json`을 읽어 `task.md`가 요구하는 CSV(`measurement_type,unit,count,mean`)를 만드는 프로그램을 생성한다. `context.md`가 "값은 항상 `points`에서 다시 계산 가능", "그룹은 `label`이 아니라 `measurement_type`으로" 같은 규칙을 명시하므로, 도구가 그룹 기준이나 단위를 되묻지 않아도 된다.
4. 생성된 프로그램을 `data.json`으로 실행해 CSV를 만든 뒤, `checks.json`의 `expected_summary`와 대조해 pass/fail/unverified를 판정한다.

핵심은 3단계에서 사람이 좌표계·단위·계산 규칙을 다시 설명할 필요가 없다는 점이다. 그 설명이 `context.md`에 이미 근거와 함께 들어 있기 때문이다.

## 5. 외부 AI 검증 데모

`validation/external-ai/`는 이 소비 흐름을 두 방식으로 비교한 **수동·오프라인 검증 자산**이다. 앱 런타임 바깥에 있고, 어떤 모델도 자동 호출하지 않는다.

디렉터리 구조:

```text
validation/external-ai/
├── README.md                       # 절차와 기록된 실행 결과
├── schema-version.txt              # 입력 스키마 버전 표기
├── compare_summary.py              # CSV를 checks.json과 대조하는 오프라인 러너
├── prompts/
│   ├── manual-prompt.md            # A안: 사람이 손으로 설명
│   └── context-prompt.md           # B안: NANoDB 컨텍스트 ZIP 첨부
├── generated/                      # 각 실행에서 생성된 프로그램
│   ├── run-2026-09-08-manual-1.py
│   ├── run-2026-09-08-context-1.py
│   └── summarize_measurements.py
├── results/                        # 실행 로그·CSV·리포트·집계
│   ├── run-log-template.md
│   ├── run-2026-09-08-manual-1.{csv,md,report.json}
│   ├── run-2026-09-08-context-1.{csv,md,report.json}
│   └── metrics.csv
└── exports/2026-09-08-image-1/     # 실행에 사용한 보존된 export (context/data/task/checks + README)
```

**두 방식(A/B).** 같은 작업을 외부 AI 도구에 시키되,
- **A안(manual)** — 사람이 좌표계·계산 규칙·측정값을 손으로 써서 붙인다 (`prompts/manual-prompt.md`).
- **B안(context)** — 사람이 NANoDB 컨텍스트 ZIP을 그대로 첨부한다 (`prompts/context-prompt.md`).

**기록하는 지표.** 준비 시간(preparation time), 후속 요청 수(follow-up requests), 검증 결과(pass/fail/unverified). `compare_summary.py`가 생성 CSV를 export의 `checks.json`과 대조하고 exit code 0/1/2로 verdict를 낸다. 집계는 `results/metrics.csv`에 한 줄씩 쌓인다.

**기록된 실행.** 지금까지 두 건이 있다(둘 다 image 1, 같은 작업):

| Run | Arm | Prep time | Follow-ups | Checks | Verdict |
| --- | --- | --- | ---: | ---: | --- |
| `2026-09-08-context-1` | context | `unmeasured` | 0 | 3/3 | `pass` |
| `2026-09-08-manual-1` | manual | `unmeasured` | 0 | 2/3 | `fail` |

**정직한 입장(중요).**
- 사전에 약속된 이득은 없다. 실행이 보여주는 것만 기록한다. 토큰·성능 주장은 하지 않는다.
- 준비 시간은 `unmeasured`다 — 사람의 시간을 잰 적이 없으므로 사람 비교(EVL-006의 본 지표)는 아직 미검증이다.
- 두 방식은 독립적이지 않다. 같은 모델이 한 세션에서 둘 다 수행했으므로 통제된 A/B 실험이 아니다.
- manual 건의 실패 원인은 코딩 실수가 아니라 이중 반올림(표시값을 사람이 옮겨 적어 평균이 반올림 경계 반대편으로 넘어간 것)이다. 이는 손으로 옮긴 컨텍스트의 실제 실패 모드일 뿐, "손 설명이 일반적으로 나쁘다"는 증거가 아니다.

::: danger 검증 자산과 현재 스키마의 불일치 (인계 시 반드시 인지)
`validation/external-ai/`의 자산은 **과거 계약에 고정**되어 있어 현재 코드(`schema_version` 3.1)와 다르다. 코드를 읽고 확인한 실제 상태는 다음과 같다:

| 대상 | 측정 모델 | schema_version | CSV 컬럼 / 그룹 |
| --- | --- | --- | --- |
| 현재 코드 (`export_builder.py`) | length / angle / curvature, `points`, `value`/`unit` | **3.1** | `measurement_type,unit,count,mean` |
| `README.md`·`prompts/`·`compare_summary.py`·`schema-version.txt` | CD / Depth / Thickness | 2.0 | `parameter_type,count,mean_nm` |
| 보존된 export `exports/2026-09-08-image-1/` | CD / Depth / Thickness, `start_x`/`end_x`, `annotations[]` | 1.1 | `parameter_type,count,mean_nm` |

즉 기록된 실행은 재현 가능하지만(보존된 1.1 export에 대해), 현재 앱이 내보내는 3.1 ZIP을 검증하려면 러너와 프롬프트를 3.1 계약(그룹 키 `measurement_type`, 컬럼 `measurement_type,unit,count,mean`)에 맞게 갱신해야 한다. 이 데모를 이어받는 사람은 이 불일치를 먼저 해소해야 한다.
:::

## 6. 스키마를 확장할 때 주의점

- **버전을 올린다.** 파일 집합·필드·계산 규칙을 바꾸면 `ContextExportService.schema_version`을 올리고, 그 값이 `data.json`/`checks.json`에 함께 실리는지 확인한다. 소비자는 이 값으로 계약을 판별한다.
- **파일 집합은 계약이다.** `ENTRY_NAMES`의 파일명·개수·순서를 바꾸면 하위 호환이 깨진다. 새 정보는 가급적 기존 파일의 새 필드로 추가하고, 파일 추가/제거는 버전 상승과 함께 신중히 한다.
- **결정론을 유지한다.** 고정 타임스탬프·권한·압축 방식을 유지해 같은 스냅샷이 같은 바이트를 내도록 한다(회귀 테스트가 이에 의존한다).
- **`context.md`와 `task.md`를 동기화한다.** 데이터 모델을 바꾸면 규칙 설명과 예시 작업도 함께 고쳐야 한다. 그렇지 않으면 소비자가 잘못된 규칙으로 코드를 생성한다.
- **검증 자산도 함께 갱신한다.** 5절의 불일치를 반복하지 않도록, 스키마를 바꿀 때 `validation/external-ai/`의 러너·프롬프트·`schema-version.txt`도 같은 커밋에서 맞춘다.

스키마 필드 상세와 데이터 계약은 [API 레퍼런스](/guide/api-reference)와 [데이터 모델](/guide/data-model)을, 확장·기여 절차는 [확장·기여](/guide/contributing)를 참고한다.
