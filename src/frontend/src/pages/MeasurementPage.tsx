import {
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type {
  AnnotationView,
  ImageDetailView,
  MeasurementView,
  ParameterType,
  ProductType,
  ShapeKind,
} from "../api/types";
import { AnnotationLayer, type DraftShape } from "../measurement/AnnotationLayer";
import {
  toOriginalPoint,
  toOriginalPointClamped,
  type Point,
} from "../measurement/coordinates";
import { MeasurementOverlay } from "../measurement/MeasurementOverlay";

const PRODUCTS: ProductType[] = ["DRAM", "Flash", "Logic", "Sensor"];

export function MeasurementPage() {
  const imageId = Number(useParams().imageId);
  const navigate = useNavigate();
  const imageRef = useRef<HTMLImageElement>(null);
  const [detail, setDetail] = useState<ImageDetailView | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [parameter, setParameter] = useState<ParameterType>("CD");
  const [note, setNote] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rendered, setRendered] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingImage, setDeletingImage] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationView[]>([]);
  const [tool, setTool] = useState<ShapeKind | null>(null);
  const [draftShape, setDraftShape] = useState<DraftShape | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<number | null>(null);
  const [annotationError, setAnnotationError] = useState<string | null>(null);

  useEffect(() => {
    api.getImage(imageId).then((loaded) => {
      setDetail(loaded);
      setAnnotations(loaded.annotations ?? []);
    }).catch((caught) =>
      setError(caught instanceof ApiError ? caught.message : "이미지를 불러오지 못했습니다."),
    );
  }, [imageId]);

  useEffect(() => {
    if (!draftShape) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDraftShape(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [draftShape]);

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

  function originalSize() {
    return { width: detail!.pixel_width, height: detail!.pixel_height };
  }

  function startDraw(event: ReactPointerEvent<SVGSVGElement>) {
    if (!tool) return;
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect) return;
    // A new shape must start inside the image; ignore presses in the margin.
    const start = toOriginalPoint({ x: event.clientX, y: event.clientY }, rect, originalSize());
    if (!start) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraftShape({ kind: tool, start, end: start });
  }

  function moveDraw(event: ReactPointerEvent<SVGSVGElement>) {
    if (!draftShape) return;
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Clamp the drag to the image so a shape never escapes its bounds.
    const end = toOriginalPointClamped({ x: event.clientX, y: event.clientY }, rect, originalSize());
    if (end) setDraftShape((current) => current && { ...current, end });
  }

  async function endDraw() {
    const shape = draftShape;
    if (!shape) return;
    setDraftShape(null);
    // A click without a drag (zero-size shape) does not create a row.
    if (shape.start.x === shape.end.x && shape.start.y === shape.end.y) return;
    setAnnotationError(null);
    try {
      const created = await api.createAnnotation(imageId, {
        kind: shape.kind,
        start: shape.start,
        end: shape.end,
        product: null,
        step: "",
        measurement_name: "",
      });
      setAnnotations((current) => [...current, created]);
    } catch (caught) {
      setAnnotationError(
        caught instanceof ApiError ? caught.message : "도형을 저장하지 못했습니다.",
      );
    }
  }

  function editRow(id: number, changes: Partial<AnnotationView>) {
    setAnnotations((current) =>
      current.map((row) => (row.id === id ? { ...row, ...changes } : row)),
    );
  }

  function persistRow(row: AnnotationView) {
    api
      .updateAnnotation(imageId, row.id, {
        product: row.product,
        step: row.step,
        measurement_name: row.measurement_name,
      })
      .then((updated) =>
        setAnnotations((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        ),
      )
      .catch((caught) =>
        setAnnotationError(
          caught instanceof ApiError ? caught.message : "입력값을 저장하지 못했습니다.",
        ),
      );
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

  async function removeMeasurement(id: number) {
    if (deletingId !== null) return;
    if (!window.confirm("이 측정을 삭제할까요? 되돌릴 수 없습니다. 원본 이미지는 그대로 남습니다.")) return;
    setDeletingId(id); setError(null);
    try {
      await api.deleteMeasurement(imageId, id);
      setDetail((current) => current && ({
        ...current,
        measurements: current.measurements.filter((item) => item.id !== id),
      }));
      setSelectedId((current) => (current === id ? null : current));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "측정을 삭제하지 못했습니다.");
    } finally { setDeletingId(null); }
  }

  async function removeImage() {
    if (!detail || deletingImage) return;
    const count = detail.measurements.length;
    const warning = count > 0
      ? `이 이미지와 저장된 측정 ${count}개를 함께 삭제합니다. 되돌릴 수 없습니다.`
      : "이 이미지를 삭제합니다. 되돌릴 수 없습니다.";
    if (!window.confirm(warning)) return;
    setDeletingImage(true); setError(null);
    try {
      await api.deleteImage(imageId);
      navigate("/images");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "이미지를 삭제하지 못했습니다.");
      setDeletingImage(false);
    }
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
      <div className="page-heading"><div><p className="eyebrow">{detail.image_type} 측정·라벨링</p><h1>{detail.original_filename}</h1></div><div className="heading-actions"><p>{detail.product_id} · {detail.lot_id} · {detail.wafer_id}</p><button type="button" className="heading-delete" data-testid="detail-image-delete" disabled={deletingImage} onClick={removeImage}>{deletingImage ? "삭제 중…" : "이미지 삭제"}</button></div></div>
      <div className="measurement-layout">
        <section className="viewer-panel" aria-label="측정·라벨링 이미지">
          <div className="editor-column">
            <div className="annotation-toolbar" role="toolbar" aria-label="도형 도구">
              <button type="button" className={tool === "arrow" ? "tool-button active" : "tool-button"} aria-pressed={tool === "arrow"} aria-label="화살표 그리기 도구" data-testid="tool-arrow" onClick={() => setTool((current) => (current === "arrow" ? null : "arrow"))}>↗ 화살표</button>
              <button type="button" className={tool === "circle" ? "tool-button active" : "tool-button"} aria-pressed={tool === "circle"} aria-label="원 그리기 도구" data-testid="tool-circle" onClick={() => setTool((current) => (current === "circle" ? null : "circle"))}>○ 원</button>
            </div>
            <div className="image-stage">
              <img ref={imageRef} src={detail.file_url} alt={detail.original_filename} onClick={selectPoint} onLoad={() => { const rect = imageRef.current?.getBoundingClientRect(); if (rect) setRendered({ width: rect.width, height: rect.height }); }} data-testid="measurement-image" />
              {rendered.width > 0 && <MeasurementOverlay width={rendered.width} height={rendered.height} original={{ width: detail.pixel_width, height: detail.pixel_height }} measurements={detail.measurements} selectedId={selectedId} draft={draft} />}
              {rendered.width > 0 && <AnnotationLayer width={rendered.width} height={rendered.height} original={{ width: detail.pixel_width, height: detail.pixel_height }} annotations={annotations} draft={draftShape} interactive={tool !== null} selectedId={activeAnnotationId} onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={endDraw} />}
            </div>
          </div>
        </section>
        <aside className="measurement-controls">
          <section className="annotation-panel" aria-label="도형별 측정 항목">
            <h2>도형 라벨링</h2>
            {annotationError && <p role="alert">{annotationError}</p>}
            {annotations.length === 0 ? (
              <p data-testid="annotation-empty">화살표 또는 원을 그리면 도형마다 표에 행이 하나씩 추가됩니다.</p>
            ) : (
              <table className="annotation-table">
                <thead><tr><th scope="col">#</th><th scope="col">제품</th><th scope="col">Step</th><th scope="col">측정 항목 명</th></tr></thead>
                <tbody>
                  {annotations.map((row, index) => (
                    <tr key={row.id} data-testid="annotation-row" className={row.id === activeAnnotationId ? "active" : ""} onFocus={() => setActiveAnnotationId(row.id)} onBlur={() => setActiveAnnotationId(null)}>
                      <td className="annotation-index">{index + 1}</td>
                      <td>
                        <select aria-label={`도형 ${index + 1} 제품`} data-testid="annotation-product" value={row.product ?? ""} onChange={(event) => { const product = (event.target.value || null) as ProductType | null; editRow(row.id, { product }); persistRow({ ...row, product }); }}>
                          <option value="">선택</option>
                          {PRODUCTS.map((product) => <option key={product} value={product}>{product}</option>)}
                        </select>
                      </td>
                      <td><input aria-label={`도형 ${index + 1} Step`} data-testid="annotation-step" value={row.step} onChange={(event) => editRow(row.id, { step: event.target.value })} onBlur={() => persistRow(row)} /></td>
                      <td><input aria-label={`도형 ${index + 1} 측정 항목 명`} data-testid="annotation-name" value={row.measurement_name} onChange={(event) => editRow(row.id, { measurement_name: event.target.value })} onBlur={() => persistRow(row)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <label>측정 항목<select value={parameter} onChange={(event) => setParameter(event.target.value as ParameterType)} data-testid="measurement-parameter"><option>CD</option><option>Depth</option><option>Thickness</option></select></label>
          <p>선택한 점: {draft.length}/2</p>
          {preview !== null && <p data-testid="measurement-preview">{preview.toFixed(2)}px · {(preview * detail.calibration_nm_per_pixel).toFixed(2)}nm</p>}
          <label>메모<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
          {error && <p role="alert">{error}</p>}
          <div className="actions"><button type="button" onClick={() => setDraft([])} data-testid="measurement-reset">초기화</button><button type="button" onClick={save} disabled={draft.length !== 2 || saving} data-testid="measurement-save">{saving ? "저장 중…" : "측정 저장"}</button></div>
          <h2>저장된 측정</h2>
          {detail.measurements.length === 0 ? <p>저장된 측정이 없습니다.</p> : <ul className="measurement-list">{detail.measurements.map((item: MeasurementView) => <li key={item.id} className="measurement-row"><button type="button" className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)} data-testid="saved-measurement-item"><strong>{item.parameter_type} · {item.value_nm.toFixed(2)}nm</strong><span>{item.distance_px.toFixed(2)}px · {new Date(item.created_at).toLocaleString()}</span>{item.note && <span>{item.note}</span>}</button><button type="button" className="delete-measurement" onClick={() => removeMeasurement(item.id)} disabled={deletingId === item.id} data-testid="delete-measurement" aria-label={`${item.parameter_type} 측정 삭제`}>{deletingId === item.id ? "삭제 중…" : "삭제"}</button></li>)}</ul>}
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
