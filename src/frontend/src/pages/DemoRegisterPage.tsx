import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type {
  FeatureExtractionResultView,
  ImageDetailView,
  ImageListView,
  SegmentationResultView,
} from "../api/types";
import { useDocumentTitle } from "../ui/useDocumentTitle";

// A stripped-down registration flow for hackathon walk-ups: instead of asking a
// stranger to upload a file and type metadata, they pick an image that is
// already in the database and watch the full auto-analysis pipeline run on it.

type StepStatus = "pending" | "running" | "done" | "failed";

const STEPS: { key: string; label: string }[] = [
  { key: "detail", label: "이미지 속성 불러오기" },
  { key: "segment", label: "세그멘테이션" },
  { key: "features", label: "자동 특징 추출" },
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

export function DemoRegisterPage() {
  useDocumentTitle("이미지 등록 데모");

  const [images, setImages] = useState<ImageListView[] | null>(null);
  const [imagesError, setImagesError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ImageDetailView | null>(null);
  const [segmentation, setSegmentation] = useState<SegmentationResultView | null>(null);
  const [features, setFeatures] = useState<FeatureExtractionResultView | null>(null);

  // How many pipeline steps have finished (0..3), whether one is in flight, and
  // any error. `reached` + `running` together drive each step's badge.
  const [reached, setReached] = useState(0);
  const [running, setRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

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

  async function analyze(image: ImageListView) {
    if (running) return;
    setSelectedId(image.id);
    setDetail(null);
    setSegmentation(null);
    setFeatures(null);
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
      setReached(2);
      // 3. Extract auto measurements from the segmentation.
      const feat = await api.extractFeatures(image.id);
      setFeatures(feat);
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

  function statusFor(index: number): StepStatus {
    if (reached >= index + 1) return "done";
    if (analysisError && reached === index) return "failed";
    if (running && reached === index) return "running";
    return "pending";
  }

  return (
    <main>
      <p className="eyebrow">Demo</p>
      <h1>이미지 등록 데모</h1>
      <p className="section-note">
        해커톤 참가자가 바로 체험할 수 있는 간단 등록 흐름입니다. 파일을 올리거나 정보를
        입력할 필요 없이, 이미 등록된 이미지 하나를 고르면 속성이 채워지고 자동 분석
        (세그멘테이션 · 특징 추출)이 그 자리에서 실행됩니다. 원본 이미지는 절대 수정하지
        않고, 결과는 모두 파생 데이터로만 저장됩니다.
      </p>

      <section aria-labelledby="demo-pick-heading">
        <h2 id="demo-pick-heading">1. 이미지 고르기</h2>
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
                disabled={running}
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

      {selectedId !== null && (
        <>
          <section className="table-panel" aria-labelledby="demo-props-heading" data-testid="demo-properties">
            <h2 id="demo-props-heading">2. 이미지 속성</h2>
            {detail ? (
              <dl className="demo-props">
                <div><dt>원본 파일명</dt><dd>{detail.original_filename}</dd></div>
                <div><dt>이미지 종류</dt><dd>{detail.image_type}</dd></div>
                <div><dt>Product ID</dt><dd>{detail.product_id}</dd></div>
                <div><dt>Lot ID</dt><dd>{detail.lot_id}</dd></div>
                <div><dt>Wafer ID</dt><dd>{detail.wafer_id}</dd></div>
                <div><dt>공정 Step</dt><dd>{detail.process_step ?? "—"}</dd></div>
                <div><dt>nm/pixel</dt><dd>{detail.calibration_nm_per_pixel}</dd></div>
                <div><dt>크기</dt><dd>{detail.pixel_width} × {detail.pixel_height} px</dd></div>
              </dl>
            ) : (
              <p role="status">이미지 속성을 불러오는 중입니다.</p>
            )}
          </section>

          <section className="table-panel segmentation-panel" aria-labelledby="demo-analysis-heading" data-testid="demo-analysis">
            <h2 id="demo-analysis-heading">3. 자동 분석</h2>
            <ol className="demo-steps" data-testid="demo-steps">
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

            {segmentation && (
              <div className="segmentation-result" data-testid="demo-segmentation">
                <dl data-testid="demo-segmentation-facts">
                  <div><dt>방법</dt><dd>{segmentation.method}</dd></div>
                  <div><dt>클래스 수</dt><dd>{segmentation.classes}</dd></div>
                  <div><dt>소요</dt><dd>{segmentation.duration_ms} ms{segmentation.downscaled ? " (다운스케일)" : ""}</dd></div>
                </dl>
                <div className="segmentation-views">
                  <figure><img src={segmentation.map_url} alt="클래스 맵" data-testid="demo-segmentation-map" /><figcaption>클래스 맵</figcaption></figure>
                  <figure><img src={segmentation.boundary_url} alt="경계 오버레이" data-testid="demo-segmentation-boundary" /><figcaption>경계 오버레이</figcaption></figure>
                </div>
              </div>
            )}

            {features && (
              <p data-testid="demo-feature-summary">
                대상 클래스 {features.target_class} · 자동 측정 {features.measurements.length}개
                {features.region_clipped ? " · 영역이 이미지 경계에 닿음" : ""}
              </p>
            )}

            {reached === 3 && !analysisError && (
              <p className="actions">
                <Link className="button primary" to={`/images/${selectedId}`} data-testid="demo-open-image">
                  측정 화면에서 자세히 보기 →
                </Link>
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
