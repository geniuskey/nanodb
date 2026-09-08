# Components

| 컴포넌트 | 목적 | 책임 | 주요 인터페이스 |
| --- | --- | --- | --- |
| Web UI | 로컬 데모 사용자 흐름 제공 | 홈, 등록, 목록, 측정·복원, 내보내기 상태 표시 | Application API 호출 |
| Application API | UI 요청의 단일 진입점 | 입력 형식 확인, 서비스 호출, 오류·다운로드 응답 | Image, Measurement, Summary, Export 작업 |
| Image Service | 이미지 자산 관리 | 등록, 조회, 목록, 원본 불변 유지 | Image Repository, File Store |
| Measurement Service | 두 점 측정 관리 | 생성, 조회, 좌표·보정 기반 계산 요청 | Image Repository, Measurement Repository |
| Summary Service | 실제 KPI 제공 | 이미지·측정 수와 기준 시각 조회 | Repositories |
| Context Export Service | AI 개발 컨텍스트 생성 | 선택 이미지 스냅샷을 네 파일 ZIP으로 조립 | Repositories, ZIP Writer |
| Persistence | 데이터와 파일 지속성 제공 | PostgreSQL 레코드와 단일 앱 호스트의 업로드 파일 저장·조회 | Repository 및 File Store 포트 |
| Evidence Site | 평가용 정적 자료 제공 | 문제, 실제 기능, 검증 상태와 한계 표시 | 빌드 시 승인된 근거만 사용 |

외부 AI 도구와 생성 코드 실행은 NANoDB 컴포넌트가 아니다. 사용자가 내보낸 ZIP을 수동 전달하고 앱 밖에서 검증한다.
