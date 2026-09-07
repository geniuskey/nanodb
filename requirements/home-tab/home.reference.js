// Home tab for the hackathon review. Keeps the existing chrome and only adds a landing page.
// The page is self-contained: no links or buttons to other tabs (the main nav does that).
// Order follows the review flow: why (mission) -> what works today (live data, images, charts)
// -> why now (public evidence) -> where it goes (Phase 1-4) -> how it was built (AI-DLC)
// -> how to use -> data policy. Live numbers come from the API (approved measurements only);
// public figures are static and always show their source and year.
import { analysis, images as imageApi } from '../api.js';
import { store } from '../store.js';
import * as ui from '../ui.js';
import { el, fmt, fmtDate, loading, mount } from '../ui.js';
import { histogram, boxPlot } from '../charts.js';

const IMG = '/assets/img/';

const BRAND = {
  expansion: 'NANoDB : Nano Assets, Never orphaned Database.',
  subtitle: '데이터는 쌓이고, 툴은 이어진다',
  headline: '만드는 사람은 바뀌어도, 데이터와 도구는 회사에 남게',
  lead: 'SEM, TEM 이미지를 제조 정보와 함께 등록하고, 이미지 위에서 측정한 값을 원본과 측정자, 방법, 위치까지 거슬러 올라갈 수 있게 보관합니다. 담당자가 바뀌어도 이미지와 측정값은 같은 자리에 남습니다.',
};

const VALUES = [
  ['누구나 만든다', '비개발자도 자동화 툴을 만드는 시대입니다. 이미지와 측정은 만든 사람의 것이 아니라 회사 자산으로 등록됩니다.'],
  ['누구나 꺼내 쓴다', '등록된 이미지는 카탈로그에서 찾고, 저장된 측정은 다시 열어도 같은 위치에 복원됩니다.'],
  ['떠나도 남는다', '원본은 읽기 전용, 측정은 파생 데이터입니다. 초안에서 검토, 승인까지의 이력이 revision으로 남습니다.'],
];

// Static, externally published figures. Never mixed with NANoDB measurements. Year always shown.
const EVIDENCE = [
  { icon: 'ev_people.svg', value: '80%', title: '로우코드 툴 사용자 가운데 IT 부서 밖 개발자 (2026년 전망)', meaning: '툴을 만드는 사람은 이미 현업 엔지니어입니다', source: 'Gartner', year: 2022, url: 'https://kissflow.com/low-code/gartner-forecasts-on-low-code-development-market/' },
  { icon: 'ev_storage.svg', value: '78%', title: '저장된 기업 데이터 가운데 비정형 데이터 (이미지, 문서)', meaning: '5.5 ZB(2024)에서 10.5 ZB(2028)로. 이미지가 가장 빨리 쌓입니다', source: 'IDC StorageSphere', year: 2024, url: 'https://blog.box.com/90-your-data-unstructured-and-its-full-untapped-value' },
  { icon: 'ev_unused.svg', value: '68%', title: '기업이 확보하고도 쓰지 못하는 데이터', meaning: '모아두지만 찾지도 쓰지도 못합니다', source: 'Seagate, IDC Rethink Data', year: 2020, url: 'https://www.businesswire.com/news/home/20200715005130/en/' },
  { icon: 'ev_time.svg', value: '38%', title: '데이터 준비(정제, 로딩)에 쓰는 시간', meaning: '표준화된 저장이 없으면 분석 전에 시간이 샙니다', source: 'Anaconda', year: 2022, url: 'https://www.bigdatawire.com/2020/07/06/data-prep-still-dominates-data-scientists-time-survey-finds/' },
];

const PHASES = [
  { n: 1, title: '모은다', state: 'now', art: 'phase1_collect.svg',
    what: 'SEM, TEM 이미지를 제조 정보(Product, Lot, Wafer, Die)와 캘리브레이션과 함께 등록하고, annotation 측정값을 원본까지 거슬러 올라갈 수 있게 쌓습니다.',
    proof: '이미지 등록, 스케일바 캘리브레이션, 선과 평행선과 원호 측정, 검토와 승인, revision, 분석, CSV, API 토큰' },
  { n: 2, title: '표준화한다', state: 'next', art: 'phase2_standardize.svg',
    what: '구조 파라미터를 마스터로 통일하고 SEM Hole 윤곽 라벨을 쌓습니다. 라벨에서 CDx, CDy, 대각 CD, EPE, 곡률, 링 두께를 자동으로 구하고 제품과 Lot별 산포를 비교합니다.',
    proof: '파라미터 마스터 6종 추가, 원형 annotation에서 6개 피처 자동 산출, 라벨 검수' },
  { n: 3, title: '이어준다', state: 'later', art: 'phase3_lineage.svg',
    what: '측정 recipe를 툴로 등록해 입출력 계약과 담당자, 실행 이력을 남기고, Image에서 Label, Feature, Tool, Owner까지 계보를 잇습니다. API와 에이전트 스킬로 누구나 꺼내 씁니다.',
    proof: '툴 생존율, 계보 그래프, 에이전트 스킬' },
  { n: 4, title: '제안한다', state: 'later', art: 'phase4_suggest.svg',
    what: '비숙련 엔지니어가 이미지를 올리면 쌓인 이미지, 라벨, 측정을 근거로 주요 측정 feature를 제안합니다. 엔지니어는 어떤 feature를 뽑을지 배우고, 승인한 결과는 다시 인프라에 쌓입니다.',
    proof: '유사 이미지 검색, feature 추천, 사람 승인 후 학습 데이터' },
];

