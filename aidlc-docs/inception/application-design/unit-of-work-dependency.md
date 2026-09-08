# Unit of Work Dependencies

## 의존성 행렬

| 호출 또는 소비 단위 | 제공 단위 | 의존 시점 | 계약 | 결합 수준 |
| --- | --- | --- | --- | --- |
| NANoDB Core | 없음 | 해당 없음 | 독립 실행 가능한 앱 | 없음 |
| Evidence Site | NANoDB Core | 빌드 시 | 승인된 기능·검증 상태와 공개 가능한 근거 | 낮음, 정적 입력만 사용 |

## 의존 방향

Evidence Site는 NANoDB Core의 실제 검증 결과에 단방향으로 의존한다. Core는 Evidence Site 없이 실행·검증할 수 있고, Evidence Site도 실행 중인 Core API나 PostgreSQL에 연결하지 않는다.

## 구현 순서

1. NANoDB Core의 US-01~US-05 계측 기반을 완료한다.
2. 같은 단위에서 US-06~US-07 개발 컨텍스트와 외부 검증 근거를 완료한다.
3. 승인된 결과를 정적 입력으로 Evidence Site에 반영한다.
4. 전체 Build and Test에서 Core 실행과 Evidence Site build를 각각 검증한다.

## 단위 내부 의존성

NANoDB Core 내부의 UI, API, 서비스와 저장소는 별도 작업 단위가 아니라 모듈이다.

| 상위 모듈 | 하위 모듈 | 규칙 |
| --- | --- | --- |
| Web UI | Application API | 로컬 HTTP 계약만 사용한다. |
| Application API | Domain Services | 요청을 검증하고 서비스 호출을 조정한다. |
| Domain Services | Repository 및 File Store 포트 | 저장 구현 세부사항에 직접 결합하지 않는다. |
| PostgreSQL Repository | PostgreSQL | 환경 기반 연결정보와 migration을 사용한다. |
| Local File Store | 앱 호스트 파일 시스템 | 안전한 내부 키로만 파일을 읽고 쓴다. |

## 순환 의존성 검토

- NANoDB Core → Evidence Site 런타임 의존성: 없음
- Evidence Site → NANoDB Core 런타임 의존성: 없음
- Evidence Site → Core 검증 근거 빌드 의존성: 있음
- 순환 의존성: 없음

## 외부 활동 경계

기존 AI 도구와 생성 코드 실행은 작업 단위가 아니다. 사용자가 Core에서 받은 ZIP을 수동 전달하고 앱 밖에서 실행 결과를 남긴다. Evidence Site는 공개 승인된 결과만 소비한다.
