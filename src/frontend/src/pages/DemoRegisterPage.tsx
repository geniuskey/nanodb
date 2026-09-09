import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type {
  FeatureExtractionResultView,
  ImageDetailView,
  ImageListView,
  MeasurementType,
  MeasurementView,
  SegmentationClassStat,
  SegmentationResultView,
} from "../api/types";
import { MeasurementOverlay } from "../measurement/MeasurementOverlay";
import { useDocumentTitle } from "../ui/useDocumentTitle";

// A stripped-down registration flow for hackathon walk-ups: a stranger clicks a
// photo and, without typing anything, is walked through the pipeline one tab at
// a time -- pick, watch it segment (with a class histogram), then land on the
// auto-measurement tab where length/curvature shapes draw onto the image. The
// tabs advance on their own as each stage finishes, but stay clickable so a
// viewer can step back and forth. Nothing is uploaded; the original is untouched.

type TabKey = "pick" | "segment" | "measure";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pick", label: "그림 선택" },
  { key: "segment", label: "세그멘테이션" },
  { key: "measure", label: "자동 측정" },
];

type StepStatus = "pending" | "running" | "done" | "failed";

const STEPS: { key: string; label: string }[] = [
  { key: "detail", label: "이미지 불러오기" },
  { key: "segment", label: "세그멘테이션" },
  { key: "features", label: "자동 측정" },
];

const STEP_ICON: Record<StepStatus, string> = {
  pending: "·",
  running: "⏳",
  done: "✓",
  failed: "✗",
};

const STEP_TEXT: Record<StepStatus, string> = {
  pending: "대기",
  running: "진행 중",
  done: "완료",
  failed: "실패",
};

const TYPE_LABEL: Record<MeasurementType, string> = {
  length: "길이",
  angle: "각도",
  curvature: "곡률",
};

// Class fill colours mirror the backend's segmentation palette (viridis, dark ->
// light) so a bar in the histogram reads as the same class as its patch on the
// class map. Identity is also carried by the row label and the numeric value, so
// the near-identical top two yellows are never told apart by colour alone.
const CLASS_COLORS = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725", "#f0f921"];

function classColor(index: number): string {
  return CLASS_COLORS[index % CLASS_COLORS.length];
}

/**
 * Delay between drawing one auto measurement and the next, in ms. Paced so a
 * walk-up viewer can follow each shape landing on its own instead of the set
 * arriving as one flash.
 */
const REVEAL_STAGGER_MS = 300;

/**
 * Extra dwell after segmentation returns before the pipeline moves on. The
 * derived files are often cached, so the call finishes almost instantly and the
 * step looked skipped; this holds the segmentation frame long enough to read.
 */
const SEGMENT_DWELL_MS = 200;

/**
 * How long the segmentation tab (class map + the two histograms) stays up after
 * extraction finishes before the demo advances itself to the measurement tab.
 * Held long enough to actually read the brightness thresholds and the class
 * distribution, not just glimpse them.
 */
const ADVANCE_TO_MEASURE_MS = 3600;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Size {
  width: number;
  height: number;
}

function sameSize(a: Size, b: Size): boolean {
  return a.width === b.width && a.height === b.height;
}

/** Only measurements the overlay can actually draw: 2+ placed points and a type. */
function renderable(measurements: MeasurementView[]): MeasurementView[] {
  return measurements.filter(
    (m) => Array.isArray(m.points) && m.points.length >= 2 && Boolean(m.measurement_type),
  );
}

/** Korean "길이 3 · 곡률 2" breakdown of the drawn measurements, zeros dropped. */
function typeBreakdown(measurements: MeasurementView[]): string {
  const order: MeasurementType[] = ["length", "curvature", "angle"];
  const counts = new Map<MeasurementType, number>();
  for (const m of measurements) {
    counts.set(m.measurement_type, (counts.get(m.measurement_type) ?? 0) + 1);
  }
  return order
    .filter((type) => (counts.get(type) ?? 0) > 0)
    .map((type) => `${TYPE_LABEL[type]} ${counts.get(type)}`)
    .join(" · ");
}

