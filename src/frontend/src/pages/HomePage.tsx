import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import type { SummaryView } from "../api/types";

type LoadState = "loading" | "success" | "failure";

export function HomePage() {
  const [summary, setSummary] = useState<SummaryView | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let active = true;
    api
      .getSummary()
      .then((value) => {
        if (active) {
          setSummary(value);
          setState("success");
        }
      })
      .catch(() => active && setState("failure"));
    return () => {
      active = false;
    };
  }, []);

  return (
    <main>
      <section className="hero" aria-labelledby="home-title">
        <p className="eyebrow">Nano Assets, Never orphaned Database</p>
        <h1 id="home-title">측정 데이터와 맥락을 이어갑니다</h1>
        <p className="hero-copy">
          SEM/TEM 이미지와 측정 근거를 연결해 다시 찾고, 복원하고, AI 분석
          코드 개발에 재사용합니다.
        </p>
        <div className="actions">
          <Link className="button primary" to="/images" data-testid="home-browse-images">
            이미지 둘러보기
          </Link>
          <Link className="button secondary" to="/images/new" data-testid="home-register-image">
            이미지 등록
          </Link>
        </div>
      </section>

      <section aria-labelledby="values-title">
        <h2 id="values-title">측정 근거를 데이터 자산으로</h2>
        <div className="card-grid three">
          <article className="card"><h3>연결</h3><p>이미지, 제조 식별정보, 좌표와 측정값을 함께 보존합니다.</p></article>
          <article className="card"><h3>복원</h3><p>원본 좌표를 기준으로 화면 크기가 달라도 같은 위치를 다시 표시합니다.</p></article>
          <article className="card"><h3>재사용</h3><p>데이터 계약과 검증 기준을 ZIP으로 내보내 개발 설명을 재사용합니다.</p></article>
        </div>
      </section>

      <section aria-labelledby="summary-title">
        <h2 id="summary-title">실제 축적 현황</h2>
        {state === "loading" && <p role="status">실제 데이터를 불러오는 중입니다.</p>}
        {state === "failure" && <p role="alert">현황을 불러오지 못했습니다.</p>}
        {state === "success" && summary && (
          <div className="summary-panel" data-testid="home-summary">
            <div><strong>{summary.image_count}</strong><span>등록 이미지</span></div>
            <div><strong>{summary.measurement_count}</strong><span>저장 측정</span></div>
            <p>집계 기준: {new Date(summary.calculated_at).toLocaleString()}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="flow-title">
        <h2 id="flow-title">핵심 흐름</h2>
        <ol className="flow">
          <li>Image 등록</li><li>Measurement 저장</li><li>Development Context 내보내기</li><li>앱 밖에서 코드 검증</li>
        </ol>
      </section>

      <section className="roadmap" aria-labelledby="roadmap-title">
        <h2 id="roadmap-title">후속 로드맵</h2>
        <p>자동 측정, 검토 승인, Tool lineage와 API/Skill은 이번 MVP에 포함되지 않습니다.</p>
      </section>
      <p className="policy">원본 이미지는 수정하지 않고, 측정은 미검토 수동 참고 데이터로 별도 저장합니다.</p>
    </main>
  );
}