// How it was built: mirrors the three demo points of the AI-DLC review.
const HOW = [
  { title: '1. 산출물 구조', text: '요구사항, 유저 스토리, 워크플로 계획, 애플리케이션 설계, 유닛 분할, 유닛별 설계와 코드가 aidlc-docs 폴더에 게이트 순서대로 남아 있습니다.',
    lines: ['inception/  requirements, user-stories, application-design, units', 'construction/  home-web, hole-feature, agent-skill', 'aidlc-state.md, audit.md'] },
  { title: '2. 핵심 설계 결정', text: '기존 플랫폼은 그대로 두고 홈 탭, Hole 피처, 에이전트 스킬 세 유닛만 얹었습니다. 값을 정해야 하는 자리는 질문 파일로 사람이 답했습니다.',
    lines: ['원본 hash 불변, 측정은 파생 데이터', '승인 전 값은 초안, 승인 후 수정은 새 revision', 'Hole 피처 정의는 도메인 리뷰어가 게이트에서 결정'] },
  { title: '3. 협업하며 배운 것', text: '코드가 아니라 설계 문서를 고치고 다시 생성했습니다. 게이트마다 컨텍스트를 비우고, 첫 프롬프트에 시간과 범위를 못 박았습니다.',
    lines: ['Never vibe code', '게이트마다 /clear 와 commit', '질문할 때는 "문서 수정하지 마"를 앞에'] },
];

const STEPS = [
  ['이미지 등록', '원본 hash를 보존하고 Product, Lot, Wafer, Die 또는 누락 사유를 적습니다'],
  ['캘리브레이션', '스케일바 두 점으로 nm/px를 정합니다'],
  ['측정', '선, 평행선, 원호 annotation에서 구조 파라미터 값을 얻습니다'],
  ['검토와 승인', '분석가 승인 후 공식값이 되고 revision이 보존됩니다'],
];

const PARAM_CANDIDATES = ['CD_TOP', 'CD_BOTTOM', 'PATTERN_PITCH', 'LAYER_THICKNESS', 'TRENCH_DEPTH', 'SIDEWALL_ANGLE', 'CORNER_RADIUS'];

function statTile(value, label, hint) {
  return el('div', { class: 'panel stat' },
    el('div', { class: 'value' }, value),
    el('div', { class: 'label' }, label),
    hint ? el('div', { class: 'faint', style: 'font-size:11px;margin-top:2px' }, hint) : null);
}

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
      el('span', {}, days[0]), el('span', {}, `${days.length}일, 하루 최대 ${max}장`), el('span', {}, days[days.length - 1])));
}

function thumbStrip(items) {
  const pick = items.slice(0, 6);
  if (!pick.length) return ui.empty('No images yet.');
  return el('div', { class: 'thumb-grid', style: 'grid-template-columns:repeat(6,1fr)' }, pick.map((image) =>
    el('div', { class: 'thumb-card' },
      el('img', { src: imageApi.contentUrl(image.image_id, 'thumbnail'), alt: image.original_filename, loading: 'lazy' }),
      el('div', { class: 'meta' },
        el('div', { class: 'name' }, image.original_filename),
        el('div', { class: 'faint' }, [image.image_type, image.traceability?.lot_code, image.traceability?.wafer_code].filter(Boolean).join(' '))))));
}

