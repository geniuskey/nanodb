# NANoDB 3일 해커톤 MVP 구현 예외사항

이 문서는 기존 NANoDB 요구사항 중 이번 3일 MVP에서 **구현하지 않는 기능**을 명시한다. 아래 기능은 결함이나 미완성이 아니라 의도적으로 제외한 범위다.

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
- Recipe, 장비, 촬영 조건 관리와 공정 단계 마스터 (공정 Step 문자열 입력은 IMG-002로 포함)
- Product, Lot, Wafer, 장비의 별도 CRUD 화면
- 누락 사유, 신뢰 수준 및 데이터 품질 점수
- 조직별 ID 패턴 검증
- 구조 파라미터 정의의 버전 관리
- LSL/USL 규격과 제품 Revision 관리

MVP에서는 Product ID, Lot ID, Wafer ID와 공정 Step을 이미지에 직접 연결된 문자열로만 저장한다. 공정 Step은 이미지 한 장에 하나이며 선택 입력이다.

## 4. 고급 이미지 뷰어와 Annotation

- Deep zoom, image tile, minimap (단순 확대·이동은 MEA-013으로 포함)
- 회전, 밝기, 대비, 필터 조절
- Point, polyline, rectangle, polygon, arc, free curve 및 측정과 분리된 화살표·원 도형
- 평행선 거리, 각도, 면적, 반경, 곡률 계산
- 측정선의 이동, 크기 조절 및 편집 이력 (삭제 후 다시 그리기만 지원)
- 저장된 측정의 좌표·항목 수정과 수정 이력 (라벨과 메모 수정만 RES-007, ANN-003으로 지원)
- 단축키, 측정 Template, 반복 측정 자동화
- 다중 레이어와 이미지 비교 보기

MVP에서 계산되는 측정은 원본 이미지 기준의 **두 점 직선 측정**뿐이다. 라벨링은 그 측정선에 이름을 붙이는 방식으로만 제공하며(3.7절 ANN), 측정과 분리된 도형은 그리지 않는다. 반지름을 저장하는 원 도형을 제외한 이유도 여기에 있다. 길이만 재는 도구가 곡률 계산을 유도해서는 안 되기 때문이다.

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

MVP의 측정 결과는 저장 즉시 조회 가능하지만 미검토 수동 참고값이다. 공식 승인 결과나 자동 계측 정답으로 취급하지 않는다.

## 9. 제품 온톨로지 및 홈 로드맵 기능

- Hole 자유 윤곽(폴리곤) 라벨링, 라벨 버전과 라벨 검수 상태 (측정에 이름을 붙이는 측정 라벨링은 ANN-001~005로 구현 범위에 포함)
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
- 일반 분석 결과의 CSV/Excel/PDF Export와 보고서 생성. CTX의 Markdown·JSON ZIP 내보내기는 포함한다. 외부 AI 생성 스크립트의 요약 CSV는 개발 검증 산출물이며 앱 보고서 기능이 아니다.

앱의 단일 키워드 검색, 항목별 건수와 평균 표시는 P1이다. CTX의 기대 결과 계산과 외부 생성 스크립트의 요약 CSV 검증은 P0로 별도 포함한다.

## 10.1 AI 개발 지원의 포함·제외 경계

포함 범위는 CTX-001~012의 로컬 ZIP, 데이터 계약·요청 템플릿·검증 사례와 기존 AI 도구에서의 수동 개발 검증이다. JSON 직렬화, 텍스트 내용과 선택 이미지 범위 검증은 포함한다.

제외 범위는 앱 내 LLM 호출, 챗봇, 모델 라우팅, 토큰 계량·최적화, RAG·벡터 DB, MCP 서버, 생성 코드 자동 실행, 이미지 바이너리 묶음·다중 이미지 내보내기다. 이 기능들을 대회 취지 연결만을 위해 추가하지 않는다.

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

- 모바일과 태블릿 전용 UI, 터치 입력만으로 하는 측정
- 다크모드 (`prefers-color-scheme` 대응)
- 포인터 장치 없이 하는 측정 (좌표 직접 입력 대안은 UIX-003으로 P2 범위)
- Internet Explorer 및 구형 브라우저
- 동시 다중 사용자 편집
- 폐쇄망 운영 설치 자동화
- 100건을 넘는 대규모 데모 데이터 성능 보장
- 20MB를 넘는 단일 이미지

## 13. 홈 콘텐츠와 데모 데이터 제약

- PDF에 기재된 이미지 1,240건, 라벨 812건, CDx 38.2nm, 툴 생존율 11/17 등의 예시값을 실제 KPI로 표시하지 않는다.
- 실제 KPI는 PostgreSQL의 현재 데이터만 집계하며 `n`과 기준 시각을 함께 표시한다.
- Gartner, Splunk, Panopto, Anaconda 등의 외부 수치는 발표 연도와 출처를 함께 표시하고 NANoDB 내부 실측값과 분리한다.
- 오래된 공개 통계의 최신성 검증이나 신규 시장조사는 구현 범위가 아니다.
- 데모 이미지는 synthetic 이미지 또는 사용 권한이 확인된 자료만 사용한다.

## 14. 해커톤 범위 보호 원칙

- 계측 기반을 먼저 검증하고 개발 컨텍스트 내보내기를 구현한다. 두 게이트가 통과한 뒤에만 P1에 착수한다.
- 3일을 초과할 우려가 있는 추가 범위는 제외한다. 합의한 CTX P0가 실패하면 미완료로 기록하며 자동으로 제외 범위로 바꾸지 않는다.
- 앱은 유료 API와 외부 계정 연동 없이 동작한다. 개발 검증에는 기존에 사용 가능한 AI 도구를 수동으로 사용하며 모델 API 통합은 구현하지 않는다. 연결 불가 시 사전 실행 증거를 사용하고 현재 live 실행과 구분한다.
- 샘플 이미지와 미리 입력된 데모 데이터 사용을 허용한다.
- 운영 환경 수준의 보안, 성능, 확장성을 MVP 완성 조건으로 보지 않는다.
- 보안 심사 근거로 로컬 바인딩, 업로드 형식·용량·경로 검증, 서버 입력 검증, 비밀정보·비공개 이미지 게시 방지 여부를 기록한다. 운영 보안 확장 전체를 다시 활성화하는 것은 아니다.
- 다섯 명이 각자 별도 작업 공간에서 자신의 도구를 개발한다. NANoDB를 위한 5인 역할 분담이나 다른 프로젝트와의 기능 통합을 필수로 하지 않는다.
- P0 출시 게이트와 P1 확장 항목의 구분은 `nanodb-mvp-requirements.md`를 따른다. P1은 P0 전체 흐름 검증 전에는 착수하지 않는다.
- 3일차에는 새 범위를 추가하지 않는다. 미완료 P0와 결함 해결, 검증·문서·리허설에 집중한다.
- 지원하지 않는 TIFF를 브라우저에 직접 업로드하는 장면은 데모에 포함하지 않는다. TIFF를 사용할 때는 원본을 보존한 PNG 파생본과 검증된 보정값을 준비한다.
- 데모 초기화는 전용 PostgreSQL 데모 데이터와 런타임 업로드만 대상으로 하며 `data/samples/`의 원천 파일은 삭제하거나 변경하지 않는다.
