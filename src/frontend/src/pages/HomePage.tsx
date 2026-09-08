import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import logo from "../../../../assets/logo/nanodb_logo_horizontal.png";
import introVideo from "../../../../assets/video/nanodb_intro.mp4";
import { api } from "../api/client";
import { useSummary } from "../api/summary-context";
import type { ImageListView, ParameterSummary, ParameterType } from "../api/types";
import { useDocumentTitle } from "../ui/useDocumentTitle";

// --- Static content (대의 / Phase / AI-DLC / 사용 흐름) ---

const VALUES = [
  {
    title: "누구나 만든다",
    body: "비개발자도 이미지와 측정을 남깁니다. 등록한 이미지와 측정은 만든 사람이 아니라 회사 자산으로 쌓입니다.",
  },
  {
    title: "누구나 꺼내 쓴다",
    body: "등록된 이미지는 목록에서 찾고, 저장된 측정은 다시 열어도 같은 좌표·값으로 복원됩니다.",
  },
  {
    title: "떠나도 남는다",
    body: "원본은 읽기 전용으로 보존하고, 측정은 좌표·보정값과 함께 파생 데이터로 남습니다.",
  },
];

type PhaseStatus = "now" | "next" | "roadmap";

const PHASES: {
  name: string;
  title: string;
  status: PhaseStatus;
  badge: string;
  body: string;
  basis: string;
}[] = [
  {
    name: "Phase 1",
    title: "모은다",
    status: "now",
    badge: "● 지금 동작",
    body: "SEM, TEM 이미지를 제조 정보(Product, Lot, Wafer, 공정 Step)와 nm/pixel 보정값과 함께 등록하고, 이미지 위 두 점 측정으로 실제 길이를 재고 이름을 붙여 저장·복원합니다.",
    basis: "이미지 등록, nm/pixel 캘리브레이션, 두 점 측정(CD·Depth·Thickness), 측정 라벨링, 항목별 평균, 파일명·Product·Lot·Wafer 검색, 측정·이미지 삭제, 개발 컨텍스트 내보내기",
  },
  {
    name: "Phase 2",
    title: "표준화한다",
    status: "next",
    badge: "○ 다음",
    body: "측정 항목을 자유 문자열에서 관리되는 정의로 옮기고, 여러 이미지를 한 번에 등록·내보낼 수 있게 합니다.",
    basis: "측정 항목(파라미터) 마스터, 라벨 표준화, 이미지 일괄 등록과 일괄 내보내기",
  },
  {
    name: "Phase 3",
    title: "이어준다",
    status: "roadmap",
    badge: "○ 로드맵",
    body: "초안·검토·승인 상태와 revision, Lot별 분포·spec 비교, 측정 recipe를 툴로 등록하고 Image→Label→Feature→Tool→Owner 계보를 잇습니다.",
    basis: "승인 워크플로, 분석 차트, 계보 그래프, API·에이전트 스킬",
  },
  {
    name: "Phase 4",
    title: "제안한다",
    status: "roadmap",
    badge: "○ 로드맵",
    body: "유사 이미지 검색과 feature 추천, 사람 승인 후 학습 데이터로 이어집니다.",
    basis: "유사 이미지 검색, feature 추천, 사람 승인 후 학습 데이터",
  },
];

const AIDLC = [
  {
    title: "1. 산출물 구조",
    body: "요구사항, 유저 스토리, 워크플로 계획, 애플리케이션 설계, 유닛 분할과 유닛별 코드가 aidlc-docs 폴더에 게이트 순서대로 남아 있습니다.",
    code: "inception/  requirements, user-stories,\n            application-design, units\nconstruction/  nanodb-core, evidence-site\naidlc-state.md, audit.md",
  },
  {
    title: "2. 핵심 설계 결정",
    body: "값을 정해야 하는 자리는 질문 파일로 사람이 답했습니다.",
    code: "원본은 read-only, 측정은 파생 데이터\n서버가 좌표·보정값으로 값을 재계산\n측정 당시 보정값을 측정에 함께 보존",
  },
  {
    title: "3. 협업하며 배운 것",
    body: "코드가 아니라 설계 문서를 고치고 다시 생성했습니다. 게이트마다 컨텍스트를 비우고, 첫 프롬프트에 범위를 못 박았습니다.",
    code: 'Never vibe code\n게이트마다 /clear 와 commit\n질문할 때는 "문서 수정하지 마"를 앞에',
  },
];

