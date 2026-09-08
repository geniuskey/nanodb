# Component Dependencies

## Dependency Matrix

| 호출자 | 대상 | 통신 | 이유 |
| --- | --- | --- | --- |
| Web UI | Application API | 로컬 HTTP | 앱 기능 요청과 오류 표시 |
| Application API | Services | 프로세스 내부 호출 | 요청 오케스트레이션 |
| Image Service | Image Repository, File Store | 내부 포트 | 메타데이터와 원본 저장 |
| Measurement Service | Image/Measurement Repository | 내부 포트 | 이미지 확인과 측정 저장·조회 |
| Summary Service | Repositories | 내부 포트 | 실제 건수 집계 |
| Context Export Service | Repositories, ZIP Writer | 내부 포트 | 선택 스냅샷 직렬화 |
| Evidence Site | 승인된 검증 근거 | 빌드 시 정적 입력 | 평가 자료 생성 |

## 핵심 데이터 흐름

1. **등록**: Web UI → API → Image Service → PostgreSQL과 File Store.
2. **측정**: Web UI → API → Measurement Service → PostgreSQL → Web UI 복원 표시.
3. **내보내기**: Web UI → API → Context Export Service → 로컬 ZIP 다운로드.
4. **외부 검증**: 사용자가 ZIP을 기존 AI 도구에 수동 전달 → 생성 코드를 로컬 실행 → 결과를 근거로 보존.
5. **평가 자료**: 승인된 검증 결과 → VitePress build → 정적 사이트 또는 동일 build의 local preview.

UI는 PostgreSQL이나 파일 경로에 직접 접근하지 않고, Evidence Site는 실행 중인 앱이나 내부 감사 로그에 의존하지 않는다.
