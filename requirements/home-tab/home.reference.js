// Home tab for the hackathon review. Keeps the existing chrome (topbar, mainnav, panel/stat
// primitives) and only adds a landing page: mission → evidence → what works today → live KPIs
// → how to use → data policy. Every number in the KPI panels comes from the API; public survey
// figures are static content and always carry their source and year.
import { analysis, images as imageApi } from '../api.js';
import { store } from '../store.js';
import * as ui from '../ui.js';
import { el, fmt, fmtDate, loading, mount } from '../ui.js';

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

// Static, externally published figures. Never mixed with NANoDB measurements.
const EVIDENCE = [
  { value: '4 : 1', title: '시민 개발자 : 전문 개발자 전망', meaning: '비개발자가 만드는 툴이 개발자보다 많아진다', source: 'Gartner 전망', year: 2021, url: 'https://kissflow.com/citizen-development/gartner-on-citizen-development/' },
  { value: '55%', title: '조직 데이터 중 다크 데이터', meaning: '모아두지만 찾지도 쓰지도 못하는 데이터', source: 'Splunk', year: 2019, url: 'https://www.splunk.com/en_us/form/the-state-of-dark-data.html' },
  { value: '42%', title: '개인에게만 있는 조직 지식', meaning: '그 사람이 떠나면 동료가 그 일을 못 한다', source: 'Panopto', year: 2018, url: 'https://www.panopto.com/resource/ebook/valuing-workplace-knowledge/' },
  { value: '38~45%', title: '데이터 준비에 쓰는 시간', meaning: '정제·로딩이 모델링보다 크다', source: 'Anaconda', year: '2020–2022', url: 'https://www.bigdatawire.com/2020/07/06/data-prep-still-dominates-data-scientists-time-survey-finds/' },
];

const STEPS = [
  ['이미지 등록', '원본 hash 보존 · Product/Lot/Wafer/Die 또는 누락 사유'],
  ['캘리브레이션', '스케일바 두 점 → nm/px'],
  ['측정', '선·평행선·원호 annotation → 구조 파라미터 값'],
  ['검토·승인', '분석가 승인 후 공식값 · revision 보존 · 분석·CSV'],
];

const ROADMAP = ['Hole 윤곽 라벨링', 'CDx · CDy · EPE · 곡률 · 링 두께 자동 산출', '툴 등록 · 생존율', 'Image → Label → Feature → Tool → Owner 계보', '에이전트 스킬'];

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

async function loadKpis() {
  const dash = await analysis.dashboard();
  const [sem, tem] = await Promise.all([
    imageApi.list({ image_type: 'SEM', limit: 1 }).catch(() => ({ total: null })),
    imageApi.list({ image_type: 'TEM', limit: 1 }).catch(() => ({ total: null })),
  ]);
  const byStatus = dash.measurements_by_status || {};
  const approved = byStatus.approved ?? 0;
  const total = Object.values(byStatus).reduce((a, b) => a + (b || 0), 0);
  // Per-parameter means over approved measurements only.
  let params = [];
  if (store.can('analysis:read')) {
    const codes = ['CD_TOP', 'CD_BOTTOM', 'PATTERN_PITCH', 'LAYER_THICKNESS', 'TRENCH_DEPTH'];
    const runs = await Promise.all(codes.map((code) =>
      analysis.run({ parameter_code: code, statuses: ['approved'] })
        .then((r) => ({ code, n: r.summary?.count ?? 0, mean: r.summary?.mean ?? null, unit: r.unit }))
        .catch(() => ({ code, n: 0, mean: null }))));
    params = runs.filter((r) => r.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
  }
  return { dash, sem: sem.total, tem: tem.total, approved, total, params, asOf: new Date() };
}

export async function homePage(view) {
  mount(view, loading('Loading home…'));
  let k = null; let error = null;
  try { k = await loadKpis(); } catch (e) { error = e; }

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
      store.can('analysis:read') ? el('a', { class: 'btn', href: '#/analysis' }, 'Analysis') : null,
      el('span', { class: 'faint', style: 'font-size:12px;margin-left:6px' },
        '지금 동작: 이미지 등록 · 캘리브레이션 · annotation 측정 · 검토/승인 · 분석 · CSV · API 토큰')));

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

  let kpiBody;
  if (error) {
    kpiBody = ui.notice(error.message || String(error), 'danger', 'KPI를 불러오지 못했습니다');
  } else {
    const typeHint = (k.sem == null || k.tem == null) ? 'registered originals' : `SEM ${fmt(k.sem, 0)} · TEM ${fmt(k.tem, 0)}`;
    const paramTiles = k.params.length
      ? k.params.map((p) => statTile(`${fmt(p.mean, 1)} ${ui.unitLabel(p.unit) || 'nm'}`, `${p.code} mean`, `n=${p.n} · approved only`, '#/analysis'))
      : [statTile('—', 'Parameter mean', k.total ? 'no approved measurements yet' : 'no measurements yet · n=0', '#/analysis')];
    kpiBody = el('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr' },
      statTile(fmt(k.dash.image_count ?? 0, 0), 'Images', typeHint, '#/catalog'),
      statTile(fmt(k.approved, 0), 'Approved measurements', `${fmt(k.total, 0)} total · ${fmt(k.dash.review_pending ?? 0, 0)} awaiting review`, '#/review'),
      ...paramTiles);
  }
  const kpis = ui.panel(`지금 쌓인 데이터 · 집계 ${k ? fmtDate(k.asOf) : '—'}`, kpiBody,
    [el('a', { class: 'btn small', href: '#/dashboard' }, 'Dashboard')]);

  const steps = ui.panel('이렇게 쓰세요',
    el('div', { class: 'grid cols-4' }, STEPS.map(([title, text], i) =>
      el('div', { class: 'panel', style: 'padding:12px 14px' },
        el('div', { style: 'font-weight:700;color:var(--accent);font-size:16px' }, String(i + 1)),
        el('div', { style: 'font-weight:600' }, title),
        el('div', { class: 'subtle' }, text)))));

  const roadmap = ui.panel('로드맵 (미구현 · P2)',
    el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
      ROADMAP.map((t) => ui.badge(t, '', '·'))));

  const policy = el('div', { class: 'faint', style: 'font-size:12px;margin-top:14px' },
    '원본 이미지 hash 불변 · annotation·측정은 파생 데이터 · 승인 전 값은 초안 · 모든 수치에 n과 기준 시각 · 데모 데이터는 synthetic 또는 사용 권한이 확인된 자료');

  mount(view, hero, el('div', { class: 'grid cols-2', style: 'margin-bottom:16px' }, evidence, kpis), steps,
    el('div', { style: 'margin-top:16px' }, roadmap), policy);
}
