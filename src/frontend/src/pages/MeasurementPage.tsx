import { MouseEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type { ImageDetailView, MeasurementView, ParameterType } from "../api/types";
import { toOriginalPoint, type Point } from "../measurement/coordinates";
import { MeasurementOverlay } from "../measurement/MeasurementOverlay";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { StatusBanner } from "../ui/StatusBanner";
import { useDocumentTitle } from "../ui/useDocumentTitle";

// Fixed steps rather than free zooming: a demo operator can land on the same
// magnification twice, and every step keeps the "screen 1px = N original px"
// readout a round enough number to reason about.
const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8];

/** What a pending confirmation would delete. */
type PendingDelete = { kind: "measurement"; id: number } | { kind: "image" };

interface Size {
  width: number;
  height: number;
}

function sameSize(a: Size, b: Size): boolean {
  return a.width === b.width && a.height === b.height;
}

export function MeasurementPage() {
  const imageId = Number(useParams().imageId);
  const navigate = useNavigate();
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<ImageDetailView | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [parameter, setParameter] = useState<ParameterType>("CD");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rendered, setRendered] = useState<Size>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ label: "", note: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [coords, setCoords] = useState({ sx: "", sy: "", ex: "", ey: "" });
  const [coordError, setCoordError] = useState<string | null>(null);

  useDocumentTitle(detail?.original_filename ?? "측정");

  useEffect(() => {
    setError(null);
    api.getImage(imageId).then(setDetail).catch((caught) =>
      setError(caught instanceof ApiError ? caught.message : "이미지를 불러오지 못했습니다."),
    );
  }, [imageId, attempt]);

  // Re-measure the image and its scroll viewport whenever either can have
  // changed. Both updates bail out when the size is unchanged, so having
  // `viewport` in the dependency list cannot loop.
  useEffect(() => {
    const update = () => {
      const rect = imageRef.current?.getBoundingClientRect();
      if (rect) {
        const next = { width: rect.width, height: rect.height };
        setRendered((current) => (sameSize(current, next) ? current : next));
      }
      const box = viewportRef.current?.getBoundingClientRect();
      if (box) {
        const next = { width: box.width, height: box.height };
        setViewport((current) => (sameSize(current, next) ? current : next));
      }
    };
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, [detail, zoom, viewport.width, viewport.height]);

  if (error && !detail) {
    return (
      <main>
        <section className="empty-state">
          <h1>측정 화면을 열지 못했습니다</h1>
          <p role="alert">{error}</p>
          <div className="actions">
            <button type="button" className="button primary" data-testid="retry-detail" onClick={() => setAttempt((current) => current + 1)}>다시 시도</button>
            <Link className="button" to="/images">목록으로</Link>
          </div>
        </section>
      </main>
    );
  }
  if (!detail) return <main><p role="status">측정 화면을 불러오는 중입니다.</p></main>;

  const preview = draft.length === 2
    ? Math.hypot(draft[1].x - draft[0].x, draft[1].y - draft[0].y)
    : null;

  // Scale that makes the whole image fit the viewport at zoom 1. Never above
  // 1, so a small image is not blown up just because the panel is large.
  const fitScale = viewport.width > 0 && viewport.height > 0
    ? Math.min(
        viewport.width / detail.pixel_width,
        viewport.height / detail.pixel_height,
        1,
      )
    : 0;
  const displayWidth = fitScale > 0 ? detail.pixel_width * fitScale * zoom : 0;
  // How many original pixels one screen pixel covers right now: the accuracy
  // the user can actually point at (MEA-014).
  const originalPerScreenPx = rendered.width > 0
    ? detail.pixel_width / rendered.width
    : null;
  const zoomIndex = ZOOM_STEPS.indexOf(zoom);

  function changeZoom(step: number) {
    const next = ZOOM_STEPS[Math.min(Math.max(zoomIndex + step, 0), ZOOM_STEPS.length - 1)];
    setZoom(next);
  }

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
    setSaving(true); setError(null); setStatus(null);
    try {
      const created = await api.createMeasurement(imageId, {
        parameter_type: parameter,
        start: draft[0],
        end: draft[1],
        label: label.trim() || null,
        note: note.trim() || null,
      });
      setDetail((current) => current && ({
        ...current,
        measurements: [created, ...current.measurements],
      }));
      setSelectedId(created.id); setDraft([]); setLabel(""); setNote("");
      setStatus(`${created.label ?? created.parameter_type} ${created.value_nm.toFixed(2)}nm 측정을 저장했습니다.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "측정을 저장하지 못했습니다.");
    } finally { setSaving(false); }
  }

  /** Save the annotation of one measurement: what it is, and what was seen. */
  async function saveAnnotation(measurementId: number) {
    if (savingEdit) return;
    setSavingEdit(true); setError(null); setStatus(null);
    try {
      const updated = await api.updateMeasurementAnnotation(imageId, measurementId, {
        label: edit.label.trim() || null,
        note: edit.note.trim() || null,
      });
      setDetail((current) => current && ({
        ...current,
        measurements: current.measurements.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      }));
      setEditId(null);
      setStatus("측정 라벨과 메모를 수정했습니다.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "라벨과 메모를 수정하지 못했습니다.");
    } finally { setSavingEdit(false); }
  }

  /**
   * Build a draft from typed original coordinates (UIX-003).
   *
   * The only path to a measurement is otherwise clicking the image, which
   * leaves keyboard users with none. It doubles as the exact-pixel route when
   * the image is shown smaller than its original size.
   */
  function applyCoordinates() {
    if (!detail) return;
    const parsed = {
      sx: Number(coords.sx), sy: Number(coords.sy),
      ex: Number(coords.ex), ey: Number(coords.ey),
    };
    const values = Object.values(parsed);
    if (Object.values(coords).some((raw) => raw.trim() === "") || values.some((n) => !Number.isFinite(n))) {
      setCoordError("네 좌표를 모두 숫자로 입력해 주세요.");
      return;
    }
    const withinX = (n: number) => n >= 0 && n < detail.pixel_width;
    const withinY = (n: number) => n >= 0 && n < detail.pixel_height;
    if (!withinX(parsed.sx) || !withinX(parsed.ex) || !withinY(parsed.sy) || !withinY(parsed.ey)) {
      setCoordError(`좌표는 0 이상 X ${detail.pixel_width}, Y ${detail.pixel_height} 미만이어야 합니다.`);
      return;
    }
    if (parsed.sx === parsed.ex && parsed.sy === parsed.ey) {
      setCoordError("시작점과 끝점이 같습니다. 서로 다른 두 점을 입력해 주세요.");
      return;
    }
    setCoordError(null);
    setDraft([{ x: parsed.sx, y: parsed.sy }, { x: parsed.ex, y: parsed.ey }]);
  }

  function confirmCopy(target: PendingDelete): { title: string; body: string; label: string } {
    if (target.kind === "measurement") {
      return {
        title: "이 측정을 삭제할까요?",
        body: "되돌릴 수 없습니다. 원본 이미지와 다른 측정은 그대로 남습니다.",
        label: "측정 삭제",
      };
    }
    const measurements = detail?.measurements.length ?? 0;
    return {
      title: "이 이미지를 삭제할까요?",
      body: measurements > 0
        ? `저장된 측정 ${measurements}개가 함께 삭제됩니다. 되돌릴 수 없습니다.`
        : "되돌릴 수 없습니다.",
      label: "이미지 삭제",
    };
  }

  async function runDelete() {
    if (!pending || deleting) return;
    setDeleting(true); setError(null); setStatus(null);
    try {
      if (pending.kind === "measurement") {
        await api.deleteMeasurement(imageId, pending.id);
        setDetail((current) => current && ({
          ...current,
          measurements: current.measurements.filter((item) => item.id !== pending.id),
        }));
        setSelectedId((current) => (current === pending.id ? null : current));
        setStatus("측정을 삭제했습니다.");
      } else {
        await api.deleteImage(imageId);
        navigate("/images");
        return;
      }
      setPending(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "삭제하지 못했습니다.");
      setPending(null);
    } finally { setDeleting(false); }
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
      setStatus("Context ZIP을 내려받았습니다.");
    } catch (caught) {
      setExportError(caught instanceof ApiError ? caught.message : "Context ZIP을 다운로드하지 못했습니다.");
    } finally { setExporting(false); }
  }

  const copy = pending ? confirmCopy(pending) : null;

  return (
    <main>
      <Link to="/images">← 목록으로</Link>
      <div className="page-heading"><div><p className="eyebrow">{detail.image_type} 측정</p><h1>{detail.original_filename}</h1></div><div className="heading-actions"><p>{detail.product_id} · {detail.lot_id} · {detail.wafer_id}{detail.process_step ? ` · ${detail.process_step}` : ""}</p><button type="button" className="heading-delete" data-testid="detail-image-delete" onClick={() => setPending({ kind: "image" })}>이미지 삭제</button></div></div>
      <StatusBanner message={status} />
      <div className="measurement-layout">
        <section className="viewer-panel" aria-label="측정 이미지">
          <div className="editor-column">
            <div className="viewer-toolbar" role="toolbar" aria-label="배율">
              <button type="button" className="tool-button" aria-label="축소" data-testid="zoom-out" disabled={zoomIndex <= 0} onClick={() => changeZoom(-1)}>−</button>
              <span className="zoom-value" data-testid="zoom-level">{Math.round(zoom * 100)}%</span>
              <button type="button" className="tool-button" aria-label="확대" data-testid="zoom-in" disabled={zoomIndex >= ZOOM_STEPS.length - 1} onClick={() => changeZoom(1)}>+</button>
              <button type="button" className="tool-button" data-testid="zoom-fit" disabled={zoom === 1} onClick={() => setZoom(1)}>맞춤</button>
            </div>
            <div className="image-viewport" ref={viewportRef} tabIndex={0} aria-label="이미지 뷰어. 확대한 뒤에는 스크롤이나 방향키로 이동합니다.">
              <div className="image-stage" style={displayWidth > 0 ? { width: displayWidth } : undefined}>
                <img ref={imageRef} src={detail.file_url} alt={detail.original_filename} onClick={selectPoint} style={displayWidth > 0 ? { width: displayWidth } : undefined} onLoad={() => { const rect = imageRef.current?.getBoundingClientRect(); if (rect) setRendered({ width: rect.width, height: rect.height }); }} data-testid="measurement-image" />
                {rendered.width > 0 && <MeasurementOverlay width={rendered.width} height={rendered.height} original={{ width: detail.pixel_width, height: detail.pixel_height }} measurements={detail.measurements} selectedId={selectedId} draft={draft} />}
              </div>
            </div>
            <p className="viewer-scale" data-testid="viewer-scale">
              배율 {Math.round(zoom * 100)}%
              {originalPerScreenPx !== null && (
                <>
                  {" · "}화면 1px ≈ 원본 {originalPerScreenPx.toFixed(2)}px
                  {originalPerScreenPx > 1
                    ? " (원본 1px 단위로는 지정할 수 없습니다. 확대해 주세요.)"
                    : " (원본 1px 단위로 지정할 수 있습니다.)"}
                </>
              )}
            </p>
          </div>
        </section>
        <aside className="measurement-controls">
          <section className="image-facts" aria-labelledby="image-facts-heading">
            <h2 id="image-facts-heading">이미지 정보</h2>
            <dl data-testid="image-facts">
              <div><dt>보정값</dt><dd>{detail.calibration_nm_per_pixel} nm/pixel</dd></div>
              <div><dt>원본 크기</dt><dd>{detail.pixel_width} × {detail.pixel_height} px</dd></div>
              {detail.process_step && <div><dt>공정 Step</dt><dd data-testid="image-process-step">{detail.process_step}</dd></div>}
              <div><dt>등록</dt><dd>{new Date(detail.created_at).toLocaleString()}</dd></div>
            </dl>
          </section>
          <label>측정 항목<select value={parameter} onChange={(event) => setParameter(event.target.value as ParameterType)} data-testid="measurement-parameter"><option>CD</option><option>Depth</option><option>Thickness</option></select></label>
          <p>선택한 점: {draft.length}/2</p>
          <details className="coord-entry">
            <summary>좌표로 직접 지정</summary>
            <p className="note-hint">
              마우스 없이 측정하거나, 화면에서 집을 수 없는 원본 픽셀을 정확히 지정할 때
              사용합니다. 원본 기준 0 이상 X {detail.pixel_width}, Y {detail.pixel_height} 미만.
            </p>
            <div className="coord-grid">
              <label>시작 X<input inputMode="decimal" data-testid="coord-start-x" value={coords.sx} onChange={(e) => setCoords((c) => ({ ...c, sx: e.target.value }))} /></label>
              <label>시작 Y<input inputMode="decimal" data-testid="coord-start-y" value={coords.sy} onChange={(e) => setCoords((c) => ({ ...c, sy: e.target.value }))} /></label>
              <label>끝 X<input inputMode="decimal" data-testid="coord-end-x" value={coords.ex} onChange={(e) => setCoords((c) => ({ ...c, ex: e.target.value }))} /></label>
              <label>끝 Y<input inputMode="decimal" data-testid="coord-end-y" value={coords.ey} onChange={(e) => setCoords((c) => ({ ...c, ey: e.target.value }))} /></label>
            </div>
            {coordError && <p role="alert" data-testid="coord-error">{coordError}</p>}
            <button type="button" data-testid="coord-apply" onClick={applyCoordinates}>좌표로 지정</button>
          </details>
          {preview !== null && <p data-testid="measurement-preview">{preview.toFixed(2)}px · {(preview * detail.calibration_nm_per_pixel).toFixed(2)}nm</p>}
          {/* The label names what the line measures and is drawn beside it on
              the image; the note is the free observation about the same line. */}
          <label>측정 항목 명<input value={label} maxLength={255} placeholder="예: Gate CD" onChange={(event) => setLabel(event.target.value)} data-testid="measurement-label-input" /></label>
          <label>메모<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
          {error && <p role="alert">{error}</p>}
          <div className="actions"><button type="button" onClick={() => setDraft([])} data-testid="measurement-reset">초기화</button><button type="button" onClick={save} disabled={draft.length !== 2 || saving} data-testid="measurement-save">{saving ? "저장 중…" : "측정 저장"}</button></div>
          <h2>저장된 측정</h2>
          {detail.measurements.length === 0 ? <p>저장된 측정이 없습니다. 이미지 위에서 두 점을 선택해 첫 측정을 저장하세요.</p> : <ul className="measurement-list">{detail.measurements.map((item: MeasurementView) => (
            <li key={item.id} className="measurement-row">
              <button type="button" className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)} data-testid="saved-measurement-item"><strong>{item.label ? `${item.label} · ` : ""}{item.parameter_type} · {item.value_nm.toFixed(2)}nm</strong><span>{item.distance_px.toFixed(2)}px · {new Date(item.created_at).toLocaleString()}</span>{item.note && <span>{item.note}</span>}</button>
              <div className="measurement-row-actions">
                <button type="button" className="edit-note" onClick={() => { setEditId(item.id); setEdit({ label: item.label ?? "", note: item.note ?? "" }); }} data-testid="edit-annotation" aria-label={`${item.label ?? item.parameter_type} 측정 라벨과 메모 수정`}>라벨·메모</button>
                <button type="button" className="delete-measurement" onClick={() => setPending({ kind: "measurement", id: item.id })} data-testid="delete-measurement" aria-label={`${item.label ?? item.parameter_type} 측정 삭제`}>삭제</button>
              </div>
              {editId === item.id && (
                <div className="note-editor">
                  {/* Only the annotation is editable: coordinates, parameter,
                      value and calibration stay as measured (RES-007). */}
                  <label>
                    측정 항목 명
                    <input value={edit.label} maxLength={255} autoFocus onChange={(event) => setEdit((current) => ({ ...current, label: event.target.value }))} data-testid="label-input" />
                  </label>
                  <label>
                    메모
                    <textarea value={edit.note} onChange={(event) => setEdit((current) => ({ ...current, note: event.target.value }))} data-testid="note-input" />
                  </label>
                  <p className="note-hint">좌표·항목·값·보정값은 측정한 그대로 유지됩니다.</p>
                  <div className="actions">
                    <button type="button" onClick={() => setEditId(null)} data-testid="note-cancel">취소</button>
                    <button type="button" onClick={() => saveAnnotation(item.id)} disabled={savingEdit} data-testid="note-save">{savingEdit ? "저장 중…" : "라벨·메모 저장"}</button>
                  </div>
                </div>
              )}
            </li>
          ))}</ul>}
          <section className="export-panel" aria-labelledby="context-export-heading">
            <h2 id="context-export-heading">Context Export</h2>
            <p>포함: Product ID, Lot ID, Wafer ID, 공정 Step, 원본 파일명, 저장된 측정과 측정별 라벨·메모</p>
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
      {pending && copy && (
        <ConfirmDialog
          title={copy.title}
          body={copy.body}
          confirmLabel={copy.label}
          busy={deleting}
          onConfirm={runDelete}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  );
}
