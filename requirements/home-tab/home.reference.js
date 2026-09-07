// Home tab for the hackathon review. Keeps the existing chrome (topbar, mainnav, panel/stat
// primitives, charts.js) and only adds a landing page:
// mission → three values → CTA → ask-one-line → evidence (public, sourced) → live KPIs + charts
// → Phase 1-4 roadmap → how to use → data policy.
// Every number in the KPI/chart panels comes from the API (approved measurements only);
// public survey figures are static content and always carry their source and year.
import { analysis, images as imageApi, master } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import * as ui from '../ui.js';
import { el, fmt, fmtDate, loading, mount } from '../ui.js';
import { histogram, boxPlot } from '../charts.js';

const BRAND = {
  expansion: 'NANoDB : Nano Assets, Never orphaned Database.',
  subtitle: '데이터는 쌓이고, 툴은 이어진다',
  headline: '만드는 사람은 바뀌어도, 데이터와 도구는 회사에 남게',
  lead: 'SEM·TEM 이미지를 제조 정보와 함께 등록하고, 이미지 위에서 측정한 값을 원본·측정자·방법·위치까지 역추적할 수 있게 보관합니다. 담당자가 바뀌어도 이미지와 측정값은 같은 자리에 남습니다.',
};

const VALUES = [
  ['누구나 만든다', '비개발자도 자동화 툴을 만드는 시대. 이미지와 측정은 만든 사람이 아니라 회사 자산으로 등록됩니다.'],
  ['누구나 꺼내 쓴다', '등록된 이미지는 카탈로그에서 찾고, 저장된 측정은 다시 열어도 같은 위치에 복원됩니다.'],
  ['떠나도 남는다', '원본은 read-only, 측정은 파생 데이터. draft → review → approved 이력이 revision으로 남습니다.'],
];

// Static, externally published figures. Never mixed with NANoDB measurements. Year always shown.
const EVIDENCE = [
  { value: '80%', title: '로우코드 툴 사용자 중 IT 부서 밖 개발자 (2026 전망)', meaning: '툴을 만드는 사람은 이미 현업 엔지니어다', source: 'Gartner', year: 2022, url: 'https://kissflow.com/low-code/gartner-forecasts-on-low-code-development-market/' },
  { value: '78%', title: '저장된 기업 데이터 중 비정형(이미지·문서 등)', meaning: '5.5 ZB(2024) → 10.5 ZB(2028). 이미지가 가장 빨리 쌓인다', source: 'IDC StorageSphere', year: 2024, url: 'https://blog.box.com/90-your-data-unstructured-and-its-full-untapped-value' },
  { value: '68%', title: '기업이 확보하고도 쓰지 못하는 데이터', meaning: '모아두지만 찾지도 쓰지도 못한다', source: 'Seagate · IDC Rethink Data', year: 2020, url: 'https://www.businesswire.com/news/home/20200715005130/en/' },
  { value: '38%', title: '데이터 준비(정제·로딩)에 쓰는 시간', meaning: '표준화된 저장이 없으면 분석 전에 시간이 샌다', source: 'Anaconda', year: 2022, url: 'https://www.bigdatawire.com/2020/07/06/data-prep-still-dominates-data-scientists-time-survey-finds/' },
];

const PHASES = [
  { n: 1, title: '모은다', state: 'now', what: 'SEM·TEM 이미지를 제조 정보(Product/Lot/Wafer/Die)·캘리브레이션과 함께 등록하고, annotation 측정값을 원본까지 역추적되게 축적한다',
    proof: '이미지 등록 · 스케일바 캘리브레이션 · 선/평행선/원호 측정 · 검토·승인 · revision · 분석 · CSV · API 토큰' },
  { n: 2, title: '표준화한다', state: 'next', what: '구조 파라미터를 마스터로 통일하고 SEM Hole 윤곽 라벨을 축적한다. 라벨에서 CDx·CDy·대각 CD·EPE·곡률·링 두께를 자동 산출하고 제품·Lot별 산포를 비교한다',
    proof: '파라미터 마스터 6종 추가 · circle annotation → 6 피처 자동 산출 · 라벨 검수' },
  { n: 3, title: '이어준다', state: 'later', what: '측정 recipe를 툴로 등록해 입출력 계약·담당자·실행 이력을 남기고, Image → Label → Feature → Tool → Owner 계보를 잇는다. API와 에이전트 스킬로 누구나 꺼내 쓴다',
    proof: '툴 생존율 · 계보 그래프 · 에이전트 스킬' },
  { n: 4, title: '제안한다', state: 'later', what: '비숙련 엔지니어가 이미지를 올리면 축적된 이미지·라벨·측정을 근거로 주요 측정 feature를 제안한다. 엔지니어는 어떤 feature를 추출할지 배우고, 승인한 결과가 다시 인프라에 쌓인다',
    proof: '유사 이미지 검색 · feature 추천 · 사람 승인 → 학습 데이터' },
];

