# NANoDB Units Generation 계획

## 목적

승인된 애플리케이션 설계를 3일 해커톤에서 순서대로 구현할 수 있는 최소 작업 단위로 확정한다. 하나의 배포 가능한 Core 앱과 별도의 정적 Evidence Site로 나누며, 불필요한 서비스 분리는 하지 않는다.

## 계획 진행 상태

- [x] 승인된 요구사항, 사용자 이야기, 실행 계획과 Application Design을 읽는다.
- [x] Story Grouping, Dependencies, Team Alignment, Technical Considerations, Business Domain과 Code Organization을 평가한다.
- [x] 추가 사용자 질문이 필요한 모호성이 없음을 확인한다.
- [x] 아래 분해 기준과 생성 순서를 확정한다.
- [x] Markdown 구조, 경로, 체크박스와 범위 일관성을 검증한다.
- [x] `aidlc-state.md`와 `audit.md`에 계획 검토 상태를 기록한다.

## 분해 기준

1. **NANoDB Core**는 하나의 모듈형 애플리케이션으로 유지한다. UI, API, PostgreSQL repository, 로컬 file store와 context export를 별도 배포 서비스로 쪼개지 않는다.
2. **Evidence Site**는 VitePress 정적 산출물로 분리한다. 앱과 런타임 통신하지 않으며 Core의 실제 검증 결과만 빌드 입력으로 사용한다.
3. 구현 순서는 NANoDB Core를 먼저 완료하고 Evidence Site를 나중에 완료한다.
4. 외부 AI 도구와 생성 코드 실행은 애플리케이션 단위가 아니라 수동 검증 활동으로 유지한다.
5. Greenfield 코드 구성은 단일 저장소 안에서 앱 코드와 정적 사이트를 명확히 분리하되, 구체 경로와 기술 스택은 Construction 단계에서 확정한다.

## 질문 평가

추가 질문은 만들지 않는다. 승인된 산출물에 다음 내용이 이미 명확하기 때문이다.

| 범주 | 결정 근거 |
| --- | --- |
| Story Grouping | US-01~US-07은 하나의 연속된 Core 흐름이고 US-08만 정적 평가 자료다. |
| Dependencies | Evidence Site가 Core의 실제 검증 결과에만 의존하는 단방향 관계다. |
| Team Alignment | 다섯 명은 독립 도구를 만들며 NANoDB 담당자 한 명이 두 단위를 순차 수행한다. |
| Technical Considerations | PostgreSQL과 단일 앱 호스트 로컬 파일 저장소를 사용하는 하나의 Core 배포 경계가 승인됐다. |
| Business Domain | 이미지, 측정과 개발 컨텍스트는 분리 배포보다 하나의 데모 사용자 여정으로 묶는 편이 적절하다. |
| Code Organization | Core 앱과 VitePress 사이트의 런타임·빌드 경계를 분리하는 방향이 승인됐다. |

## 승인 후 생성 체크리스트

- [x] `aidlc-docs/inception/application-design/unit-of-work.md`에 두 작업 단위, 책임, 경계와 Greenfield 코드 구성 전략을 작성한다.
- [x] `aidlc-docs/inception/application-design/unit-of-work-dependency.md`에 의존성 행렬과 구현 순서를 작성한다.
- [x] `aidlc-docs/inception/application-design/unit-of-work-story-map.md`에 US-01~US-08을 빠짐없이 단위에 배정한다.
- [x] NANoDB Core가 US-01~US-07을 소유하고 Evidence Site가 US-08을 소유하는지 검증한다.
- [x] 두 단위 사이에 순환 의존성이 없고 런타임 결합이 생기지 않는지 검증한다.
- [x] P1, 인증, 앱 내 AI 실행, 다중 호스트 저장소와 다른 네 프로젝트 통합이 유입되지 않았는지 검증한다.
- [x] 생성된 Markdown, 로컬 링크, 표와 체크박스를 검증한다.
- [x] 각 완료 단계의 체크박스와 `aidlc-state.md`, `audit.md`를 같은 상호작용에서 갱신한다.

## 필수 산출물

- `aidlc-docs/inception/application-design/unit-of-work.md`
- `aidlc-docs/inception/application-design/unit-of-work-dependency.md`
- `aidlc-docs/inception/application-design/unit-of-work-story-map.md`

## 확장 규칙 적용 상태

- **Resiliency Baseline**: N/A — 비활성화됨.
- **Security Baseline**: N/A — 비활성화됨.
- **Property-Based Testing**: N/A — 비활성화됨.
