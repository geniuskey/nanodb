import {
  FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type {
  FeatureExtractionResultView,
  ImageDetailView,
  MeasurementItemView,
  MeasurementType,
  MeasurementView,
  SegmentationResultView,
} from "../api/types";
import {
  toOriginalPoint,
  toOriginalPointClamped,
  type Point,
} from "../measurement/coordinates";
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
  // How much of the overlay to draw. Auto feature extraction puts up to six
  // shapes on one structure, so being able to strip the image back to the one
  // measurement under discussion is part of reading the result at all.
  const [showShapes, setShowShapes] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [onlySelected, setOnlySelected] = useState(false);
  // Correcting a saved measurement. Automatic extraction is not exact and a
  // hand-placed point can miss, so the points can be dragged; `adjustPoints` is
  // the working copy, and nothing is written until it is saved.
  const [adjustId, setAdjustId] = useState<number | null>(null);
  const [adjustPoints, setAdjustPoints] = useState<Point[] | null>(null);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);
  // Which handle a pointer is dragging, on a saved measurement or on the draft.
  const [dragging, setDragging] = useState<{ kind: "adjust" | "draft"; index: number } | null>(null);
  // Pointer position while drawing, so the shape follows the cursor.
  const [cursor, setCursor] = useState<Point | null>(null);
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
  // Segmentation + auto feature extraction (Unit C). Auto measurements are
  // stored and shown as distinct from manual ones and are never presented as
  // human-verified.
  const [segmentation, setSegmentation] = useState<SegmentationResultView | null>(null);
  const [segRunning, setSegRunning] = useState(false);
  const [segError, setSegError] = useState<string | null>(null);
  const [featRunning, setFeatRunning] = useState(false);
  const [featSummary, setFeatSummary] = useState<FeatureExtractionResultView | null>(null);

  // Identify the image in the tab by its manufacturing context rather than the
  // raw filename, e.g. "[TEM] P1·L1·W1·Gate Etch".
  useDocumentTitle(
    detail
      ? `[${detail.image_type}] ${[
          detail.product_id,
          detail.lot_id,
          detail.wafer_id,
          detail.process_step,
        ]
          .filter(Boolean)
          .join("·")}`
      : "측정",
  );

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

  // Load any existing segmentation for this image. "Not found" is the normal
  // "not yet run" state, not an error.
  useEffect(() => {
    let active = true;
    setSegError(null);
    api
      .getSegmentation(imageId)
      .then((value) => active && setSegmentation(value))
      .catch((caught) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.code === "SEGMENTATION_NOT_FOUND") {
          setSegmentation(null);
        } else {
          setSegError(
            caught instanceof ApiError
              ? caught.message
              : "세그멘테이션 정보를 불러오지 못했습니다.",
          );
        }
      });
    return () => {
      active = false;
    };
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

  // A drag is tracked on the window, not on the handle: the pointer routinely
  // leaves the image mid-gesture, and the handle has to keep following it.
  useEffect(() => {
    if (!dragging || !detail) return;
    const originalSize = { width: detail.pixel_width, height: detail.pixel_height };
    const move = (event: PointerEvent) => {
      const rect = imageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const point = toOriginalPointClamped(
        { x: event.clientX, y: event.clientY },
        rect,
        originalSize,
      );
      if (!point) return;
      const replace = (points: Point[]) =>
        points.map((current, index) => (index === dragging.index ? point : current));
      if (dragging.kind === "adjust") {
        setAdjustPoints((current) => (current ? replace(current) : current));
      } else {
        setDraft(replace);
      }
    };
    const end = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragging, detail]);

  // Escape backs out of whatever is in progress, innermost first: a correction
  // that has not been saved, then a drawing that has not been finished.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (adjustId !== null) {
        setAdjustId(null);
        setAdjustPoints(null);
        setActiveHandle(null);
      } else if (draft.length > 0) {
        setDraft([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [adjustId, draft.length]);

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
  const adjusting =
    adjustId !== null
      ? detail.measurements.find((item) => item.id === adjustId) ?? null
      : null;
  // Client-side preview of the correction, mirroring the server formulas, so
  // the operator sees what a nudge is worth before committing to it. Null when
  // the dragged points are degenerate -- the server would refuse them too.
  const adjustPreview =
    adjusting && adjustPoints
      ? previewValue(
          adjusting.measurement_type,
          adjustPoints,
          adjusting.calibration_nm_per_pixel,
        )
      : null;
  const adjustDelta =
    adjusting && adjustPreview ? adjustPreview.value - adjusting.value : null;
  const adjustMoved = Boolean(
    adjusting &&
      adjustPoints &&
      adjustPoints.some(
        (point, index) =>
          point.x !== adjusting.points[index]?.x ||
          point.y !== adjusting.points[index]?.y,
      ),
  );

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

  function undoPoint() {
    setDraft((current) => current.slice(0, -1));
  }

  function selectItem(value: string) {
    setItemId(value === "adhoc" ? null : Number(value));
    setDraft([]);
  }

  function selectType(value: MeasurementType) {
    setAdhocType(value);
    setDraft([]);
  }

  /**
   * Measurements as they read right now: the working copy while one is being
   * corrected, carrying the previewed value as well as the moved points, so the
   * caption on the image counts along with the drag instead of showing the
   * value that is about to be replaced.
   */
  function shownMeasurements(): MeasurementView[] {
    if (!detail) return [];
    if (adjustId === null || !adjustPoints) return detail.measurements;
    return detail.measurements.map((item) =>
      item.id === adjustId
        ? {
            ...item,
            points: adjustPoints,
            value: adjustPreview ? adjustPreview.value : item.value,
          }
        : item,
    );
  }

  function startAdjust(item: MeasurementView) {
    setAdjustId(item.id);
    setAdjustPoints(item.points.map((point) => ({ ...point })));
    setSelectedId(item.id);
    setActiveHandle(null);
    setDraft([]);
    setError(null);
    setStatus(null);
  }

  function cancelAdjust() {
    setAdjustId(null);
    setAdjustPoints(null);
    setActiveHandle(null);
  }

  function moveHandle(index: number, delta: Point) {
    if (!detail) return;
    const apply = (points: Point[]) =>
      points.map((point, current) =>
        current === index
          ? {
              // A nudge cannot push a point off the image: the server would
              // reject the whole correction over one out-of-bounds pixel.
              x: Math.min(Math.max(point.x + delta.x, 0), detail.pixel_width - 1),
              y: Math.min(Math.max(point.y + delta.y, 0), detail.pixel_height - 1),
            }
          : point,
      );
    if (adjustId !== null) {
      setAdjustPoints((current) => (current ? apply(current) : current));
    } else {
      setDraft(apply);
    }
  }

  /**
   * Arrow keys nudge the focused point by one original pixel, or ten with
   * Shift. At the zoom where a correction matters, one pixel is smaller than
   * the shake in a hand, so dragging alone cannot place a point exactly.
   */
  function handleKeyDown(index: number, event: ReactKeyboardEvent<SVGCircleElement>) {
    const step = event.shiftKey ? 10 : 1;
    const deltas: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    setActiveHandle(index);
    moveHandle(index, delta);
  }

  function beginDrag(kind: "adjust" | "draft", index: number, event: ReactPointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    setActiveHandle(index);
    setDragging({ kind, index });
  }

  async function saveAdjust() {
    if (!detail || adjustId === null || !adjustPoints || adjustBusy) return;
    setAdjustBusy(true); setError(null); setStatus(null);
    try {
      const updated = await api.updateMeasurementGeometry(imageId, adjustId, {
        points: adjustPoints,
      });
      setDetail((current) => current && ({
        ...current,
        measurements: current.measurements.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      }));
      cancelAdjust();
      setStatus(
        `${updated.label ?? TYPE_LABEL[updated.measurement_type]} 측정을 ${formatValue(updated.value, updated.unit)}(으)로 보정했습니다.`,
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "측정을 보정하지 못했습니다.");
    } finally { setAdjustBusy(false); }
  }

  async function revertAdjust(measurementId: number) {
    if (adjustBusy) return;
    setAdjustBusy(true); setError(null); setStatus(null);
    try {
      const updated = await api.revertMeasurementGeometry(imageId, measurementId);
      setDetail((current) => current && ({
        ...current,
        measurements: current.measurements.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      }));
      if (adjustId === measurementId) {
        setAdjustPoints(updated.points.map((point) => ({ ...point })));
      }
      setStatus("보정을 되돌려 처음 측정값으로 복원했습니다.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "보정을 되돌리지 못했습니다.");
    } finally { setAdjustBusy(false); }
  }

  /** Follow the pointer while drawing so the shape previews before it is placed. */
  function trackCursor(event: MouseEvent<HTMLImageElement>) {
    if (!detail || adjustId !== null || draft.length >= needed) {
      if (cursor !== null) setCursor(null);
      return;
    }
    const point = toOriginalPoint(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
      { width: detail.pixel_width, height: detail.pixel_height },
    );
    setCursor(point);
  }

  function placePoint(event: MouseEvent<HTMLImageElement>) {
    // While a saved measurement is being corrected the image is the correction
    // surface, not a drawing surface: a stray click must not start a new draft.
    if (adjustId !== null) return;
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

  async function runSegmentation() {
    if (segRunning) return;
    setSegRunning(true); setSegError(null); setStatus(null);
    try {
      const result = await api.runSegmentation(imageId);
      setSegmentation(result);
      setStatus(
        result.replaced
          ? "세그멘테이션을 다시 실행했습니다."
          : "세그멘테이션을 실행했습니다.",
      );
    } catch (caught) {
      setSegError(
        caught instanceof ApiError ? caught.message : "세그멘테이션을 실행하지 못했습니다.",
      );
    } finally { setSegRunning(false); }
  }

  async function runFeatureExtraction() {
    if (!segmentation || featRunning) return;
    setFeatRunning(true); setSegError(null); setStatus(null); setFeatSummary(null);
    try {
      const result = await api.extractFeatures(imageId);
      setFeatSummary(result);
      // Auto measurements replace prior auto ones and keep manual ones; reload
      // the detail so the saved list reflects exactly what the server stored.
      const refreshed = await api.getImage(imageId);
      setDetail(refreshed);
      const kept = result.measurements.length;
      const skipped = result.skipped.length;
      // Corrections survive a re-run, and saying so is the difference between
      // trusting the button and re-checking every value after pressing it.
      const preserved = result.preserved_adjusted;
      setStatus(
        `자동 특징 ${kept}개를 추출했습니다${skipped > 0 ? ` (건너뜀 ${skipped}개)` : ""}.` +
          (preserved > 0 ? ` 직접 보정한 ${preserved}개는 그대로 두었습니다.` : ""),
      );
    } catch (caught) {
      setSegError(
        caught instanceof ApiError ? caught.message : "자동 특징을 추출하지 못했습니다.",
      );
    } finally { setFeatRunning(false); }
  }

  const copy = pending ? confirmCopy(pending) : null;

  return (
    <main>
      <Link to="/images">← 목록으로</Link>
      <StatusBanner message={status} />
      <div className="measurement-layout">
        <section className="viewer-panel" aria-label="측정 이미지">
          <div className="editor-column">
            <div className="viewer-toolbar" role="toolbar" aria-label="배율">
              <button type="button" className="tool-button" aria-label="축소" data-testid="zoom-out" disabled={zoomIndex <= 0} onClick={() => changeZoom(-1)}>−</button>
              <span className="zoom-value" data-testid="zoom-level">{Math.round(zoom * 100)}%</span>
              <button type="button" className="tool-button" aria-label="확대" data-testid="zoom-in" disabled={zoomIndex >= ZOOM_STEPS.length - 1} onClick={() => changeZoom(1)}>+</button>
              <button type="button" className="tool-button" data-testid="zoom-fit" disabled={zoom === 1} onClick={() => setZoom(1)}>맞춤</button>
              <span className="toolbar-gap" />
              <label className="overlay-toggle"><input type="checkbox" checked={showShapes} onChange={(event) => setShowShapes(event.target.checked)} data-testid="toggle-shapes" />측정 표시</label>
              <label className="overlay-toggle"><input type="checkbox" checked={showLabels} disabled={!showShapes} onChange={(event) => setShowLabels(event.target.checked)} data-testid="toggle-labels" />값 라벨</label>
              <label className="overlay-toggle"><input type="checkbox" checked={onlySelected} disabled={!showShapes || selectedId === null} onChange={(event) => setOnlySelected(event.target.checked)} data-testid="toggle-only-selected" />선택만</label>
            </div>
            <div className="image-viewport" ref={viewportRef} tabIndex={0} aria-label="이미지 뷰어. 확대한 뒤에는 스크롤이나 방향키로 이동합니다.">
              <div className="image-stage" style={displayWidth > 0 ? { width: displayWidth } : undefined}>
                <img ref={imageRef} src={detail.file_url} alt={detail.original_filename} onClick={placePoint} onMouseMove={trackCursor} onMouseLeave={() => setCursor(null)} className={adjustId !== null ? "adjusting" : undefined} style={displayWidth > 0 ? { width: displayWidth } : undefined} onLoad={() => { const rect = imageRef.current?.getBoundingClientRect(); if (rect) setRendered({ width: rect.width, height: rect.height }); }} data-testid="measurement-image" />
                {rendered.width > 0 && <MeasurementOverlay width={rendered.width} height={rendered.height} original={{ width: detail.pixel_width, height: detail.pixel_height }} measurements={showShapes ? shownMeasurements() : []} selectedId={selectedId} draft={draft} draftType={measurementType} showLabels={showLabels} onlySelected={onlySelected} editingId={showShapes ? adjustId : null} activeHandle={activeHandle} onHandleDown={(index, event) => beginDrag("adjust", index, event)} onHandleKeyDown={handleKeyDown} draftCursor={cursor} onDraftHandleDown={draft.length > 0 ? (index, event) => beginDrag("draft", index, event) : undefined} />}
              </div>
            </div>
            {detail.measurements.some((item) => item.source === "auto") && (
              <p className="viewer-legend" data-testid="viewer-legend">
                실선 = 수동 측정 · 점선 = 자동 추출(미검증) · 속이 빈 점 = 계산에 쓰인 기준점
              </p>
            )}
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
              {/* The identifying attributes used to sit in the page title bar;
                  they belong with the rest of the image's facts. */}
              <div><dt>종류</dt><dd data-testid="image-type">{detail.image_type}</dd></div>
              <div><dt>Product</dt><dd>{detail.product_id}</dd></div>
              <div><dt>Lot</dt><dd>{detail.lot_id}</dd></div>
              <div><dt>Wafer</dt><dd>{detail.wafer_id}</dd></div>
              <div><dt>보정값</dt><dd>{detail.calibration_nm_per_pixel} nm/pixel</dd></div>
              <div><dt>원본 크기</dt><dd>{detail.pixel_width} × {detail.pixel_height} px</dd></div>
              {detail.process_step && <div><dt>공정 Step</dt><dd data-testid="image-process-step">{detail.process_step}</dd></div>}
              <div><dt>등록</dt><dd>{new Date(detail.created_at).toLocaleString()}</dd></div>
            </dl>
          </section>
          {adjusting ? (
            <section className="adjust-panel" aria-labelledby="adjust-heading" data-testid="adjust-panel">
              <h2 id="adjust-heading">측정 보정</h2>
              <p className="note-hint">
                이미지 위의 점을 끌어서 옮기세요. 점을 클릭(탭)해 선택한 뒤 방향키로 1px, Shift+방향키로 10px씩 옮길 수 있습니다. 저장하기 전에는 아무것도 바뀌지 않습니다.
              </p>
              <dl data-testid="adjust-facts">
                <div><dt>측정</dt><dd>{adjusting.label ?? TYPE_LABEL[adjusting.measurement_type]}</dd></div>
                <div><dt>지금 값</dt><dd data-testid="adjust-preview">{adjustPreview ? formatValue(adjustPreview.value, adjustPreview.unit) : "값을 계산할 수 없는 위치입니다"}</dd></div>
                <div><dt>저장된 값</dt><dd>{formatValue(adjusting.value, adjusting.unit)}</dd></div>
                {/* Only once a point has actually moved: before that the
                    client preview and the stored value differ by float noise,
                    which would read as a difference nobody made. */}
                {adjustMoved && adjustDelta !== null && (
                  <div><dt>차이</dt><dd data-testid="adjust-delta">{adjustDelta >= 0 ? "+" : "−"}{formatValue(Math.abs(adjustDelta), adjusting.unit)}</dd></div>
                )}
              </dl>
              <p className="note-hint">값은 저장할 때 서버가 점으로부터 다시 계산합니다. 종류와 보정값(nm/pixel)은 바뀌지 않습니다.</p>
              {error && <p role="alert">{error}</p>}
              <div className="actions">
                <button type="button" onClick={cancelAdjust} disabled={adjustBusy} data-testid="adjust-cancel">취소</button>
                {adjusting.adjusted_at && (
                  <button type="button" onClick={() => revertAdjust(adjusting.id)} disabled={adjustBusy} data-testid="adjust-revert">처음 값으로</button>
                )}
                <button type="button" className="primary" onClick={saveAdjust} disabled={adjustBusy || adjustPreview === null || !adjustMoved} data-testid="adjust-save">{adjustBusy ? "저장 중…" : "보정 저장"}</button>
              </div>
            </section>
          ) : (
          <>
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
          <div className="actions">
            {/* Undoing one click beats starting the drawing over, which is all
                the old reset offered for a single misplaced point. */}
            <button type="button" onClick={undoPoint} disabled={draft.length === 0} data-testid="measurement-undo">마지막 점 취소</button>
            <button type="button" onClick={resetDraft} disabled={draft.length === 0} data-testid="measurement-reset">초기화</button>
            <button type="button" onClick={save} disabled={draft.length !== needed || saving} data-testid="measurement-save">{saving ? "저장 중…" : "측정 저장"}</button>
          </div>
          </>
          )}
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
                    <tr key={item.id} className={selected ? "saved-row selected" : "saved-row"} aria-selected={selected} tabIndex={0} onClick={() => setSelectedId(item.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedId(item.id); } }} data-testid="saved-measurement-item">
                      <td className="swatch-col"><span className="measurement-swatch" style={{ background: measurementColor(item.id) }} aria-hidden="true" /></td>
                      <td>
                        <strong>
                          {item.label ? `${item.label} · ` : ""}{TYPE_LABEL[item.measurement_type]} · {formatValue(item.value, item.unit)}
                          {item.source === "auto" ? (
                            <span className="source-badge auto" data-testid="measurement-source" title="자동 추출값 (사람이 검증하지 않음)">
                              {/* Once a person has moved the points the extractor's
                                  confidence describes geometry that is no longer the
                                  stored one, so it is shown with the original value
                                  below instead of beside the corrected one. */}
                              자동{item.adjusted_at === null && item.confidence !== null ? ` ${Math.round(item.confidence * 100)}%` : ""}
                            </span>
                          ) : (
                            <span className="source-badge manual" data-testid="measurement-source">수동</span>
                          )}
                          {item.adjusted_at !== null && (
                            <span className="source-badge adjusted" data-testid="measurement-adjusted" title="사람이 점을 옮겨 보정한 값">보정됨</span>
                          )}
                        </strong>
                        {item.adjusted_at !== null && item.original_value !== null && (
                          <span className="saved-note" data-testid="measurement-original">
                            처음 값 {formatValue(item.original_value, item.unit)}
                            {item.source === "auto" && item.confidence !== null
                              ? ` (자동 ${Math.round(item.confidence * 100)}%)`
                              : ""}
                            {" · "}
                            {new Date(item.adjusted_at).toLocaleString()} 보정
                          </span>
                        )}
                        {item.note && <span className="saved-note">{item.note}</span>}
                        {editId === item.id && (
                          <div className="note-editor" onClick={(event) => event.stopPropagation()}>
                            {/* This editor covers the annotation only. Points are
                                correctable, but through the '보정' tool, which
                                revalues the measurement and keeps what it first
                                read; type and calibration stay as measured. */}
                            <label>
                              측정 항목 명
                              <input value={edit.label} maxLength={255} autoFocus onChange={(event) => setEdit((current) => ({ ...current, label: event.target.value }))} data-testid="label-input" />
                            </label>
                            <label>
                              메모
                              <textarea value={edit.note} onChange={(event) => setEdit((current) => ({ ...current, note: event.target.value }))} data-testid="note-input" />
                            </label>
                            <p className="note-hint">라벨과 메모만 바뀝니다. 점의 위치는 '보정'에서 옮기고, 종류·보정값(nm/pixel)은 측정한 그대로 유지됩니다.</p>
                            <div className="actions">
                              <button type="button" onClick={() => setEditId(null)} data-testid="note-cancel">취소</button>
                              <button type="button" onClick={() => saveAnnotation(item.id)} disabled={savingEdit} data-testid="note-save">{savingEdit ? "저장 중…" : "라벨·메모 저장"}</button>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="saved-time">{new Date(item.created_at).toLocaleString()}</td>
                      <td className="table-actions">
                        <button type="button" className="edit-note" onClick={(event) => { event.stopPropagation(); startAdjust(item); }} disabled={adjustId === item.id} data-testid="adjust-measurement" aria-label={`${item.label ?? TYPE_LABEL[item.measurement_type]} 측정 위치 보정`}>보정</button>
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
      <section className="segmentation-panel table-panel" aria-labelledby="segmentation-heading" data-testid="segmentation-panel">
        <h2 id="segmentation-heading">자동 분석 (세그멘테이션 · 특징)</h2>
        <p className="note-hint">원본 이미지는 절대 수정하지 않습니다. 결과는 모두 파생 파일로만 저장됩니다. 자동 측정값은 사람이 검증한 값이 아니며, 저장된 측정 목록에서 '자동'으로 구분됩니다. 다시 실행하면 자동 측정은 새로 계산되지만, 직접 보정한 항목은 그대로 유지됩니다.</p>
        {segError && <p role="alert" data-testid="segmentation-error">{segError}</p>}
        <div className="actions">
          <button type="button" className="button primary" onClick={runSegmentation} disabled={segRunning} data-testid="run-segmentation">
            {segRunning ? "실행 중…" : segmentation ? "세그멘테이션 다시 실행" : "세그멘테이션 실행"}
          </button>
          <button type="button" className="button" onClick={runFeatureExtraction} disabled={!segmentation || featRunning} data-testid="run-features">
            {featRunning ? "추출 중…" : "자동 특징 추출"}
          </button>
        </div>
        {!segmentation ? (
          <p data-testid="segmentation-empty">아직 세그멘테이션을 실행하지 않았습니다.</p>
        ) : (
          <div className="segmentation-result" data-testid="segmentation-result">
            <dl data-testid="segmentation-facts">
              <div><dt>방법</dt><dd>{segmentation.method}</dd></div>
              <div><dt>클래스 수</dt><dd>{segmentation.classes}</dd></div>
              <div><dt>소요</dt><dd>{segmentation.duration_ms} ms{segmentation.downscaled ? " (다운스케일)" : ""}</dd></div>
            </dl>
            <div className="segmentation-views">
              <figure><img src={segmentation.map_url} alt="클래스 맵" data-testid="segmentation-map" /><figcaption>클래스 맵</figcaption></figure>
              <figure><img src={segmentation.boundary_url} alt="경계 오버레이" data-testid="segmentation-boundary" /><figcaption>경계 오버레이</figcaption></figure>
            </div>
            <table className="data-table">
              <thead><tr><th scope="col">클래스</th><th scope="col">픽셀</th><th scope="col">면적 비율</th><th scope="col">평균 강도</th><th scope="col">면적(nm²)</th></tr></thead>
              <tbody>
                {segmentation.class_stats.map((stat) => (
                  <tr key={stat.class_index} data-testid="segmentation-class-row">
                    <td>{stat.class_index}</td>
                    <td>{stat.pixels.toLocaleString()}</td>
                    <td>{(stat.area_fraction * 100).toFixed(1)}%</td>
                    <td>{stat.mean_intensity !== null ? stat.mean_intensity.toFixed(1) : "-"}</td>
                    <td>{stat.area_nm2 !== null ? stat.area_nm2.toFixed(1) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {segmentation.has_tagged_tiff && (
              <p><a className="button" href={`/api/images/${imageId}/tagged`} download data-testid="tagged-download">태그된 TIFF 다운로드</a></p>
            )}
            {featSummary && (
              <div data-testid="feature-summary">
                <p>대상 클래스 {featSummary.target_class} · 자동 측정 {featSummary.measurements.length}개{featSummary.region_clipped ? " · 영역이 이미지 경계에 닿음" : ""}</p>
                {featSummary.skipped.length > 0 && (
                  <ul className="note-hint" data-testid="feature-skipped">
                    {featSummary.skipped.map((s) => <li key={s.key}>{s.key}: {s.reason}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </section>
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
      <section className="danger-zone table-panel" aria-labelledby="danger-zone-heading">
        <h2 id="danger-zone-heading">이미지 삭제</h2>
        <p>이 이미지와 저장된 측정을 모두 삭제합니다. 되돌릴 수 없습니다.</p>
        <button type="button" className="heading-delete" data-testid="detail-image-delete" onClick={() => setPending({ kind: "image" })}>이미지 삭제</button>
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
