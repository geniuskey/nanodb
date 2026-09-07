# NANoDB 8시간 해커톤 MVP 구현 예외사항

이 문서는 기존 NANoDB 요구사항 중 이번 8시간 MVP에서 **구현하지 않는 기능**을 명시한다. 아래 기능은 결함이나 미완성이 아니라 의도적으로 제외한 범위다.

## 1. 사용자, 인증 및 보안

- 회원가입, 로그인, 로그아웃
- 측정자, 분석가, 관리자 역할 구분
- 권한 매트릭스와 행 수준 접근 제어
- 사내 SSO, OAuth, JWT, API Token
- 비밀번호 암호화, 로그인 시도 제한
- 보안 등급과 반출 승인 정책
- 다중 조직과 다중 프로젝트 분리

## 2. 이미지 등록 및 자산 관리

- 여러 이미지 동시 업로드와 CSV/JSON manifest 일괄 등록
- TIFF, 장비 전용 포맷 및 초대형 이미지 지원
- 장비 파일 폴더 감시와 자동 수집
- 이미지 메타데이터 자동 추출
- SHA-256 해시와 중복 이미지 탐지
- Thumbnail, pyramid, tile의 별도 생성 파이프라인
- Object Storage, CDN, multipart/resumable upload
- 이미지 회전, 반전, crop 및 보정 편집
- 이미지 간 관련 관계 연결
- 이미지 논리 삭제, 복구 및 영구 삭제

## 3. 제조 추적성 및 마스터 데이터

- Product → Lot → Wafer → Die → Site → Specimen의 관계형 계층 모델
- Die X/Y, Site/Region, TEM Specimen 상세정보
- 공정 단계, Recipe, 장비, 촬영 조건 관리
- Product, Lot, Wafer, 장비의 별도 CRUD 화면
- 누락 사유, 신뢰 수준 및 데이터 품질 점수
- 조직별 ID 패턴 검증
- 구조 파라미터 정의의 버전 관리
- LSL/USL 규격과 제품 Revision 관리

MVP에서는 Product ID, Lot ID, Wafer ID를 이미지에 직접 연결된 문자열로만 저장한다.

## 4. 고급 이미지 뷰어와 Annotation

- Deep zoom, image tile, minimap
- 회전, 밝기, 대비, 필터 조절
- Point, polyline, rectangle, polygon, circle, arc, free curve
- 평행선 거리, 각도, 면적, 반경, 곡률 계산
- Annotation 이동, 크기 조절 및 편집 이력
- 단축키, 측정 Template, 반복 측정 자동화
- 다중 레이어와 이미지 비교 보기

MVP에서는 원본 이미지 기준의 **두 점 직선 측정**만 지원한다.

## 5. Calibration 고급 기능

- Scale bar의 두 점과 실제 길이를 이용한 calibration 생성
- 장비 메타데이터에서 calibration 자동 추출
- nm, µm 등 다중 단위 입력과 자동 변환
- Calibration 출처, Revision 및 변경 영향 분석
- 이미지 영역별로 다른 calibration

MVP에서는 이미지 등록 시 사용자가 입력한 하나의 `nm/pixel` 값만 사용한다.

## 6. 자동 측정과 영상처리

- Threshold, edge detection, morphology, contour detection
- ROI 기반 반자동 길이 측정
- 자동 검출 결과 Overlay와 사용자 보정
- 처리 Recipe 저장과 Version 관리
- AI segmentation, 객체 탐지 및 자동 측정
- 품질 점수, Confidence 및 실패 판정
- 비동기 이미지 처리 Worker와 Queue

## 7. Roughness 및 고급 계측

- Ra, Rq/RMS, Rz, Peak-to-Valley, LER 계산
- Edge/Profile 추출과 fitted baseline
- Detrending, smoothing, filter, sampling 설정
- Deviation profile과 PSD 분석
- 좌우 Edge와 CD variation 비교
- 측정 불확도 및 Gage R&R

## 8. 검토, 승인 및 감사

- Draft → In Review → Approved/Rejected 상태 흐름
- 별도 검토자 승인과 반려
- 측정 Revision 및 이전 값 보존
- 수정 사유와 변경점 비교
- Audit Log와 사용자별 활동 추적
- 승인된 측정만 공식 통계에 포함하는 정책

MVP의 측정 결과는 저장 즉시 최종 결과로 취급한다.

## 9. 제품 온톨로지 및 홈 로드맵 기능

- Hole 윤곽 라벨링, 라벨 버전과 라벨 검수 상태
- CDx, CDy, 대각 CD, EPE, 곡률, 링 두께, Pitch 자동 계산
- Image → Label → Feature → Tool → Owner 전체 계보 그래프
- Tool 입출력 계약, 코드 위치, 실행 이력, active/dormant 상태와 생존율
- 담당자 재직 여부, 인계자와 담당자 부재 경고
- 월간 품질·트렌드 리포트
- 사용자용 OpenAPI 문서와 에이전트 스킬 배포

