# Services

## Image Service

Application API에서 등록·목록·상세 요청을 받아 Image Repository와 File Store를 함께 조정한다. DB 저장 실패 시 성공 이미지처럼 노출하지 않으며 원본 파일 수정 기능은 제공하지 않는다.

## Measurement Service

이미지 존재 여부를 확인하고 원본 좌표와 측정 당시 보정값을 사용해 측정을 생성한다. 저장 후 목록 조회를 통해 UI가 같은 근거를 다시 그릴 수 있게 한다.

## Summary Service

저장소의 실제 이미지·측정 수와 집계 기준 시각만 반환한다. 예시 KPI나 P1 평균을 대신 만들지 않는다.

## Context Export Service

선택 이미지와 저장 측정을 한 시점의 스냅샷으로 읽고 `context.md`, `data.json`, `task.md`, `checks.json`을 메모리에서 생성해 ZIP 응답으로 제공한다. 외부 전송과 생성 코드 실행은 수행하지 않는다.

## Evidence Site Build

앱 서비스와 런타임 통신하지 않는다. 검증된 작업본의 상태·시각·근거를 정적 콘텐츠로 게시하며 localhost 앱 링크를 공개 기능처럼 제공하지 않는다.