const STEPS = [
  ['이미지 등록', '원본 hash 보존 · Product/Lot/Wafer/Die 또는 누락 사유'],
  ['캘리브레이션', '스케일바 두 점 → nm/px'],
  ['측정', '선·평행선·원호 annotation → 구조 파라미터 값'],
  ['검토·승인', '분석가 승인 후 공식값 · revision 보존 · 분석·CSV'],
];

const PARAM_CANDIDATES = ['CD_TOP', 'CD_BOTTOM', 'PATTERN_PITCH', 'LAYER_THICKNESS', 'TRENCH_DEPTH', 'SIDEWALL_ANGLE', 'CORNER_RADIUS'];

function statTile(value, label, hint, href) {
  const body = [
    el('div', { class: 'value' }, value),
    el('div', { class: 'label' }, label),
    hint ? el('div', { class: 'faint', style: 'font-size:11px;margin-top:2px' }, hint) : null,
  ];
  return href
    ? el('a', { class: 'panel stat', href, style: 'text-decoration:none;color:inherit' }, body)
    : el('div', { class: 'panel stat' }, body);
}

// Horizontal composition bar (single-hue steps), used for image types and measurement status.
function compositionBar(parts, total) {
  const shades = ['#1d5fb4', '#6f9ad6', '#b9cdeb', '#dde3ea'];
  const bar = el('div', { style: 'display:flex;height:10px;border-radius:5px;overflow:hidden;background:#eef2f7;margin:6px 0 4px' });
  const legend = el('div', { class: 'row tight', style: 'font-size:11.5px;color:var(--ink-soft);flex-wrap:wrap' });
  parts.forEach(([label, count], i) => {
    if (!count) return;
    const pct = total ? (count / total) * 100 : 0;
    bar.append(el('span', { style: `width:${pct}%;background:${shades[i % shades.length]}`, title: `${label} ${count}` }));
    legend.append(el('span', {}, el('span', { style: `display:inline-block;width:9px;height:9px;border-radius:2px;background:${shades[i % shades.length]};margin-right:4px;vertical-align:middle` }), `${label} ${fmt(count, 0)} (${fmt(pct, 0)}%)`));
  });
  return el('div', {}, bar, legend);
}

// Daily registration counts as thin bars (last 14 days that have data).
function trendBars(items) {
  const byDay = {};
  items.forEach((img) => { const d = (img.created_at || '').slice(0, 10); if (d) byDay[d] = (byDay[d] || 0) + 1; });
  const days = Object.keys(byDay).sort().slice(-14);
  if (!days.length) return ui.empty('No registrations yet.');
  const max = Math.max(...days.map((d) => byDay[d]));
  return el('div', {},
    el('div', { style: 'display:flex;align-items:flex-end;gap:4px;height:48px' },
      days.map((d) => el('div', { title: `${d}: ${byDay[d]}`, style: `flex:0 0 ${days.length < 7 ? 36 : 18}px;background:#1d5fb4;border-radius:3px 3px 0 0;height:${Math.max(4, (byDay[d] / max) * 48)}px` }))),
    el('div', { class: 'faint', style: 'font-size:11px;margin-top:4px;display:flex;justify-content:space-between' },
      el('span', {}, days[0]), el('span', {}, `${days.length}일 · 최대 ${max}/일`), el('span', {}, days[days.length - 1])));
}