function phaseCards() {
  const tone = { now: ['#1d5fb4', '지금 동작', 'ok', '●'], next: ['#1a7f4b', '다음', 'info', '○'], later: ['#8a99a8', '로드맵', '', '○'] };
  return el('div', { class: 'grid', style: 'grid-template-columns:repeat(4,1fr);gap:12px' },
    PHASES.map((p) => {
      const [color, label, badgeTone, mark] = tone[p.state];
      return el('div', { class: 'panel', style: `padding:12px 14px;border-top:3px solid ${color}` },
        el('div', { class: 'row tight', style: 'justify-content:space-between' },
          el('div', { style: `font-weight:700;color:${color}` }, `Phase ${p.n}  ${p.title}`),
          ui.badge(label, badgeTone, mark)),
        el('img', { src: IMG + p.art, alt: '', style: 'width:100%;height:auto;display:block;margin:8px 0 6px;border:1px solid var(--line);border-radius:6px;background:#fff' }),
        el('div', { style: 'font-size:13px;margin:4px 0' }, p.what),
        el('div', { class: 'faint', style: 'font-size:11.5px' }, p.proof));
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
  let params = []; let dist = null;
  if (store.can('analysis:read')) {
    const runs = await Promise.all(PARAM_CANDIDATES.map((code) =>
      analysis.run({ parameter_code: code, statuses: ['approved'], group_by: 'lot', bins: 10 })
        .then((r) => ({ code, n: r.summary?.count ?? 0, mean: r.summary?.mean ?? null, unit: r.unit, result: r }))
        .catch(() => ({ code, n: 0, mean: null }))));
    params = runs.filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
    dist = params[0] || null;
  }
  return { dash, sem: sem.total, tem: tem.total, recent: recent.items || [], approved, total, byStatus, params, dist, asOf: new Date() };
}

export async function homePage(view) {
  mount(view, loading('Loading home…'));
  let k = null; let error = null;
  try { k = await loadData(); } catch (e) { error = e; }

  // 1. mission
  const hero = el('div', { class: 'panel', style: 'padding:24px 28px;margin-bottom:16px' },
    el('div', { style: 'display:flex;gap:28px;align-items:center;flex-wrap:wrap' },
      el('img', { src: IMG + 'nanodb_logo_horizontal.png', alt: 'NANoDB', style: 'height:88px;width:auto' }),
      el('div', { style: 'flex:1;min-width:320px' },
        el('div', { class: 'subtle', style: 'font-weight:600;color:var(--ink)' }, BRAND.expansion),
        el('div', { class: 'subtle' }, BRAND.subtitle),
        el('h1', { style: 'margin:10px 0 6px;font-size:24px;letter-spacing:-.2px' }, BRAND.headline),
        el('p', { style: 'margin:0;max-width:760px;color:var(--ink-soft)' }, BRAND.lead))),
    el('div', { class: 'grid cols-3', style: 'margin-top:18px' },
      VALUES.map(([title, text]) => el('div', { class: 'panel', style: 'padding:12px 14px;background:var(--panel-2)' },
        el('div', { style: 'font-weight:650;color:var(--accent);margin-bottom:3px' }, title),
        el('div', { class: 'subtle' }, text)))));

  // 2. what works today: live data
  let liveBody; let chartsBody = null; let thumbs = null;
  if (error) {
    liveBody = ui.notice(error.message || String(error), 'danger', '데이터를 불러오지 못했습니다');
  } else {
    const typeHint = (k.sem == null || k.tem == null) ? '등록된 원본' : `SEM ${fmt(k.sem, 0)}장, TEM ${fmt(k.tem, 0)}장`;
    const top = k.params.slice(0, 2);
    const paramTiles = top.length
      ? top.map((p) => statTile(`${fmt(p.mean, 1)} ${ui.unitLabel(p.unit) || 'nm'}`, `${p.code} 평균`, `n=${p.n}, 승인값만`))
      : [statTile('—', '파라미터 평균', k.total ? '승인된 측정이 아직 없습니다' : '측정이 아직 없습니다 (n=0)')];
    liveBody = el('div', {},
      el('div', { class: 'grid', style: 'grid-template-columns:repeat(4,1fr)' },
        statTile(fmt(k.dash.image_count ?? 0, 0), '이미지', typeHint),
        statTile(fmt(k.approved, 0), '승인된 측정', `전체 ${fmt(k.total, 0)}건, 검토 대기 ${fmt(k.dash.review_pending ?? 0, 0)}건`),
        ...paramTiles),
      el('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr 1fr;margin-top:12px' },
        el('div', {}, el('div', { class: 'subtle', style: 'font-weight:600' }, '이미지 구성'),
          compositionBar([['SEM', k.sem || 0], ['TEM', k.tem || 0]], (k.sem || 0) + (k.tem || 0))),
        el('div', {}, el('div', { class: 'subtle', style: 'font-weight:600' }, '측정 상태'),
          compositionBar([['approved', k.byStatus.approved || 0], ['in_review', k.byStatus.in_review || 0], ['draft', k.byStatus.draft || 0], ['rejected', k.byStatus.rejected || 0]], k.total)),
        el('div', {}, el('div', { class: 'subtle', style: 'font-weight:600' }, '이미지 등록 추이 (일별)'), trendBars(k.recent))));
    thumbs = ui.panel('최근 등록된 이미지', thumbStrip(k.recent));
    if (k.dist) {
      const r = k.dist.result; const unit = ui.unitLabel(r.unit) || 'nm';
      const spec = (r.spec && (r.spec.lsl != null || r.spec.usl != null)) ? { lsl: r.spec.lsl, usl: r.spec.usl } : null;
      chartsBody = el('div', { class: 'grid cols-2' },
        ui.panel(`${k.dist.code} 분포 (승인값 n=${k.dist.n})`,
          el('div', {}, histogram(r.histogram, { unit, spec, width: 560, height: 220 }),
            el('div', { class: 'faint', style: 'font-size:11.5px;margin-top:4px' },
              `median ${fmt(r.summary.median)}, p05 ${fmt(r.summary.p05)}, p95 ${fmt(r.summary.p95)} ${unit}` + (spec ? `, spec ${fmt(spec.lsl)} to ${fmt(spec.usl)}` : '')))),
        ui.panel(`${k.dist.code} Lot별 비교`,
          el('div', {}, boxPlot((r.groups || []).map((g) => ({ key: g.key, stats: g.box })), { unit, spec, width: 560, height: 220 }),
            el('div', { class: 'faint', style: 'font-size:11.5px;margin-top:4px' }, '점 하나가 승인된 측정 하나이고, 원본 이미지의 annotation까지 이어집니다'))));
    }
  }
  const live = ui.panel(`지금 쌓인 데이터 (집계 ${k ? fmtDate(k.asOf) : '—'})`, liveBody);

  // 3. why now
  const evidence = ui.panel('왜 지금인가',
    el('div', {},
      el('div', { class: 'grid', style: 'grid-template-columns:repeat(4,1fr)' }, EVIDENCE.map((e) =>
        el('div', { class: 'panel stat', style: 'display:flex;gap:12px;align-items:flex-start' },
          el('img', { src: IMG + e.icon, alt: '', style: 'width:56px;height:56px;flex:none' }),
          el('div', {},
            el('div', { class: 'value' }, e.value),
            el('div', { class: 'label' }, e.title),
            el('div', { class: 'faint', style: 'font-size:11px;margin-top:2px' }, e.meaning),
            el('div', { class: 'faint', style: 'font-size:11px;margin-top:6px' },
              `${e.source}, ${e.year} `, el('a', { href: e.url, target: '_blank', rel: 'noopener' }, '출처')))))),
      el('div', { class: 'faint', style: 'font-size:11px;margin-top:8px' },
        '외부 공개 조사 수치입니다. 발표 연도를 함께 표기하며 NANoDB 실측값과 섞지 않습니다.')));

  // 4. phases
  const phases = ui.panel('NANoDB가 가는 길, Phase 1에서 4까지',
    el('div', {}, phaseCards(),
      el('div', { class: 'faint', style: 'font-size:11.5px;margin-top:8px' },
        'Phase 1은 지금 이 화면에서 동작합니다. Phase 2부터 4는 로드맵이며 미구현 기능을 동작하는 것처럼 표시하지 않습니다.')));

  // 5. how it was built (AI-DLC)
  const how = ui.panel('어떻게 만들었나 (AI-DLC)',
    el('div', { class: 'grid cols-3' }, HOW.map((h) =>
      el('div', { class: 'panel', style: 'padding:12px 14px' },
        el('div', { style: 'font-weight:650;color:var(--accent);margin-bottom:4px' }, h.title),
        el('div', { style: 'font-size:13px' }, h.text),
        el('pre', { style: 'margin:8px 0 0;font-size:11.5px;background:var(--panel-2);border:1px solid var(--line);border-radius:6px;padding:8px 10px;white-space:pre-wrap' }, h.lines.join('\n'))))));

  // 6. steps, policy
  const steps = ui.panel('이렇게 쓰세요',
    el('div', { class: 'grid cols-4' }, STEPS.map(([title, text], i) =>
      el('div', { class: 'panel', style: 'padding:12px 14px' },
        el('div', { style: 'font-weight:700;color:var(--accent);font-size:16px' }, String(i + 1)),
        el('div', { style: 'font-weight:600' }, title),
        el('div', { class: 'subtle' }, text)))));
  const policy = el('div', { class: 'faint', style: 'font-size:12px;margin-top:14px' },
    '원본 이미지 hash 불변, annotation과 측정은 파생 데이터, 승인 전 값은 초안, 모든 수치에 n과 기준 시각, 데모 데이터는 synthetic 또는 사용 권한이 확인된 자료');

  mount(view, hero,
    el('div', { style: 'margin-bottom:16px' }, live),
    thumbs ? el('div', { style: 'margin-bottom:16px' }, thumbs) : null,
    chartsBody ? el('div', { style: 'margin-bottom:16px' }, chartsBody) : null,
    el('div', { style: 'margin-bottom:16px' }, evidence),
    el('div', { style: 'margin-bottom:16px' }, phases),
    el('div', { style: 'margin-bottom:16px' }, how),
    steps, policy);
}
