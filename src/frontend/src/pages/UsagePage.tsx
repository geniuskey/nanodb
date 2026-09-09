import type { ReactNode } from "react";

import collectShot from "../../../../assets/usage/01-collect.png";
import measureShot from "../../../../assets/usage/03-measure.png";
import segmentShot from "../../../../assets/usage/02-segment.png";
import { useDocumentTitle } from "../ui/useDocumentTitle";
import "./UsagePage.css";

// 정적 페이지다. 여기 숫자는 assets/usage/README.md에 적힌 캡처 대상 이미지의
// 실제 실행 결과다. 캡처를 다시 만들면(scripts/capture_usage_assets.mjs) 숫자도 함께 고친다.
// 세그멘테이션 소요 시간은 실행마다 달라져 적지 않고, 값이 고정된 임계값만 적는다.

type Role = {
  role: string;
  title: string;
  body: string;
  icon: ReactNode;
};

const ROLES: Role[] = [
  {
    role: "측정 담당자",
    title: "브라우저에서 등록하고 잽니다",
    body: "사진을 클릭하면 세그멘테이션이 실행되고, 자동으로 찾은 측정값이 이미지 위에 그려집니다.",
    icon: (
      <>
        <rect x="2" y="8" width="20" height="8" rx="1.5" />
        <path d="M6.5 8v3M10.5 8v4.5M14.5 8v3M18.5 8v4.5" />
      </>
    ),
  },
  {
    role: "분석자",
    title: "찾아보고 비교합니다",
    body: "파일명과 Product, Lot, Wafer로 지난 이미지를 찾습니다. 제품이 달라도 같은 파이프라인이 돕니다.",
    icon: (
      <>
        <circle cx="10.5" cy="10.5" r="6.6" />
        <path d="M15.6 15.6 21 21" />
        <path d="M8 13V9.5M10.5 13V7.6M13 13v-2.4" />
      </>
    ),
  },
  {
    role: "개발자",
    title: "API와 데이터 계약으로 받습니다",
    body: "저장된 측정을 개발 컨텍스트로 내보냅니다. 좌표 규칙과 계산 규칙이 함께 갑니다.",
    icon: <path d="M8.6 6.2 3 12l5.6 5.8M15.4 6.2 21 12l-5.6 5.8M13.6 4.2l-3.2 15.6" />,
  },
];

type Step = {
  stage: string;
  title: string;
  body: string;
  fact: ReactNode;
  shot?: { src: string; alt: string };
};

const STEPS: Step[] = [
  {
    stage: "COLLECT · 모은다",
    title: "이미지 등록",
    body: "SEM/TEM 이미지와 Product·Lot·Wafer, 원본 파일명을 함께 남깁니다. nm/pixel 보정값을 입력해 픽셀을 실제 길이로 잇습니다.",
    fact: (
      <>
        AACE · First Etch · 보정값 <b>0.8845 nm/pixel</b>
      </>
    ),
    shot: { src: collectShot, alt: "데모 시연 화면에서 분석할 이미지를 고르는 모습" },
  },
  {
    stage: "SEGMENT · 구획",
    title: "자동 구획",
    body: "사진을 클릭하면 밝기 차이로 층을 나눠 구조 경계를 찾습니다. Grey level 변곡으로 구획합니다.",
    fact: (
      <>
        multi-Otsu k=4 · 임계값 <b>0.221 · 0.432 · 0.600</b>
      </>
    ),
    shot: { src: segmentShot, alt: "밝기 차이로 네 층으로 나뉜 클래스 맵" },
  },
  {
    stage: "MEASURE · 측정",
    title: "핵심 인자 산출",
    body: "그 경계에서 폭(CD), 높이, 측벽각, 곡률을 nm 단위로 산출해 이미지 위에 하나씩 그립니다.",
    fact: (
      <>
        폭 <b>199.0 nm</b> · 높이 <b>364.4 nm</b> · 측벽각 <b>1.16°</b> · 곡률 <b>4586 nm</b>
      </>
    ),
    shot: { src: measureShot, alt: "자동 계측값이 라벨로 표시된 단면 이미지" },
  },
  {
    stage: "SAVE · 저장과 내보내기",
    title: "저장 · 내보내기",
    body: "원본은 절대 수정하지 않고 파생 데이터로만 저장합니다. 그 값을 개발 컨텍스트로 내보냅니다.",
    fact: (
      <>
        내보내기 검증 <b>3/3 통과</b> (사람이 쓴 설명 2/3)
      </>
    ),
  },
];

type PhaseState = "done" | "wip" | "planned";