/**
 * The segmentation *criterion*, drawn as a histogram over pixel brightness.
 * Segmentation runs multi-Otsu on the normalised grayscale (0 dark .. 1 bright),
 * so each class is a brightness band [lo, hi]; the bar height is that band's
 * share of the image and the dashed red lines are the Otsu thresholds that cut
 * one class from the next. This is what answers "on what basis is it split?".
 */
function IntensityThresholdChart({
  stats,
  thresholds,
}: {
  stats: SegmentationClassStat[];
  thresholds: number[];
}) {
  if (stats.length === 0) return null;
  const ordered = [...stats].sort((a, b) => a.class_index - b.class_index);
  const maxFraction = Math.max(...ordered.map((s) => s.area_fraction), 0.0001);

  // Geometry in viewBox units; the <svg> scales to the panel width.
  const W = 300;
  const H = 148;
  const padX = 12;
  const top = 22; // headroom for the threshold labels
  const baseline = 118; // the brightness axis
  const plotW = W - padX * 2;
  const plotH = baseline - top;
  const x = (v: number) => padX + v * plotW;
  const gap = 2;

  const thresholdLabel = thresholds.map((t) => t.toFixed(2)).join(", ");

  return (
    <figure className="seg-intensity" data-testid="demo-intensity-histogram">
      <figcaption>밝기 히스토그램 · Otsu 임계값 기준 분할</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`픽셀 밝기(0~1)를 임계값 ${thresholdLabel}에서 ${ordered.length}개 클래스로 나눈 히스토그램`}
      >
        {ordered.map((s) => {
          const [lo, hi] = s.intensity_range;
          const bx = x(lo) + gap;
          const bw = Math.max(x(hi) - x(lo) - gap * 2, 1);
          const bh = (s.area_fraction / maxFraction) * plotH;
          return (
            <g key={s.class_index}>
              <rect
                x={bx}
                y={baseline - bh}
                width={bw}
                height={bh}
                rx={2}
                fill={classColor(s.class_index)}
              >
                <title>
                  클래스 {s.class_index} · 밝기 {lo.toFixed(2)}–{hi.toFixed(2)} ·{" "}
                  {(s.area_fraction * 100).toFixed(1)}%
                </title>
              </rect>
              <text
                x={bx + bw / 2}
                y={baseline - bh - 3}
                textAnchor="middle"
                className="seg-intensity-val"
              >
                {(s.area_fraction * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}
        <line x1={padX} y1={baseline} x2={W - padX} y2={baseline} className="seg-intensity-axis" />
        {thresholds.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} y1={top - 8} x2={x(t)} y2={baseline} className="seg-intensity-thresh" />
            <text x={x(t)} y={top - 10} textAnchor="middle" className="seg-intensity-tick">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        <text x={padX} y={baseline + 13} textAnchor="start" className="seg-intensity-tick">0.0</text>
        <text x={W - padX} y={baseline + 13} textAnchor="end" className="seg-intensity-tick">1.0</text>
        <text x={W / 2} y={H - 3} textAnchor="middle" className="seg-intensity-caption">
          픽셀 밝기 (0 어두움 → 1 밝음)
        </text>
      </svg>
    </figure>
  );
}

/** Horizontal bar chart of each class's share of the image, coloured to match the map. */
function SegmentationHistogram({ stats }: { stats: SegmentationClassStat[] }) {
  if (stats.length === 0) return null;
  const ordered = [...stats].sort((a, b) => a.class_index - b.class_index);
  return (
    <figure className="seg-histogram" data-testid="demo-segmentation-histogram">
      <figcaption>클래스별 면적 분포</figcaption>
      <ul>
        {ordered.map((stat) => {
          const percent = stat.area_fraction * 100;
          const [lo, hi] = stat.intensity_range;
          const tooltip = [
            `클래스 ${stat.class_index}`,
            `${stat.pixels.toLocaleString()} px (${percent.toFixed(1)}%)`,
            `밝기 ${lo.toFixed(2)}–${hi.toFixed(2)}`,
            stat.area_nm2 != null ? `${Math.round(stat.area_nm2).toLocaleString()} nm²` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={stat.class_index} title={tooltip} data-testid="demo-histogram-bar">
              <span className="seg-hist-label">
                <span
                  className="seg-hist-swatch"
                  style={{ background: classColor(stat.class_index) }}
                  aria-hidden="true"
                />
                클래스 {stat.class_index}
              </span>
              <span className="seg-hist-track" aria-hidden="true">
                <span
                  className="seg-hist-bar"
                  style={{
                    width: `${Math.max(percent, 1.5)}%`,
                    background: classColor(stat.class_index),
                  }}
                />
              </span>
              <span className="seg-hist-value">{percent.toFixed(1)}%</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

export function DemoRegisterPage() {
  useDocumentTitle("이미지 등록 데모");

  const [images, setImages] = useState<ImageListView[] | null>(null);
  const [imagesError, setImagesError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("pick");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ImageDetailView | null>(null);
  const [segmentation, setSegmentation] = useState<SegmentationResultView | null>(null);
  const [features, setFeatures] = useState<FeatureExtractionResultView | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementView[]>([]);

  // How many pipeline steps have finished (0..3), whether one is in flight, and
  // any error. `reached` + `running` together drive each step's badge.
  const [reached, setReached] = useState(0);
  const [running, setRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // How many of the auto measurements have been drawn so far. It climbs from 0
  // to `measurements.length` one at a time on the measurement tab, which is what
  // makes the reveal read as a sequence instead of a single paint.
  const [revealCount, setRevealCount] = useState(0);

  // The rendered (on-screen) size of the target image, so the SVG overlay lines
  // up with it as it scales to fit the stage.
  const imageRef = useRef<HTMLImageElement>(null);
  const [rendered, setRendered] = useState<Size>({ width: 0, height: 0 });

  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    let active = true;
    api
      .listImages()
      .then((value) => active && setImages(Array.isArray(value) ? value : []))
      .catch(() => active && setImagesError("이미지 목록을 불러오지 못했습니다."));
    return () => {
      active = false;
    };
  }, []);

  // Keep the overlay sized to the image as it loads and as the viewport (or the
  // active tab) changes. ResizeObserver catches the fit-scaling that a window
  // resize alone would miss, and the box growing from 0 when the measurement tab
  // becomes visible; it is guarded for the test DOM.
  useEffect(() => {
    const el = imageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const next = { width: rect.width, height: rect.height };
      setRendered((current) => (sameSize(current, next) ? current : next));
    };
    measure();
    window.addEventListener("resize", measure);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [selectedId, activeTab, segmentation, reached]);

  // Once extraction has finished, advance the demo to the measurement tab so the
  // shapes draw where the viewer is looking -- but only if they have not already
  // navigated away from the segmentation tab themselves.
  useEffect(() => {
    if (reached < 3 || analysisError || activeTab !== "segment") return;
    if (reducedMotion) {
      setActiveTab("measure");
      return;
    }
    const timer = setTimeout(() => setActiveTab("measure"), ADVANCE_TO_MEASURE_MS);
    return () => clearTimeout(timer);
  }, [reached, analysisError, activeTab, reducedMotion]);

  // Draw the auto measurements one at a time, but only while the measurement tab
  // is showing. Each tick mounts one more shape, and only the newly keyed <g>
  // replays its CSS entrance animation, so shapes already on screen stay put.
  useEffect(() => {
    if (reached < 3 || analysisError || activeTab !== "measure") return;
    if (revealCount >= measurements.length) return;
    if (reducedMotion) {
      setRevealCount(measurements.length);
      return;
    }
    const timer = setTimeout(() => setRevealCount((count) => count + 1), REVEAL_STAGGER_MS);
    return () => clearTimeout(timer);
  }, [reached, analysisError, activeTab, revealCount, measurements.length, reducedMotion]);

  async function analyze(image: ImageListView) {
    if (running) return;
    setSelectedId(image.id);
    setDetail(null);
    setSegmentation(null);
    setFeatures(null);
    setMeasurements([]);
    setRevealCount(0);
    setRendered({ width: 0, height: 0 });
    setAnalysisError(null);
    setReached(0);
    setRunning(true);
    setActiveTab("segment");
    try {
      // 1. Fill the property panel from the picked image.
      const loaded = await api.getImage(image.id);
      setDetail(loaded);
      setReached(1);
      // 2. Segment the image (derived files only; the original is untouched).
      const seg = await api.runSegmentation(image.id);
      setSegmentation(seg);
      // Let the freshly segmented frame breathe before advancing, so the step
      // registers instead of flashing past on cached derivatives.
      if (!reducedMotion) await delay(SEGMENT_DWELL_MS);
      setReached(2);
      // 3. Extract auto measurements from the segmentation.
      const feat = await api.extractFeatures(image.id);
      setFeatures(feat);
      setMeasurements(renderable(feat.measurements));
      setReached(3);
      // Reload so the property panel reflects the newly stored measurements.
      setDetail(await api.getImage(image.id));
    } catch (caught) {
      setAnalysisError(
        caught instanceof ApiError ? caught.message : "자동 분석에 실패했습니다.",
      );
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    if (running) return;
    setSelectedId(null);
    setDetail(null);
    setSegmentation(null);
    setFeatures(null);
    setMeasurements([]);
    setRevealCount(0);
    setRendered({ width: 0, height: 0 });
    setAnalysisError(null);
    setReached(0);
    setActiveTab("pick");
  }

  function replay() {
    if (running || measurements.length === 0) return;
    setRevealCount(0);
    setActiveTab("measure");
  }

  function statusFor(index: number): StepStatus {
    if (reached >= index + 1) return "done";
    if (analysisError && reached === index) return "failed";
    if (running && reached === index) return "running";
    return "pending";
  }

  const revealComplete = reached >= 3 && revealCount >= measurements.length;
  const isComplete = revealComplete && !analysisError;
  // Sweep a scan line over the image while it is being loaded or segmented, so
  // the wait itself looks like the machine working rather than a frozen frame.
  const scanning = running && reached < 2;

  function narration(): string {
    if (analysisError) return "분석 중 문제가 발생했어요.";
    if (reached === 0) return "이미지를 불러오는 중…";
    if (reached === 1) return "세그멘테이션으로 구조를 나누는 중…";
    if (reached === 2) return "자동으로 측정 위치를 찾는 중…";
    if (activeTab === "segment") {
      return "세그멘테이션을 마쳤어요. 잠시 후 자동 측정으로 넘어갑니다…";
    }
    if (revealCount < measurements.length) {
      return `측정값을 하나씩 그리는 중… (${revealCount}/${measurements.length})`;
    }
    return measurements.length > 0
      ? `자동 측정 ${measurements.length}개를 모두 그렸어요.`
      : "자동 측정을 마쳤어요.";
  }

  const canSegment = selectedId !== null;
  const canMeasure = features !== null;

  function selectTab(key: TabKey) {
    if (key === "segment" && !canSegment) return;
    if (key === "measure" && !canMeasure) return;
    setActiveTab(key);
  }

  const shown = measurements.slice(0, revealCount);

  return (
    <main className="demo-page" data-testid="demo-page">
      <header className="cinema-head">
        <div>
          <p className="eyebrow">Demo</p>
          <h1>클릭 한 번으로 보는 자동 분석</h1>
        </div>
        {selectedId !== null && (
          <div className="cinema-actions">
            {isComplete && (
              <button type="button" className="button" onClick={replay} data-testid="demo-replay">
                다시 보기
              </button>
            )}
            <button
              type="button"
              className="button"
              onClick={reset}
              disabled={running}
              data-testid="demo-restart"
            >
              다른 이미지 고르기
            </button>
          </div>
        )}
      </header>

      <div className="demo-tabbar" role="tablist" aria-label="데모 단계" data-testid="demo-tabs">
        {TABS.map((tab) => {
          const disabled =
            (tab.key === "segment" && !canSegment) || (tab.key === "measure" && !canMeasure);
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`demo-tab-${tab.key}`}
              aria-controls={`demo-panel-${tab.key}`}
              aria-selected={activeTab === tab.key}
              className={`demo-tab ${activeTab === tab.key ? "active" : ""}`}
              disabled={disabled}
              onClick={() => selectTab(tab.key)}
              data-testid={`demo-tab-${tab.key}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Pick: the grid of images to start from. ──────────────────────────── */}
      <section
        role="tabpanel"
        id="demo-panel-pick"
        aria-labelledby="demo-tab-pick"
        hidden={activeTab !== "pick"}
        className="demo-pick-panel"
      >
        <p className="section-note">
          아무것도 입력할 필요 없어요. 아래 이미지 하나를 클릭하면 세그멘테이션이 실행되고,
          자동으로 찾은 측정값이 이미지 위에 하나씩 그려집니다. 원본은 절대 수정하지 않고,
          결과는 모두 파생 데이터로만 저장됩니다.
        </p>
        {imagesError && <p role="alert">{imagesError}</p>}
        {images && images.length === 0 && !imagesError && (
          <p className="empty-state">
            등록된 이미지가 없습니다. 먼저 <Link to="/images/new">이미지 등록</Link>에서 한 장
            올려 주세요.
          </p>
        )}
        {images && images.length > 0 && (
          <div className="recent-grid" data-testid="demo-picker">
            {images.map((image) => (
              <button
                type="button"
                key={image.id}
                className="demo-pick"
                aria-pressed={selectedId === image.id}
                onClick={() => analyze(image)}
                disabled={running}
                data-testid="demo-image-option"
              >
                <img
                  src={image.file_url}
                  alt={image.original_filename}
                  width={240}
                  height={180}
                  loading="lazy"
                />
                <span className="recent-caption">
                  <span className="recent-name">{image.original_filename}</span>
                  <span className="recent-meta">
                    {image.image_type} {image.lot_id} {image.wafer_id}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Stage + side rail: shared shell for the two analysis tabs. ────────── */}
      {selectedId !== null && (
        <div className="demo-stage-body" hidden={activeTab === "pick"}>
          <div className="cinema-stage">
            <div className="cinema-frame" data-scanning={scanning || undefined}>
              {detail && (
                <img
                  ref={imageRef}
                  src={detail.file_url}
                  alt={detail.original_filename}
                  className="cinema-image"
                  data-testid="demo-cinema-image"
                  onLoad={() => {
                    const rect = imageRef.current?.getBoundingClientRect();
                    if (rect) setRendered({ width: rect.width, height: rect.height });
                  }}
                />
              )}
              {segmentation && activeTab === "segment" && (
                <img
                  src={segmentation.boundary_url}
                  alt=""
                  aria-hidden="true"
                  className="cinema-boundary"
                  data-testid="demo-cinema-boundary"
                />
              )}
              {scanning && <div className="cinema-scan" aria-hidden="true" />}
              {detail && activeTab === "measure" && rendered.width > 0 && (
                <MeasurementOverlay
                  width={rendered.width}
                  height={rendered.height}
                  original={{ width: detail.pixel_width, height: detail.pixel_height }}
                  measurements={shown}
                  selectedId={null}
                  draft={[]}
                  draftType="length"
                  showLabels
                />
              )}
            </div>
            <p className="cinema-caption" aria-live="polite" data-testid="demo-caption">
              {narration()}
            </p>
          </div>

          <aside className="cinema-side">
            <ol className="cinema-steps" data-testid="demo-steps">
              {STEPS.map((step, index) => {
                const status = statusFor(index);
                return (
                  <li
                    key={step.key}
                    className={`demo-step ${status}`}
                    data-testid={`demo-step-${step.key}`}
                  >
                    <span className="step-icon" aria-hidden="true">{STEP_ICON[status]}</span>
                    <span className="step-name">{step.label}</span>
                    <span className="step-state">{STEP_TEXT[status]}</span>
                  </li>
                );
              })}
            </ol>

            {analysisError && (
              <p role="alert" data-testid="demo-analysis-error">{analysisError}</p>
            )}

            <section className="cinema-facts" aria-labelledby="demo-props-heading" data-testid="demo-properties">
              <h2 id="demo-props-heading">이미지 속성</h2>
              {detail ? (
                <dl className="demo-props">
                  <div><dt>원본 파일명</dt><dd>{detail.original_filename}</dd></div>
                  <div><dt>이미지 종류</dt><dd>{detail.image_type}</dd></div>
                  <div><dt>Lot / Wafer</dt><dd>{detail.lot_id} / {detail.wafer_id}</dd></div>
                  <div><dt>공정 Step</dt><dd>{detail.process_step ?? "—"}</dd></div>
                  <div><dt>nm/pixel</dt><dd>{detail.calibration_nm_per_pixel}</dd></div>
                  <div><dt>크기</dt><dd>{detail.pixel_width} × {detail.pixel_height} px</dd></div>
                </dl>
              ) : (
                <p role="status">이미지 속성을 불러오는 중입니다.</p>
              )}
            </section>

            {/* Segmentation detail: class map + histogram, shown on its own tab. */}
            <section
              role="tabpanel"
              id="demo-panel-segment"
              aria-labelledby="demo-tab-segment"
              hidden={activeTab !== "segment"}
              className="cinema-seg"
              data-testid="demo-segmentation"
            >
              <h2>세그멘테이션</h2>
              {segmentation ? (
                <>
                  <figure>
                    <img src={segmentation.map_url} alt="클래스 맵" data-testid="demo-segmentation-map" />
                    <figcaption>
                      {segmentation.method} · 클래스 {segmentation.classes} · {segmentation.duration_ms} ms
                      {segmentation.downscaled ? " (다운스케일)" : ""}
                    </figcaption>
                  </figure>
                  <p className="cinema-summary">
                    픽셀 밝기를 multi-Otsu 임계값으로 나눠 {segmentation.classes}개 클래스로 분류합니다.
                  </p>
                  <IntensityThresholdChart
                    stats={segmentation.class_stats}
                    thresholds={segmentation.thresholds}
                  />
                  <SegmentationHistogram stats={segmentation.class_stats} />
                </>
              ) : (
                <p role="status">세그멘테이션을 실행하는 중입니다…</p>
              )}
            </section>

            {/* Measurement detail: what was drawn, shown on its own tab. */}
            <section
              role="tabpanel"
              id="demo-panel-measure"
              aria-labelledby="demo-tab-measure"
              hidden={activeTab !== "measure"}
              className="cinema-measure"
              data-testid="demo-measure"
            >
              <h2>자동 측정</h2>
              {features ? (
                <>
                  <p className="cinema-summary" data-testid="demo-feature-summary">
                    대상 클래스 {features.target_class} · 자동 측정 {measurements.length}개
                    {typeBreakdown(measurements) ? ` (${typeBreakdown(measurements)})` : ""}
                    {features.region_clipped ? " · 영역이 이미지 경계에 닿음" : ""}
                  </p>
                  {isComplete && (
                    <Link
                      className="button primary"
                      to={`/images/${selectedId}`}
                      data-testid="demo-open-image"
                    >
                      측정 화면에서 자세히 보기 →
                    </Link>
                  )}
                </>
              ) : (
                <p role="status">측정 위치를 찾는 중입니다…</p>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
