import { MouseEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type {
  ImageDetailView,
  MeasurementView,
  ParameterType,
} from "../api/types";
import { toOriginalPoint, type Point } from "../measurement/coordinates";
import { MeasurementOverlay } from "../measurement/MeasurementOverlay";

export function MeasurementPage() {
  const imageId = Number(useParams().imageId);
  const imageRef = useRef<HTMLImageElement>(null);
  const [detail, setDetail] = useState<ImageDetailView | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [parameter, setParameter] = useState<ParameterType>("CD");
  const [note, setNote] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rendered, setRendered] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    api.getImage(imageId).then(setDetail).catch((caught) =>
      setError(caught instanceof ApiError ? caught.message : "이미지를 불러오지 못했습니다."),
    );
  }, [imageId]);

  useEffect(() => {
    const update = () => {
      const rect = imageRef.current?.getBoundingClientRect();
      if (rect) setRendered({ width: rect.width, height: rect.height });
    };
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, [detail]);

  if (error && !detail) return <main><p role="alert">{error}</p><Link to="/images">목록으로</Link></main>;
  if (!detail) return <main><p role="status">측정 화면을 불러오는 중입니다.</p></main>;

  const preview = draft.length === 2
    ? Math.hypot(draft[1].x - draft[0].x, draft[1].y - draft[0].y)
    : null;

  function selectPoint(event: MouseEvent<HTMLImageElement>) {
    if (!detail || draft.length === 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = toOriginalPoint(
      { x: event.clientX, y: event.clientY },
      rect,
      { width: detail.pixel_width, height: detail.pixel_height },
    );
    if (point) setDraft((current) => [...current, point]);
  }

  async function save() {
    if (draft.length !== 2 || saving) return;
    setSaving(true); setError(null);
    try {
      const created = await api.createMeasurement(imageId, {
        parameter_type: parameter,
        start: draft[0],
        end: draft[1],
        note: note.trim() || null,
      });
      setDetail((current) => current && ({
        ...current,
        measurements: [created, ...current.measurements],
      }));
      setSelectedId(created.id); setDraft([]); setNote("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "측정을 저장하지 못했습니다.");
    } finally { setSaving(false); }
  }

  async function exportContext() {
    if (!detail || detail.measurements.length === 0 || exporting) return;
    setExporting(true); setExportError(null);
    try {
      const archive = await api.downloadContext(imageId);
      const url = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nanodb-image-${imageId}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setExportError(caught instanceof ApiError ? caught.message : "Context ZIP을 다운로드하지 못했습니다.");
    } finally { setExporting(false); }
  }

  return (
    <main>
      <Link to="/images">← 목록으로</Link>
      <div className="page-heading"><div><p className="eyebrow">{detail.image_type} measurement</p><h1>{detail.original_filename}</h1></div><p>{detail.product_id} · {detail.lot_id} · {detail.wafer_id}</p></div>
      <div className="measurement-layout">
        <section className="viewer-panel" aria-label="두 점 측정 이미지">
          <div className="image-stage">
            <img ref={imageRef} src={detail.file_url} alt={detail.original_filename} onClick={selectPoint} onLoad={() => { const rect = imageRef.current?.getBoundingClientRect(); if (rect) setRendered({ width: rect.width, height: rect.height }); }} data-testid="measurement-image" />
            {rendered.width > 0 && <MeasurementOverlay width={rendered.width} height={rendered.height} original={{ width: detail.pixel_width, height: detail.pixel_height }} measurements={detail.measurements} selectedId={selectedId} draft={draft} />}
          </div>
        </section>
        <aside className="measurement-controls">
          <label>측정 항목<select value={parameter} onChange={(event) => setParameter(event.target.value as ParameterType)} data-testid="measurement-parameter"><option>CD</option><option>Depth</option><option>Thickness</option></select></label>
          <p>선택한 점: {draft.length}/2</p>
          {preview !== null && <p data-testid="measurement-preview">{preview.toFixed(2)}px · {(preview * detail.calibration_nm_per_pixel).toFixed(2)}nm</p>}
          <label>메모<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
          {error && <p role="alert">{error}</p>}
          <div className="actions"><button type="button" onClick={() => setDraft([])} data-testid="measurement-reset">초기화</button><button type="button" onClick={save} disabled={draft.length !== 2 || saving} data-testid="measurement-save">{saving ? "저장 중…" : "측정 저장"}</button></div>
          <h2>저장된 측정</h2>
          {detail.measurements.length === 0 ? <p>저장된 측정이 없습니다.</p> : <ul className="measurement-list">{detail.measurements.map((item: MeasurementView) => <li key={item.id}><button type="button" className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)} data-testid="saved-measurement-item"><strong>{item.parameter_type} · {item.value_nm.toFixed(2)}nm</strong><span>{item.distance_px.toFixed(2)}px · {new Date(item.created_at).toLocaleString()}</span>{item.note && <span>{item.note}</span>}</button></li>)}</ul>}
          <section className="export-panel" aria-labelledby="context-export-heading">
            <h2 id="context-export-heading">Context Export</h2>
            <p>포함: Product ID, Lot ID, Wafer ID, 원본 파일명, 저장된 측정과 메모</p>
            <p>제외: 이미지 바이너리</p>
            <p>다운로드한 ZIP은 사용자가 외부 AI 도구에 수동으로 전달합니다. NANoDB가 자동으로 외부에 전송하지 않습니다.</p>
            {detail.measurements.length === 0 && <p data-testid="context-export-disabled-reason">저장된 측정이 하나 이상 있어야 내보낼 수 있습니다.</p>}
            {exportError && <p role="alert">{exportError}</p>}
            <button type="button" onClick={exportContext} disabled={detail.measurements.length === 0 || exporting} data-testid="context-export-button">
              {exporting ? "ZIP 생성 중…" : "Context ZIP 다운로드"}
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}