위 항목은 홈에서 `준비 중` 또는 `P2` 로드맵으로만 설명할 수 있다. 클릭 가능한 빈 화면, 예시 수치 또는 가짜 동작으로 구현 완료처럼 보이게 하지 않는다.

## 10. 검색, 분석 및 리포트

- 복합 조건 검색과 Pagination
- 저장된 검색 조건과 공유 URL
- Histogram, box plot, scatter plot, wafer map
- 중앙값, 표준편차, 분위수, 공정능력지수
- Lot/Wafer/Die/장비/측정자별 Group 비교
- 표본 대표성 및 독립 표본 경고
- 그래프에서 이미지로 Drill-down
- CSV/Excel/PDF Export와 보고서 생성

MVP에서는 단일 키워드 검색, 항목별 건수와 평균만 제공한다.

## 11. 외부 연동과 운영 기능

- MES, LIMS, YMS 및 장비 API 연동
- OpenAPI 명세 자동 동기화와 Contract Test
- API Versioning, Rate Limit, Idempotency Key
- 운영용 문서 포털, CMS, 문서 검색 커스터마이징과 복잡한 배포 체계. 대회 후 평가용 최소 VitePress 소개 사이트와 GitHub Pages 게시는 별도 산출물로 포함한다.
- Docker/Kubernetes 및 Cloud 배포
- 백업, 복구, RPO/RTO 및 재해 복구
- 모니터링, 분산 추적 및 운영 Dashboard
- 이메일, SMS, 브라우저 Push 알림

## 12. 비지원 환경

- 모바일과 태블릿 전용 UI
- Internet Explorer 및 구형 브라우저
- 동시 다중 사용자 편집
- 폐쇄망 운영 설치 자동화
- 100건을 넘는 대규모 데모 데이터 성능 보장
- 20MB를 넘는 단일 이미지

## 13. 홈 콘텐츠와 데모 데이터 제약

- PDF에 기재된 이미지 1,240건, 라벨 812건, CDx 38.2nm, 툴 생존율 11/17 등의 예시값을 실제 KPI로 표시하지 않는다.
- 실제 KPI는 SQLite의 현재 데이터만 집계하며 `n`과 기준 시각을 함께 표시한다.
- Gartner, Splunk, Panopto, Anaconda 등의 외부 수치는 발표 연도와 출처를 함께 표시하고 NANoDB 내부 실측값과 분리한다.
- 오래된 공개 통계의 최신성 검증이나 신규 시장조사는 구현 범위가 아니다.
- 데모 이미지는 synthetic 이미지 또는 사용 권한이 확인된 자료만 사용한다.

## 14. 해커톤 범위 보호 원칙

- 새 기능은 이미지 등록 → 두 점 측정 → 저장 결과 복원이라는 핵심 시나리오를 완성한 뒤에만 추가한다.
- 8시간 안에 끝나지 않을 가능성이 있는 기능은 부분 구현하지 않고 제외한다.
- 외부 서비스 장애가 데모에 영향을 주지 않도록 유료 API와 외부 계정 연동을 사용하지 않는다.
- 샘플 이미지와 미리 입력된 데모 데이터 사용을 허용한다.
- 운영 환경 수준의 보안, 성능, 확장성을 MVP 완성 조건으로 보지 않는다.
- 보안 심사 근거로 로컬 바인딩, 업로드 형식·용량·경로 검증, 서버 입력 검증, 비밀정보·비공개 이미지 게시 방지 여부를 기록한다. 운영 보안 확장 전체를 다시 활성화하는 것은 아니다.
- 코드와 공용 설정의 다중 작성자 작업, 기능 브랜치 간 병렬 통합은 하지 않는다. 구현 PC와 Git 쓰기는 한 명만 담당하며 다른 팀원은 사전 지정된 독립 산출물만 인계한다.
- P0 출시 게이트와 P1 확장 항목의 구분은 `nanodb-mvp-requirements.md`를 따른다. P1은 P0 전체 흐름 검증 전에는 착수하지 않는다.
- 6시간 이후에는 새 기능을 시작하지 않고 통합 검증, 데모 데이터 준비, 초기화와 리허설만 수행한다.
- 지원하지 않는 TIFF를 브라우저에 직접 업로드하는 장면은 데모에 포함하지 않는다. TIFF를 사용할 때는 원본을 보존한 PNG 파생본과 검증된 보정값을 준비한다.
- 데모 초기화는 런타임 SQLite와 업로드 데이터만 대상으로 하며 `data/samples/`의 원천 파일은 삭제하거나 변경하지 않는다.