function phaseTimeline() {
  const tone = { now: ['#1d5fb4', '지금 동작'], next: ['#1a7f4b', '다음'], later: ['#8a99a8', '로드맵'] };
  return el('div', { class: 'grid', style: 'grid-template-columns:repeat(4,1fr);gap:12px' },
    PHASES.map((p, i) => {
      const [color, label] = tone[p.state];
      return el('div', { class: 'panel', style: `padding:12px 14px;border-top:3px solid ${color}` },
        el('div', { class: 'row tight', style: 'justify-content:space-between' },
          el('div', { style: `font-weight:700;color:${color}` }, `Phase ${p.n} · ${p.title}`),
          ui.badge(label, p.state === 'now' ? 'ok' : p.state === 'next' ? 'info' : '', p.state === 'now' ? '●' : '○')),
        el('div', { style: 'font-size:13px;margin:6px 0' }, p.what),
        el('div', { class: 'faint', style: 'font-size:11.5px' }, p.proof),
        i < PHASES.length - 1 ? null : null);
    }));
}

async function loadData() {
  const dash = await analysis.dashboard();
  const [sem, tem, recent] = await Promise.all([
    imageApi.list({ image_type: 'SEM', limit: 1 }).catch(() => ({ total: null })),
    imageApi.list({ image_type: 'TEM', limit: 1 }).catch(() => ({ total: null })),
    imageApi.list({ limit: 200 }).catch(() => ({ items: [] })),
  ]);
  const byStatus = dash.measurements_by_status || {};
  const approved = byStatus.approved ?? 0;
  const total = Object.values(byStatus).reduce((a, b) => a + (b || 0), 0);
  let params = []; let dist = null; let parameters = [];
  if (store.can('analysis:read')) {
    const runs = await Promise.all(PARAM_CANDIDATES.map((code) =>
      analysis.run({ parameter_code: code, statuses: ['approved'], group_by: 'lot', bins: 10 })
        .then((r) => ({ code, n: r.summary?.count ?? 0, mean: r.summary?.mean ?? null, unit: r.unit, result: r }))
        .catch(() => ({ code, n: 0, mean: null }))));
    params = runs.filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
    dist = params[0] || null;
  }
  if (store.can('master:read')) parameters = await master.parameters().then((r) => r.items || r).catch(() => []);
  return { dash, sem: sem.total, tem: tem.total, recent: recent.items || [], approved, total, byStatus, params, dist, parameters, asOf: new Date() };
}