const FLOW = [
  { title: "이미지 등록", body: "SEM/TEM 이미지와 Product·Lot·Wafer, 원본 파일명을 함께 남깁니다." },
  { title: "캘리브레이션", body: "이미지의 nm/pixel 보정값을 입력해 픽셀을 실제 길이로 잇습니다." },
  { title: "측정", body: "이미지 위 두 점으로 CD·Depth·Thickness 값을 얻습니다." },
  { title: "저장·내보내기", body: "저장 측정은 새로고침 후에도 복원되고, 개발 컨텍스트로 내보냅니다." },
];

const PARAM_LABEL: Record<ParameterType, string> = {
  CD: "CD",
  Depth: "Depth",
  Thickness: "Thickness",
};

// --- Recent-image / composition helpers (real data from /api/images) ---

interface ImagesState {
  images: ImageListView[] | null;
  state: "loading" | "success" | "failure";
  reload: () => void;
}

function useImages(): ImagesState {
  const [images, setImages] = useState<ImageListView[] | null>(null);
  const [state, setState] = useState<ImagesState["state"]>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState("loading");
    api
      .listImages()
      .then((value) => {
        if (active) {
          setImages(Array.isArray(value) ? value : []);
          setState("success");
        }
      })
      .catch(() => active && setState("failure"));
    return () => {
      active = false;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  return { images, state, reload };
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function topParameters(parameters: ParameterSummary[]): (ParameterSummary | null)[] {
  const sorted = [...parameters].sort((a, b) => b.count - a.count).slice(0, 2);
  return [sorted[0] ?? null, sorted[1] ?? null];
}

function KpiSection({ images, reloadImages }: { images: ImageListView[] | null; reloadImages: () => void }) {
  const { summary, state } = useSummary();

  const at = summary
    ? new Date(summary.calculated_at).toLocaleString()
    : null;

  const list = images ?? [];
  const semCount = list.filter((image) => image.image_type === "SEM").length;
  const temCount = list.filter((image) => image.image_type === "TEM").length;

  return (
    <section aria-labelledby="kpi-title">
      <h2 id="kpi-title">
        지금 쌓인 데이터{at ? ` (집계 ${at})` : ""}
      </h2>
      <p className="section-note">현재 저장된 데이터만 집계합니다. 예시 숫자를 대입하지 않습니다.</p>

      {state === "loading" && (
        <>
          <p role="status">실제 데이터를 불러오는 중입니다.</p>
          <div className="kpi-grid four" aria-hidden="true" data-testid="kpi-skeleton">
            {[0, 1, 2, 3].map((slot) => (
              <article className="kpi-card" key={slot}>
                <span className="skeleton skeleton-value" />
                <span className="skeleton skeleton-line short" />
              </article>
            ))}
          </div>
        </>
      )}
      {state === "failure" && (
        <p role="alert">
          데이터를 불러오지 못했습니다.{" "}
          <button type="button" className="retry" data-testid="retry-summary" onClick={reloadImages}>
            다시 시도
          </button>
        </p>
      )}

      {state === "success" && summary && (
        <div data-testid="home-summary">
          <div className="kpi-grid four">
            <article className="kpi-card">
              <div className="kpi-value">{summary.image_count}</div>
              <div className="kpi-label">이미지</div>
              <div className="kpi-sub">
                {images ? `SEM ${semCount}장 · TEM ${temCount}장` : "SEM/TEM 집계 준비 중"}
              </div>
            </article>
            <article className="kpi-card">
              <div className="kpi-value">{summary.measurement_count}</div>
              <div className="kpi-label">저장 측정</div>
              <div className="kpi-sub">n={summary.measurement_count} · manual two-point</div>
            </article>
            {topParameters(summary.parameters).map((param, index) => (
              <article className="kpi-card" key={param ? param.parameter_type : `empty-${index}`}>
                {param ? (
                  <>
                    <div className="kpi-value">
                      {param.mean_nm.toFixed(2)} <span className="kpi-unit">nm</span>
                    </div>
                    <div className="kpi-label">{PARAM_LABEL[param.parameter_type]} 평균</div>
                    <div className="kpi-sub">n={param.count}, 저장값만</div>
                  </>
                ) : (
                  <>
                    <div className="kpi-value muted">—</div>
                    <div className="kpi-label">파라미터 평균</div>
                    <div className="kpi-sub">측정이 아직 없습니다 (n=0)</div>
                  </>
                )}
              </article>
            ))}
          </div>

          {images && <CompositionBars images={images} parameters={summary.parameters} />}

          <ParameterBreakdown parameters={summary.parameters} />
        </div>
      )}
    </section>
  );
}

function ParameterBreakdown({ parameters }: { parameters: ParameterSummary[] }) {
  if (parameters.length === 0) {
    return null;
  }
  return (
    <table className="param-table" data-testid="param-breakdown">
      <caption className="comp-heading">파라미터별 측정 요약 (저장값, 단위 nm)</caption>
      <thead>
        <tr>
          <th scope="col">항목</th>
          <th scope="col">n</th>
          <th scope="col">평균</th>
          <th scope="col">최소</th>
          <th scope="col">최대</th>
        </tr>
      </thead>
      <tbody>
        {parameters.map((param) => (
          <tr key={param.parameter_type}>
            <th scope="row">{PARAM_LABEL[param.parameter_type]}</th>
            <td>{param.count}</td>
            <td>{param.mean_nm.toFixed(2)}</td>
            <td>{param.min_nm.toFixed(2)}</td>
            <td>{param.max_nm.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CompositionBars({
  images,
  parameters,
}: {
  images: ImageListView[];
  parameters: ParameterSummary[];
}) {
  const total = images.length;
  const semCount = images.filter((image) => image.image_type === "SEM").length;
  const temCount = total - semCount;
  const pct = (part: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

  const paramTotal = parameters.reduce((sum, param) => sum + param.count, 0);

  // Registration trend: one bar per distinct registration day (최근 14일 분).
  const byDay = new Map<string, number>();
  for (const image of images) {
    const key = dayKey(image.created_at);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const maxPerDay = days.reduce((max, [, count]) => Math.max(max, count), 0);

  return (
    <div className="comp-grid">
      <div className="comp-block">
        <div className="comp-heading">이미지 구성</div>
        <div className="comp-bar" aria-hidden="true">
          <span className="seg sem" style={{ width: `${pct(semCount)}%` }} />
          <span className="seg tem" style={{ width: `${pct(temCount)}%` }} />
        </div>
        <div className="comp-legend">
          <span><i className="dot sem" /> SEM {semCount} ({pct(semCount)}%)</span>
          <span><i className="dot tem" /> TEM {temCount} ({pct(temCount)}%)</span>
        </div>
      </div>

      <div className="comp-block">
        <div className="comp-heading">측정 구성</div>
        {paramTotal > 0 ? (
          <>
            <div className="comp-bar" aria-hidden="true">
              {parameters.map((param) => (
                <span
                  key={param.parameter_type}
                  className={`seg param-${param.parameter_type.toLowerCase()}`}
                  style={{ width: `${Math.round((param.count / paramTotal) * 100)}%` }}
                />
              ))}
            </div>
            <div className="comp-legend">
              {parameters.map((param) => (
                <span key={param.parameter_type}>
                  <i className={`dot param-${param.parameter_type.toLowerCase()}`} />{" "}
                  {PARAM_LABEL[param.parameter_type]} {param.count}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="comp-empty">저장 측정 없음 (n=0)</p>
        )}
      </div>

      <div className="comp-block">
        <div className="comp-heading">이미지 등록 추이</div>
        {days.length > 0 ? (
          <>
            <div className="trend" aria-hidden="true">
              {days.map(([key, count]) => (
                <span
                  key={key}
                  className="trend-bar"
                  style={{ height: `${maxPerDay > 0 ? (count / maxPerDay) * 100 : 0}%` }}
                  title={`${key}: ${count}장`}
                />
              ))}
            </div>
            <div className="comp-legend spread">
              <span>{days[0][0]}</span>
              <span>{days.length}일, 하루 최대 {maxPerDay}장</span>
              <span>{days[days.length - 1][0]}</span>
            </div>
          </>
        ) : (
          <p className="comp-empty">등록 이미지 없음</p>
        )}
      </div>
    </div>
  );
}

function RecentImages({ images, state, reload }: ImagesState) {
  const recent = (images ?? []).slice(0, 6);

  return (
    <section aria-labelledby="recent-title">
      <h2 id="recent-title">최근 등록된 이미지</h2>
      {state === "failure" && (
        <p role="alert">
          이미지 목록을 불러오지 못했습니다.{" "}
          <button type="button" className="retry" data-testid="retry-images" onClick={reload}>
            다시 시도
          </button>
        </p>
      )}
      {state !== "failure" && recent.length === 0 ? (
        <p className="empty-state">아직 등록된 이미지가 없습니다. `이미지 등록` 탭에서 첫 SEM/TEM 이미지를 올려 보세요.</p>
      ) : (
        <div className="recent-grid">
          {/* A recent image is the shortest path into the product, so the whole
              card is the link: seeing a thumbnail and not being able to open it
              was the single most confusing thing about this section. */}
          {recent.map((image) => (
            <Link
              className="recent-card"
              to={`/images/${image.id}`}
              key={image.id}
              data-testid="recent-image-link"
            >
              <img src={image.file_url} alt={image.original_filename} loading="lazy" />
              <span className="recent-caption">
                <span className="recent-name">{image.original_filename}</span>
                <span className="recent-meta">
                  {image.image_type} {image.lot_id} {image.wafer_id}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** True when the viewer asked their system to reduce motion. */
function prefersReducedMotion(): boolean {
  // jsdom and older browsers have no matchMedia; treat that as "no preference".
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Intro video (HOM-040). The file ships with the build, so the home page has
 * no external runtime dependency and works on an air-gapped demo machine.
 * Autoplay is skipped for a reduced-motion viewer, who presses play instead,
 * and the page reads fine for anyone whose browser plays nothing at all.
 */
function IntroVideo() {
  const [reduced] = useState(prefersReducedMotion);

  return (
    <section aria-labelledby="video-title" className="video-section">
      <h2 id="video-title" className="visually-hidden">NANoDB 소개 영상</h2>
      <video
        className="intro-video"
        data-testid="intro-video"
        src={introVideo}
        controls
        muted
        loop
        playsInline
        autoPlay={!reduced}
        preload="metadata"
      />
      <p className="video-caption" data-testid="video-caption">
        NANoDB 소개 영상입니다. 영상 없이도 아래 내용만으로 NANoDB를 확인할 수 있습니다.
      </p>
    </section>
  );
}

export function HomePage() {
  useDocumentTitle("홈");
  // One fetch shared by the KPI tiles, the composition bars and the recent
  // grid, so a retry re-arms all three at once.
  const imageList = useImages();
  return (
    <main>
      <IntroVideo />

      <section className="hero-card" aria-labelledby="home-title">
        <div className="hero-grid">
          <img className="hero-logo" src={logo} alt="NANoDB — Nano Assets, Never orphaned" />
          <div className="hero-copy">
            <p className="brand-line">NANoDB : Nano Assets, Never orphaned Database.</p>
            <p className="brand-sub-line">데이터는 쌓이고, 툴은 이어진다</p>
            <h1 id="home-title">만드는 사람은 바뀌어도, 데이터와 도구는 회사에 남게</h1>
            <p className="lead">
              SEM, TEM 이미지를 제조 정보와 함께 등록하고, 이미지 위에서 측정한 값을 원본과
              측정자, 방법, 위치까지 거슬러 올라갈 수 있게 보관합니다. 담당자가 바뀌어도 이미지와
              측정값은 같은 자리에 남습니다.
            </p>
          </div>
        </div>
        <div className="card-grid three">
          {VALUES.map((value) => (
            <article className="card value-card" key={value.title}>
              <h3>{value.title}</h3>
              <p>{value.body}</p>
            </article>
          ))}
        </div>
      </section>

      <KpiSection images={imageList.images} reloadImages={imageList.reload} />

      <RecentImages {...imageList} />

      <section aria-labelledby="phase-title">
        <h2 id="phase-title">NANoDB가 가는 길, Phase 1에서 4까지</h2>
        <div className="phase-grid">
          {PHASES.map((phase) => (
            <article className={`phase-card phase-${phase.status}`} key={phase.name}>
              <div className="phase-head">
                <span className="phase-name">
                  {phase.name} {phase.title}
                </span>
                <span className={`phase-badge phase-${phase.status}`}>{phase.badge}</span>
              </div>
              <p className="phase-body">{phase.body}</p>
              <p className="phase-basis">{phase.basis}</p>
            </article>
          ))}
        </div>
        <p className="section-foot">
          Phase 1은 지금 이 화면에서 동작합니다. Phase 2부터 4는 로드맵이며 미구현 기능을
          동작하는 것처럼 표시하지 않습니다.
        </p>
      </section>

      <section aria-labelledby="aidlc-title">
        <h2 id="aidlc-title">어떻게 만들었나 (AI-DLC)</h2>
        <div className="card-grid three">
          {AIDLC.map((card) => (
            <article className="card aidlc-card" key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              <pre className="code-box">{card.code}</pre>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="flow-title">
        <h2 id="flow-title">이렇게 쓰세요</h2>
        <ol className="flow">
          {FLOW.map((step, index) => (
            <li className="step-card" key={step.title}>
              <span className="step-num">{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        {/* The two entry points the page argues toward (HOM-005, HOM-034a):
            a reader who just went through the four steps can start here. */}
        <div className="flow-cta">
          <Link className="button primary" to="/images/new" data-testid="home-register-image">
            이미지 등록
          </Link>
          <Link className="button" to="/images" data-testid="home-browse-images">
            이미지 둘러보기
          </Link>
        </div>
      </section>

      <p className="policy">
        원본 이미지 read-only · 측정은 파생 데이터 · 모든 수치에 n과 기준 시각 · 데모 데이터는
        synthetic 또는 사용 권한이 확인된 자료
      </p>
    </main>
  );
}
