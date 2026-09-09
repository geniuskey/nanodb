import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type {
  FeatureExtractionResultView,
  ImageDetailView,
  ImageListView,
  MeasurementView,
  SegmentationResultView,
} from "../api/types";
import { MeasurementOverlay } from "../measurement/MeasurementOverlay";
import { useDocumentTitle } from "../ui/useDocumentTitle";

// A stripped-down registration flow for hackathon walk-ups: a stranger clicks a
// photo and, without scrolling, watches the whole pipeline play out on it like a
// short intro clip -- segmentation, then each auto measurement drawn on one at a
// time. Nothing has to be uploaded, typed, or read first.

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

export function DemoRegisterPage() {
  useDocumentTitle("이미지 등록 데모");

  const [images, setImages] = useState<ImageListView[] | null>(null);
  const [imagesError, setImagesError] = useState<string | null>(null);

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
  // to `measurements.length` one at a time, which is what makes the reveal read
  // as a sequence instead of a single paint.
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
  // side panel's layout) changes. ResizeObserver catches the fit-scaling that a
  // window resize alone would miss; it is guarded for the test DOM.
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
  }, [selectedId, segmentation, reached]);

  // Draw the auto measurements one at a time once extraction has finished. Each
  // tick mounts one more shape, and only the newly keyed <g> replays its CSS
  // entrance animation, so shapes already on screen stay put.
  useEffect(() => {
    if (reached < 3 || analysisError) return;
    if (revealCount >= measurements.length) return;
    if (reducedMotion) {
      setRevealCount(measurements.length);
      return;
    }
    const timer = setTimeout(() => setRevealCount((count) => count + 1), REVEAL_STAGGER_MS);
    return () => clearTimeout(timer);
  }, [reached, analysisError, revealCount, measurements.length, reducedMotion]);

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
  }

  function replay() {
    if (running || measurements.length === 0) return;
    setRevealCount(0);
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
    if (revealCount < measurements.length) {
      return `측정값을 하나씩 그리는 중… (${revealCount}/${measurements.length})`;
    }
    return measurements.length > 0
      ? `자동 측정 ${measurements.length}개를 모두 그렸어요.`
      : "자동 측정을 마쳤어요.";
  }

  // ── Picker: the whole screen until a photo is clicked. ──────────────────────
  if (selectedId === null) {
    return (
      <main className="demo-picker-page">
        <p className="eyebrow">Demo</p>
        <h1>사진을 클릭하면 분석이 시작됩니다</h1>
        <p className="section-note">
          아무것도 입력할 필요 없어요. 아래 이미지 하나를 클릭하면 세그멘테이션이 실행되고,
          자동으로 찾은 측정값이 이미지 위에 하나씩 그려집니다. 원본은 절대 수정하지 않고,
          결과는 모두 파생 데이터로만 저장됩니다.
        </p>

        <section aria-labelledby="demo-pick-heading">
          <h2 id="demo-pick-heading" className="visually-hidden">이미지 고르기</h2>
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
                  onClick={() => analyze(image)}
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
      </main>
    );
  }

  // ── Cinema: a single, scroll-free stage that plays the pipeline out. ────────
  const shown = measurements.slice(0, revealCount);

  return (
    <main className="demo-cinema" data-testid="demo-cinema">
      <header className="cinema-head">
        <div>
          <p className="eyebrow">Demo</p>
          <h1>클릭 한 번으로 보는 자동 분석</h1>
        </div>
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
      </header>

      <div className="cinema-body">
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
            {segmentation && (
              <img
                src={segmentation.boundary_url}
                alt=""
                aria-hidden="true"
                className="cinema-boundary"
                data-testid="demo-cinema-boundary"
              />
            )}
            {scanning && <div className="cinema-scan" aria-hidden="true" />}
            {detail && rendered.width > 0 && (
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
                <li key={step.key} className={`demo-step ${status}`} data-testid={`demo-step-${step.key}`}>
                  <span className="step-icon" aria-hidden="true">{STEP_ICON[status]}</span>
                  <span className="step-name">{step.label}</span>
                  <span className="step-state">{STEP_TEXT[status]}</span>
                </li>
              );
            })}
          </ol>

          {analysisError && <p role="alert" data-testid="demo-analysis-error">{analysisError}</p>}

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

          {segmentation && (
            <section className="cinema-seg" data-testid="demo-segmentation">
              <h2>세그멘테이션</h2>
              <figure>
                <img src={segmentation.map_url} alt="클래스 맵" data-testid="demo-segmentation-map" />
                <figcaption>
                  {segmentation.method} · 클래스 {segmentation.classes} · {segmentation.duration_ms} ms
                  {segmentation.downscaled ? " (다운스케일)" : ""}
                </figcaption>
              </figure>
            </section>
          )}

          {features && (
            <p className="cinema-summary" data-testid="demo-feature-summary">
              대상 클래스 {features.target_class} · 자동 측정 {features.measurements.length}개
              {features.region_clipped ? " · 영역이 이미지 경계에 닿음" : ""}
            </p>
          )}

          {isComplete && (
            <Link className="button primary" to={`/images/${selectedId}`} data-testid="demo-open-image">
              측정 화면에서 자세히 보기 →
            </Link>
          )}
        </aside>
      </div>
    </main>
  );
}