export async function homePage(view) {
  mount(view, loading('Loading home…'));
  let k = null; let error = null;
  try { k = await loadData(); } catch (e) { error = e; }

  // ---- 1. hero ----
  const hero = el('div', { class: 'panel', style: 'padding:24px 28px;margin-bottom:16px' },
    el('div', { style: 'display:flex;gap:28px;align-items:center;flex-wrap:wrap' },
      el('img', { src: '/assets/img/nanodb_logo_horizontal.png', alt: 'NANoDB', style: 'height:88px;width:auto' }),
      el('div', { style: 'flex:1;min-width:320px' },
        el('div', { class: 'subtle', style: 'font-weight:600;color:var(--ink)' }, BRAND.expansion),
        el('div', { class: 'subtle' }, BRAND.subtitle),
        el('h1', { style: 'margin:10px 0 6px;font-size:24px;letter-spacing:-.2px' }, BRAND.headline),
        el('p', { style: 'margin:0;max-width:760px;color:var(--ink-soft)' }, BRAND.lead))),
    el('div', { class: 'grid cols-3', style: 'margin-top:18px' },
      VALUES.map(([title, text]) => el('div', { class: 'panel', style: 'padding:12px 14px;background:var(--panel-2)' },
        el('div', { style: 'font-weight:650;color:var(--accent);margin-bottom:3px' }, title),
        el('div', { class: 'subtle' }, text)))),
    el('div', { class: 'row', style: 'margin-top:18px;gap:8px;flex-wrap:wrap' },
      el('a', { class: 'btn primary', href: '#/catalog' }, 'Browse catalog →'),
      store.can('image:create') ? el('a', { class: 'btn', href: '#/upload' }, 'Register image') : null,
      store.can('measurement:read') ? el('a', { class: 'btn', href: '#/review' }, 'Review queue') : null,
      store.can('analysis:read') ? el('a', { class: 'btn', href: '#/analysis' }, 'Analysis') : null));

  // ---- 2. ask one line (like a "한 줄로 물어보세요" widget) → analysis with filters ----
  let ask = null;
  if (k && store.can('analysis:read')) {
    const codes = k.parameters.length ? k.parameters.map((p) => p.code) : PARAM_CANDIDATES;
    const paramSel = ui.select(codes, k.dist?.code || codes[0], () => {}, { style: 'width:auto;min-width:150px' });
    const groupSel = ui.select([['lot', 'Lot별'], ['wafer', 'Wafer별'], ['product', 'Product별'], ['equipment', '장비별']], 'lot', () => {}, { style: 'width:auto;min-width:110px' });
    ask = el('div', { class: 'panel', style: 'padding:12px 16px;margin-bottom:16px;background:var(--accent-soft);border-color:#bcd2ee' },
      el('div', { class: 'row', style: 'gap:10px;flex-wrap:wrap;align-items:center' },
        el('span', { style: 'font-weight:650' }, '한 줄로 물어보기'),
        el('span', { class: 'subtle' }, '승인된'), paramSel, el('span', { class: 'subtle' }, '값을'), groupSel, el('span', { class: 'subtle' }, '나눠서 분포로 보여줘'),
        el('button', { class: 'primary', onclick: () => navigate('/analysis', { parameter_code: paramSel.value, group_by: groupSel.value }) }, '분포 보기 →'),
        el('span', { class: 'faint', style: 'font-size:11.5px' }, '결과 화면에서 점을 누르면 원본 이미지·측정 위치로 내려갑니다')));
  }

  // ---- 3. evidence ----
  const evidence = ui.panel('왜 지금인가',
    el('div', {},
      el('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr' }, EVIDENCE.map((e) =>
        el('div', { class: 'panel stat' },
          el('div', { class: 'value' }, e.value),
          el('div', { class: 'label' }, e.title),
          el('div', { class: 'faint', style: 'font-size:11px;margin-top:2px' }, e.meaning),
          el('div', { class: 'faint', style: 'font-size:11px;margin-top:6px' },
            `${e.source}, ${e.year} · `, el('a', { href: e.url, target: '_blank', rel: 'noopener' }, '출처'))))),
      el('div', { class: 'faint', style: 'font-size:11px;margin-top:8px' },
        '외부 공개 조사 수치입니다. 발표 연도를 함께 표기하며 NANoDB 실측값과 섞지 않습니다.')));

  // ---- 4. live KPIs + charts ----
  let kpiBody; let chartsBody = null;
  if (error) {
    kpiBody = ui.notice(error.message || String(error), 'danger', 'KPI를 불러오지 못했습니다');
  } else {
    const typeHint = (k.sem == null || k.tem == null) ? 'registered originals' : `SEM ${fmt(k.sem, 0)} · TEM ${fmt(k.tem, 0)}`;
    const top = k.params.slice(0, 2);
    const paramTiles = top.length
      ? top.map((p) => statTile(`${fmt(p.mean, 1)} ${ui.unitLabel(p.unit) || 'nm'}`, `${p.code} mean`, `n=${p.n} · approved only`, `#/analysis?parameter_code=${p.code}`))
      : [statTile('—', 'Parameter mean', k.total ? 'no approved measurements yet' : 'no measurements yet · n=0', '#/analysis')];
    kpiBody = el('div', {},
      el('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr' },
        statTile(fmt(k.dash.image_count ?? 0, 0), 'Images', typeHint, '#/catalog'),
        statTile(fmt(k.approved, 0), 'Approved measurements', `${fmt(k.total, 0)} total · ${fmt(k.dash.review_pending ?? 0, 0)} awaiting review`, '#/review'),
        ...paramTiles),
      el('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr;margin-top:12px' },
        el('div', {}, el('div', { class: 'subtle', style: 'font-weight:600' }, '이미지 구성'),
          compositionBar([['SEM', k.sem || 0], ['TEM', k.tem || 0]], (k.sem || 0) + (k.tem || 0))),
        el('div', {}, el('div', { class: 'subtle', style: 'font-weight:600' }, '측정 상태'),
          compositionBar([['approved', k.byStatus.approved || 0], ['in_review', k.byStatus.in_review || 0], ['draft', k.byStatus.draft || 0], ['rejected', k.byStatus.rejected || 0]], k.total))),
      el('div', { style: 'margin-top:12px' }, el('div', { class: 'subtle', style: 'font-weight:600' }, '이미지 등록 추이 (일별)'), trendBars(k.recent)));

    if (k.dist) {
      const r = k.dist.result; const unit = ui.unitLabel(r.unit) || 'nm';
      const spec = (r.spec && (r.spec.lsl != null || r.spec.usl != null)) ? { lsl: r.spec.lsl, usl: r.spec.usl } : null;
      chartsBody = el('div', { class: 'grid cols-2' },
        ui.panel(`${k.dist.code} 분포 · approved n=${k.dist.n}`,
          el('div', {}, histogram(r.histogram, { unit, spec, width: 560, height: 220 }),
            el('div', { class: 'faint', style: 'font-size:11.5px;margin-top:4px' },
              `median ${fmt(r.summary.median)} · p05 ${fmt(r.summary.p05)} · p95 ${fmt(r.summary.p95)} ${unit}` + (spec ? ` · spec ${fmt(spec.lsl)}–${fmt(spec.usl)}` : ''))),
          [el('a', { class: 'btn small', href: `#/analysis?parameter_code=${k.dist.code}` }, 'Analysis')]),
        ui.panel(`${k.dist.code} · Lot별 비교`,
          el('div', {}, boxPlot((r.groups || []).map((g) => ({ key: g.key, stats: g.box })), { unit, spec, width: 560, height: 220,
            onSelect: (g) => navigate('/analysis', { parameter_code: k.dist.code, group_by: 'lot' }) }),
            el('div', { class: 'faint', style: 'font-size:11.5px;margin-top:4px' }, '상자를 누르면 분석 화면으로 · 점 하나 = 승인된 측정 하나 = 원본 이미지의 annotation')),
          [el('a', { class: 'btn small', href: `#/analysis?parameter_code=${k.dist.code}&group_by=lot` }, 'Lot별 보기')]));
    }
  }
  const kpis = ui.panel(`지금 쌓인 데이터 · 집계 ${k ? fmtDate(k.asOf) : '—'}`, kpiBody,
    [el('a', { class: 'btn small', href: '#/dashboard' }, 'Dashboard')]);

  // ---- 5. phases ----
  const phases = ui.panel('NANoDB가 가는 길 · Phase 1 → 4',
    el('div', {}, phaseTimeline(),
      el('div', { class: 'faint', style: 'font-size:11.5px;margin-top:8px' },
        'Phase 1은 지금 이 화면에서 동작합니다. Phase 2~4는 로드맵이며 미구현 기능을 동작하는 것처럼 표시하지 않습니다.')));

  // ---- 6. steps / policy ----
  const steps = ui.panel('이렇게 쓰세요',
    el('div', { class: 'grid cols-4' }, STEPS.map(([title, text], i) =>
      el('div', { class: 'panel', style: 'padding:12px 14px' },
        el('div', { style: 'font-weight:700;color:var(--accent);font-size:16px' }, String(i + 1)),
        el('div', { style: 'font-weight:600' }, title),
        el('div', { class: 'subtle' }, text)))));
  const policy = el('div', { class: 'faint', style: 'font-size:12px;margin-top:14px' },
    '원본 이미지 hash 불변 · annotation·측정은 파생 데이터 · 승인 전 값은 초안 · 모든 수치에 n과 기준 시각 · 데모 데이터는 synthetic 또는 사용 권한이 확인된 자료');

  mount(view, hero, ask,
    el('div', { class: 'grid cols-2', style: 'margin-bottom:16px' }, evidence, kpis),
    chartsBody ? el('div', { style: 'margin-bottom:16px' }, chartsBody) : null,
    el('div', { style: 'margin-bottom:16px' }, phases),
    steps, policy);
}