const PHASES: { name: string; title: string; badge: string; state: PhaseState; body: string }[] = [
  {
    name: "Phase 1",
    title: "모은다",
    badge: "● 지금 동작",
    state: "done",
    body: "등록, nm/pixel 보정, 자동 구획, 자동 계측, 사람 보정, 검색과 개발 컨텍스트 내보내기",
  },
  {
    name: "Phase 2",
    title: "표준화한다",
    badge: "◐ 진행 중",
    state: "wip",
    body: "측정 항목(파라미터) 마스터, 라벨 표준화, 이미지 일괄 등록과 일괄 내보내기",
  },
  {
    name: "Phase 3",
    title: "이어준다",
    badge: "◐ 진행 중",
    state: "wip",
    body: "승인 워크플로, 분석 차트, 계보 그래프, API · 에이전트 스킬",
  },
  {
    name: "Phase 4",
    title: "제안한다",
    badge: "○ 로드맵",
    state: "planned",
    body: "유사 이미지 검색, feature 추천, 사람 승인 후 학습 데이터",
  },
];

// 네 번째 단계는 화면 캡처가 아니라 내보내기 데이터 자체를 보여준다.
// 실제 export의 필드 이름과 값을 그대로 쓴다.
function ContractCard() {
  return (
    <pre className="usage-contract" aria-label="개발 컨텍스트 내보내기 예시">
      <span className="c">// context-export</span>
      {"\n"}
      <span className="k">&quot;product_id&quot;</span>: <span className="s">&quot;AACE&quot;</span>,
      {"\n"}
      <span className="k">&quot;calibration_nm_per_pixel&quot;</span>: <span className="n">0.8845</span>,
      {"\n"}
      <span className="k">&quot;parameter_type&quot;</span>: <span className="s">&quot;CD&quot;</span>,
      {"\n"}
      <span className="k">&quot;value_nm&quot;</span>: <span className="n">199.0</span>
      {"\n\n"}
      <span className="c">// 좌표·계산 규칙도 함께</span>
    </pre>
  );
}

export function UsagePage() {
  useDocumentTitle("활용");
  return (
    <main className="usage-main">
      <section className="usage-hero" aria-labelledby="usage-title">
        <p className="usage-eyebrow">활용</p>
        <h1 id="usage-title">구성원 누구나 편하게 쓰는 계측 데이터 인프라</h1>
        <p className="usage-lead">
          나노 자산이 흩어지지 않는 데이터베이스. 누가 쓰는지, 어떻게 쓰는지, 어디까지 왔는지를 한
          장에 적었습니다.
        </p>
      </section>

      <section aria-labelledby="usage-who-title">
        <div className="usage-section-head">
          <h2 id="usage-who-title">누가 쓰는가</h2>
          <span>세 사람 모두 같은 데이터를 씁니다</span>
        </div>
        <div className="usage-roles">
          {ROLES.map((role) => (
            <article className="usage-role" key={role.role}>
              <span className="usage-role-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {role.icon}
                </svg>
              </span>
              <div>
                <p className="usage-role-name">{role.role}</p>
                <h3>{role.title}</h3>
                <p className="usage-role-body">{role.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="usage-how-title">
        <div className="usage-section-head">
          <h2 id="usage-how-title">이렇게 쓰세요</h2>
          <span>TEM 단면 한 장을 실제로 넣은 결과입니다</span>
        </div>
        <ol className="usage-steps">
          {STEPS.map((step, index) => (
            <li className="usage-step" key={step.title}>
              <div className="usage-step-art">
                {step.shot ? <img src={step.shot.src} alt={step.shot.alt} /> : <ContractCard />}
              </div>
              <div className="usage-step-body">
                <p className="usage-step-stage">
                  <span className="usage-step-no" aria-hidden="true">
                    {index + 1}
                  </span>
                  {step.stage}
                </p>
                <h3>{step.title}</h3>
                <p className="usage-step-text">{step.body}</p>
                <p className="usage-step-fact">{step.fact}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="usage-phase-title">
        <div className="usage-section-head">
          <h2 id="usage-phase-title">어디까지 왔나</h2>
          <span>Phase 1은 동작, 2와 3은 만드는 중, 4는 계획</span>
        </div>
        <div className="usage-track">
          <div className="usage-rail" aria-hidden="true">
            <i />
          </div>
          <ol className="usage-nodes">
            {PHASES.map((phase, index) => (
              <li className={`usage-node usage-${phase.state}`} key={phase.name}>
                <span className="usage-dot" aria-hidden="true">
                  {index + 1}
                </span>
                <p className="usage-phase-name">{phase.name}</p>
                <p className="usage-phase-title">{phase.title}</p>
                <p className="usage-phase-badge">{phase.badge}</p>
                <p className="usage-phase-body">{phase.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="usage-close">
        <b>만드는 사람은 바뀌어도, 데이터와 도구는 회사에 남게</b>
        <p>AI 네이티브로 가려면 데이터부터 AX 해야 합니다. NANoDB가 그 출발점입니다.</p>
      </section>
      <p className="usage-foot">
        네 걸음은 모두 실제로 동작합니다. 화면과 숫자는 실행 결과 그대로이며, Phase 2부터는 아직
        만들고 있는 중이라 이 여정에 넣지 않았습니다.
      </p>
    </main>
  );
}
