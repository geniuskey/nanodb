import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type {
  ImageDetailView,
  MeasurementItemView,
  MeasurementType,
  MeasurementView,
} from "../api/types";
import { toOriginalPoint, type Point } from "../measurement/coordinates";
import {
  DRAW_HINT,
  POINT_COUNT,
  TYPE_LABEL,
  formatValue,
  measurementColor,
  previewValue,
} from "../measurement/geometry";
import { MeasurementOverlay } from "../measurement/MeasurementOverlay";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { StatusBanner } from "../ui/StatusBanner";
import { useDocumentTitle } from "../ui/useDocumentTitle";

// Fixed steps rather than free zooming: a demo operator can land on the same
// magnification twice, and every step keeps the "screen 1px = N original px"
// readout a round enough number to reason about.
const ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8];

const TYPES: MeasurementType[] = ["length", "angle", "curvature"];

/** What a pending confirmation would delete. */
type PendingDelete =
  | { kind: "measurement"; id: number }
  | { kind: "item"; item: MeasurementItemView }
  | { kind: "image" };

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
  const [items, setItems] = useState<MeasurementItemView[]>([]);
  // The measurement being drawn: an item fixes the type; "ad-hoc" (null item)
  // lets the operator pick a type without a per-product definition.
  const [itemId, setItemId] = useState<number | null>(null);
  const [adhocType, setAdhocType] = useState<MeasurementType>("length");
  const [draft, setDraft] = useState<Point[]>([]);
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
  // New-item form (per-product measurement item table below the image).
  const [newItem, setNewItem] = useState<{ name: string; type: MeasurementType }>({
    name: "",
    type: "length",
  });
  const [itemBusy, setItemBusy] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [editItemId, setEditItemId] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<{ name: string; type: MeasurementType }>({
    name: "",
    type: "length",
  });

  useDocumentTitle(detail?.original_filename ?? "측정");

  useEffect(() => {
    setError(null);
    api
      .getImage(imageId)
      .then(setDetail)
      .catch((caught) =>
        setError(caught instanceof ApiError ? caught.message : "이미지를 불러오지 못했습니다."),
      );
  }, [imageId, attempt]);

  // Per-product measurement items feed both the drawing selector and the table
  // below the image. Reload whenever the image (hence its product) changes.
  useEffect(() => {
    if (!detail) return;
    let active = true;
    api
      .listMeasurementItems(detail.product_id)
      .then((value) => active && setItems(value))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [detail?.product_id]);

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

  const selectedItem = items.find((item) => item.id === itemId) ?? null;
  const measurementType: MeasurementType = selectedItem
    ? selectedItem.measurement_type
    : adhocType;
  const needed = POINT_COUNT[measurementType];
  const preview =
    draft.length === needed
      ? previewValue(measurementType, draft, detail.calibration_nm_per_pixel)
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

  function resetDraft() {
    setDraft([]);
  }

  function selectItem(value: string) {
    setItemId(value === "adhoc" ? null : Number(value));
    setDraft([]);
  }

  function selectType(value: MeasurementType) {
    setAdhocType(value);
    setDraft([]);
  }

  function placePoint(event: MouseEvent<HTMLImageElement>) {
    if (!detail || draft.length >= needed) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = toOriginalPoint(
      { x: event.clientX, y: event.clientY },
      rect,
      { width: detail.pixel_width, height: detail.pixel_height },
    );
    if (point) setDraft((current) => [...current, point]);
  }

  async function save() {
    if (!detail || draft.length !== needed || saving) return;
    setSaving(true); setError(null); setStatus(null);
    try {
      const created = await api.createMeasurement(imageId, {
        measurement_type: measurementType,
        points: draft,
        item_id: itemId,
        label: selectedItem ? selectedItem.name : label.trim() || null,
        note: note.trim() || null,
      });
      setDetail((current) => current && ({
        ...current,
        measurements: [created, ...current.measurements],
      }));
      setSelectedId(created.id); setDraft([]); setLabel(""); setNote("");
      setStatus(
        `${created.label ?? TYPE_LABEL[created.measurement_type]} ${formatValue(created.value, created.unit)} 측정을 저장했습니다.`,
      );
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

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || itemBusy) return;
    const name = newItem.name.trim();
    if (!name) { setItemError("측정 항목 명을 입력해 주세요."); return; }
    setItemBusy(true); setItemError(null); setStatus(null);
    try {
      const created = await api.createMeasurementItem({
        product_id: detail.product_id,
        name,
        measurement_type: newItem.type,
      });
      setItems((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewItem({ name: "", type: newItem.type });
      setStatus(`측정 항목 '${created.name}'을(를) 추가했습니다.`);
    } catch (caught) {
      setItemError(caught instanceof ApiError ? caught.message : "측정 항목을 추가하지 못했습니다.");
    } finally { setItemBusy(false); }
  }

  async function saveItem(id: number) {
    if (itemBusy) return;
    const name = editItem.name.trim();
    if (!name) { setItemError("측정 항목 명을 입력해 주세요."); return; }
    setItemBusy(true); setItemError(null); setStatus(null);
    try {
      const updated = await api.updateMeasurementItem(id, {
        name,
        measurement_type: editItem.type,
      });
      setItems((current) =>
        current
          .map((item) => (item.id === id ? updated : item))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditItemId(null);
      setStatus(`측정 항목 '${updated.name}'을(를) 수정했습니다.`);
    } catch (caught) {
      setItemError(caught instanceof ApiError ? caught.message : "측정 항목을 수정하지 못했습니다.");
    } finally { setItemBusy(false); }
  }

  function confirmCopy(target: PendingDelete): { title: string; body: string; label: string } {
    if (target.kind === "measurement") {
      return {
        title: "이 측정을 삭제할까요?",
        body: "되돌릴 수 없습니다. 원본 이미지와 다른 측정은 그대로 남습니다.",
        label: "측정 삭제",
      };
    }
    if (target.kind === "item") {
      return {
        title: `측정 항목 '${target.item.name}'을(를) 삭제할까요?`,
        body: "이미 저장된 측정은 그대로 남고, 이 항목과의 연결만 해제됩니다.",
        label: "항목 삭제",
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
      } else if (pending.kind === "item") {
        await api.deleteMeasurementItem(pending.item.id);
        setItems((current) => current.filter((item) => item.id !== pending.item.id));
        setItemId((current) => (current === pending.item.id ? null : current));
        setStatus(`측정 항목 '${pending.item.name}'을(를) 삭제했습니다.`);
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
                <img ref={imageRef} src={detail.file_url} alt={detail.original_filename} onClick={placePoint} style={displayWidth > 0 ? { width: displayWidth } : undefined} onLoad={() => { const rect = imageRef.current?.getBoundingClientRect(); if (rect) setRendered({ width: rect.width, height: rect.height }); }} data-testid="measurement-image" />
                {rendered.width > 0 && <MeasurementOverlay width={rendered.width} height={rendered.height} original={{ width: detail.pixel_width, height: detail.pixel_height }} measurements={detail.measurements} selectedId={selectedId} draft={draft} draftType={measurementType} />}
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
          <label>측정 항목
            <select value={itemId ?? "adhoc"} onChange={(event) => selectItem(event.target.value)} data-testid="measurement-item-select">
              <option value="adhoc">직접 지정 (항목 없음)</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.name} · {TYPE_LABEL[item.measurement_type]}</option>
              ))}
            </select>
          </label>
          {selectedItem ? (
            <p data-testid="measurement-type-fixed">종류: {TYPE_LABEL[selectedItem.measurement_type]} (항목이 정함)</p>
          ) : (
            <label>측정 종류
              <select value={adhocType} onChange={(event) => selectType(event.target.value as MeasurementType)} data-testid="measurement-type-select">
                {TYPES.map((type) => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
              </select>
            </label>
          )}
          <p className="note-hint" data-testid="draw-hint">{DRAW_HINT[measurementType]}</p>
          <p>선택한 점: {draft.length}/{needed}</p>
          {preview !== null && <p data-testid="measurement-preview">{TYPE_LABEL[measurementType]} · {formatValue(preview.value, preview.unit)}</p>}
          {!selectedItem && (
            // The label names what the shape measures and is drawn beside it;
            // when an item is chosen its name is used instead.
            <label>측정 항목 명<input value={label} maxLength={255} placeholder="예: Gate CD" onChange={(event) => setLabel(event.target.value)} data-testid="measurement-label-input" /></label>
          )}
          <label>메모<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
          {error && <p role="alert">{error}</p>}
          <div className="actions"><button type="button" onClick={resetDraft} data-testid="measurement-reset">초기화</button><button type="button" onClick={save} disabled={draft.length !== needed || saving} data-testid="measurement-save">{saving ? "저장 중…" : "측정 저장"}</button></div>
        </aside>
      </div>
      <div className="measurement-tables">
        <section className="table-panel" aria-labelledby="items-heading" data-testid="measurement-items">
          <h2 id="items-heading">측정 항목 ({detail.product_id})</h2>
          <p className="note-hint">제품별 측정 항목을 관리합니다. 항목의 종류(길이/각도/곡률)가 이미지 위에서 쓰는 도구를 정합니다.</p>
          <table className="data-table items-table">
            <thead>
              <tr><th scope="col">측정 항목 명</th><th scope="col">종류</th><th scope="col">관리</th></tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={3} className="table-empty">등록된 측정 항목이 없습니다. 아래에서 추가하세요.</td></tr>
              )}
              {items.map((item) => (
                <tr key={item.id} data-testid="measurement-item-row">
                  {editItemId === item.id ? (
                    <>
                      <td><input value={editItem.name} maxLength={255} aria-label="측정 항목 명 수정" data-testid="item-edit-name" onChange={(e) => setEditItem((c) => ({ ...c, name: e.target.value }))} /></td>
                      <td>
                        <select value={editItem.type} aria-label="측정 종류 수정" data-testid="item-edit-type" onChange={(e) => setEditItem((c) => ({ ...c, type: e.target.value as MeasurementType }))}>
                          {TYPES.map((type) => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
                        </select>
                      </td>
                      <td className="table-actions">
                        <button type="button" data-testid="item-save" disabled={itemBusy} onClick={() => saveItem(item.id)}>저장</button>
                        <button type="button" data-testid="item-cancel" onClick={() => setEditItemId(null)}>취소</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{item.name}</td>
                      <td>{TYPE_LABEL[item.measurement_type]}</td>
                      <td className="table-actions">
                        <button type="button" data-testid="item-edit" onClick={() => { setEditItemId(item.id); setEditItem({ name: item.name, type: item.measurement_type }); }}>수정</button>
                        <button type="button" data-testid="item-delete" onClick={() => setPending({ kind: "item", item })}>삭제</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <form className="items-add" onSubmit={addItem}>
            <input value={newItem.name} maxLength={255} placeholder="새 측정 항목 명 (예: Gate CD)" aria-label="새 측정 항목 명" data-testid="item-new-name" onChange={(e) => setNewItem((c) => ({ ...c, name: e.target.value }))} />
            <select value={newItem.type} aria-label="새 측정 종류" data-testid="item-new-type" onChange={(e) => setNewItem((c) => ({ ...c, type: e.target.value as MeasurementType }))}>
              {TYPES.map((type) => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
            </select>
            <button type="submit" className="button" disabled={itemBusy} data-testid="item-add">항목 추가</button>
          </form>
          {itemError && <p role="alert" data-testid="item-error">{itemError}</p>}
        </section>
        <section className="table-panel" aria-labelledby="saved-heading" data-testid="saved-measurements">
          <h2 id="saved-heading">저장된 측정</h2>
          {detail.measurements.length === 0 ? (
            <p>저장된 측정이 없습니다. 항목과 종류를 고른 뒤 이미지 위에서 점을 찍어 첫 측정을 저장하세요.</p>
          ) : (
            <table className="data-table saved-table">
              <thead>
                <tr><th scope="col" className="swatch-col">색상</th><th scope="col">측정</th><th scope="col">등록</th><th scope="col">관리</th></tr>
              </thead>
              <tbody>
                {detail.measurements.map((item: MeasurementView) => {
                  const selected = selectedId === item.id;
                  return (
                    <tr key={item.id} className={selected ? "saved-row selected" : "saved-row"} aria-selected={selected} onClick={() => setSelectedId(item.id)} data-testid="saved-measurement-item">
                      <td className="swatch-col"><span className="measurement-swatch" style={{ background: measurementColor(item.id) }} aria-hidden="true" /></td>
                      <td>
                        <strong>{item.label ? `${item.label} · ` : ""}{TYPE_LABEL[item.measurement_type]} · {formatValue(item.value, item.unit)}</strong>
                        {item.note && <span className="saved-note">{item.note}</span>}
                        {editId === item.id && (
                          <div className="note-editor" onClick={(event) => event.stopPropagation()}>
                            {/* Only the annotation is editable: points, type, value and
                                calibration stay as measured (RES-007). */}
                            <label>
                              측정 항목 명
                              <input value={edit.label} maxLength={255} autoFocus onChange={(event) => setEdit((current) => ({ ...current, label: event.target.value }))} data-testid="label-input" />
                            </label>
                            <label>
                              메모
                              <textarea value={edit.note} onChange={(event) => setEdit((current) => ({ ...current, note: event.target.value }))} data-testid="note-input" />
                            </label>
                            <p className="note-hint">점·종류·값·보정값은 측정한 그대로 유지됩니다.</p>
                            <div className="actions">
                              <button type="button" onClick={() => setEditId(null)} data-testid="note-cancel">취소</button>
                              <button type="button" onClick={() => saveAnnotation(item.id)} disabled={savingEdit} data-testid="note-save">{savingEdit ? "저장 중…" : "라벨·메모 저장"}</button>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="saved-time">{new Date(item.created_at).toLocaleString()}</td>
                      <td className="table-actions">
                        <button type="button" className="edit-note" onClick={(event) => { event.stopPropagation(); setEditId(item.id); setEdit({ label: item.label ?? "", note: item.note ?? "" }); }} data-testid="edit-annotation" aria-label={`${item.label ?? TYPE_LABEL[item.measurement_type]} 측정 라벨과 메모 수정`}>라벨·메모</button>
                        <button type="button" className="delete-measurement" onClick={(event) => { event.stopPropagation(); setPending({ kind: "measurement", id: item.id }); }} data-testid="delete-measurement" aria-label={`${item.label ?? TYPE_LABEL[item.measurement_type]} 측정 삭제`}>삭제</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <section className="export-panel table-panel" aria-labelledby="context-export-heading">
        <h2 id="context-export-heading">Context Export</h2>
        <p>포함: Product ID, Lot ID, Wafer ID, 공정 Step, 원본 파일명, 저장된 측정과 측정별 라벨·메모</p>
        <p>제외: 이미지 바이너리</p>
        <p>다운로드한 ZIP은 사용자가 외부 AI 도구에 수동으로 전달합니다. NANoDB가 자동으로 외부에 전송하지 않습니다.</p>
        {detail.measurements.length === 0 && <p data-testid="context-export-disabled-reason">저장된 측정이 하나 이상 있어야 내보낼 수 있습니다.</p>}
        {exportError && <p role="alert">{exportError}</p>}
        <button type="button" className="button" onClick={exportContext} disabled={detail.measurements.length === 0 || exporting} data-testid="context-export-button">
          {exporting ? "ZIP 생성 중…" : "Context ZIP 다운로드"}
        </button>
      </section>
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
