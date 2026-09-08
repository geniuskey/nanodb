import { Link } from "react-router-dom";

import { useSummary } from "../api/summary-context";

const VALUES = [
  {
    title: "누구나 만든다",
    body: "데이터 계약과 개발 요청 템플릿을 내보내, 기존 AI 도구로 분석 코드를 만들 수 있게 합니다.",
  },
  {
    title: "누구나 꺼내 쓴다",
    body: "저장한 이미지와 두 점 측정 근거를 다시 열어 같은 위치·값으로 조회합니다.",
  },
  {
    title: "떠나도 남는다",
    body: "원본은 읽기 전용으로 보존하고, 측정은 좌표·보정값과 함께 파생 데이터로 남깁니다.",
  },
];

// 공개 통계(P1). 출처 기관과 발표 연도를 함께 표시하며 실제 KPI와 구분한다.
const PUBLIC_STATS = [
  {
    label: "시민 개발자 : 전문 개발자 (2026 전망)",
    value: "4 : 1",
    bar: 80,
    meaning: "신규 앱의 70%가 로우코드·노코드로 만들어진다.",
    source: "Gartner (Kissflow·Impact Lab 인용, 2021)",
  },
  {
    label: '조직 데이터 중 "다크 데이터"',
    value: "55%",
    bar: 55,
    meaning: "모아두지만 찾지도 쓰지도 못하는 데이터.",
    source: "Splunk, The State of Dark Data (2019)",
  },
  {
    label: "개인에게만 있는 조직 지식",
    value: "42%",
    bar: 42,
    meaning: "그 사람이 떠나면 그 일의 42%를 못 한다.",
    source: "Panopto, Valuing Workplace Knowledge (2018)",
  },
  {
    label: "데이터 준비에 쓰는 시간",
    value: "38~45%",
    bar: 42,
    meaning: "정제·로딩이 모델링보다 크다.",
    source: "Anaconda, State of Data Science (2020~2022)",
  },
];

const FLOW = [
  "이미지 등록 — SEM/TEM 이미지와 Product·Lot·Wafer·보정값 입력",
  "두 점 측정 — 이미지 위에서 CD·Depth·Thickness 계측",
  "저장·재확인 — 새로고침 후에도 같은 좌표·값 복원",
  "개발 컨텍스트 내보내기 — 명세·데이터·검증 기준 ZIP",
];

export function HomePage() {
  const { summary, state } = useSummary();

  return (
    <main>
      <section className="hero" aria-labelledby="home-title">
        <p className="eyebrow">Nano Assets, Never orphaned Database</p>
        <h1 id="home-title">만드는 사람은 바뀌어도, 데이터와 도구는 회사에 남게</h1>
        <p className="hero-copy">
          흩어진 SEM·TEM 이미지와 측정 근거를 한 곳에 모읍니다. 지금은 두 점 계측으로{" "}
          <strong>CD·Depth·Thickness</strong>를 재고, 개발 컨텍스트로 내보냅니다. 원본은 읽기
          전용, 모든 수치에는 n과 기준 시각을 붙입니다.
        </p>
        <div className="actions">
          <Link className="button primary" to="/images" data-testid="home-browse-images">
            이미지 둘러보기 →
          </Link>
          <Link className="button secondary" to="/images/new" data-testid="home-register-image">
            이미지 등록
          </Link>
          <span className="hint">측정·컨텍스트 내보내기는 대상 이미지를 먼저 선택하세요.</span>
        </div>
      </section>

      <section aria-labelledby="values-title">
        <h2 id="values-title">측정 근거를 데이터 자산으로</h2>
        <div className="card-grid three">
          {VALUES.map((value) => (
            <article className="card value-card" key={value.title}>
              <h3>{value.title}</h3>
              <p>{value.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="why-title">
        <h2 id="why-title">왜 지금인가</h2>
        <p className="section-note">공개 통계 · 출처 기관과 발표 연도를 함께 표기합니다 (실제 KPI 아님).</p>
        <div className="stat-grid">
          {PUBLIC_STATS.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-bar" aria-hidden="true">
                <span style={{ width: `${stat.bar}%` }} />
              </div>
              <p className="stat-meaning">{stat.meaning}</p>
              <div className="stat-source">출처: {stat.source}</div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="summary-title">
        <h2 id="summary-title">실제 축적 현황</h2>
        <p className="section-note">현재 저장된 데이터만 집계합니다. 예시값을 대입하지 않습니다.</p>
        {state === "loading" && <p role="status">실제 데이터를 불러오는 중입니다.</p>}
        {state === "failure" && <p role="alert">현황을 불러오지 못했습니다.</p>}
        {state === "success" && summary && (
          <div className="kpi-grid" data-testid="home-summary">
            <article className="kpi-card">
              <div className="kpi-label">등록 이미지</div>
              <div className="kpi-value">{summary.image_count}</div>
              <div className="kpi-sub">n = {summary.image_count}</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">저장 측정</div>
              <div className="kpi-value">{summary.measurement_count}</div>
              <div className="kpi-sub">n = {summary.measurement_count}</div>
            </article>
            <article className="kpi-card">
              <div className="kpi-label">집계 기준 시각</div>
              <div className="kpi-value" style={{ fontSize: "1.4rem" }}>
                {new Date(summary.calculated_at).toLocaleString()}
              </div>
              <div className="kpi-sub">서버 집계 결과</div>
            </article>
          </div>
        )}
      </section>

      <section aria-labelledby="flow-title">
        <h2 id="flow-title">이렇게 쓰세요</h2>
        <ol className="flow">
          {FLOW.map((step, index) => (
            <li className="step-card" key={step}>
              <span className="step-num">{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
        <p className="flow-after">
          이후 기존 AI 도구에서 코드 생성 → 검토·실행·검증은 앱 밖 개발 작업으로 별도 진행합니다.
        </p>
      </section>

      <section className="roadmap" aria-labelledby="roadmap-title">
        <h2 id="roadmap-title">후속 로드맵</h2>
        <p>
          자동 측정, 윤곽 라벨링, 검토 승인, Feature·Tool·Owner 계보와 API/Skill은 이번 MVP에
          포함되지 않으며 상단 P2 탭으로만 표시합니다.
        </p>
      </section>
      <p className="policy">
        원본 read-only · 측정은 파생 데이터 · 실제 수치에는 n·기준 시각 · 데모 이미지는 synthetic
        또는 공개 사용 가능 자료
      </p>
    </main>
  );
}
