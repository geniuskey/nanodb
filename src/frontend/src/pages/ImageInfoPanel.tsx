import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type {
  CatalogCategory,
  CatalogOption,
  ImageDetailView,
  ImageView,
} from "../api/types";
import { Combobox } from "../ui/Combobox";

interface Props {
  detail: ImageDetailView;
  /** Called with the freshly saved image so the page can update in place. */
  onUpdated: (image: ImageView) => void;
}

const CATALOG_FIELDS = [
  { name: "image_type", category: "image_type", label: "종류", testId: "edit-image-type" },
  { name: "product_id", category: "product_id", label: "Product", testId: "edit-product-id" },
  { name: "lot_id", category: "lot_id", label: "Lot", testId: "edit-lot-id" },
  { name: "wafer_id", category: "wafer_id", label: "Wafer", testId: "edit-wafer-id" },
] as const;

type FieldErrors = Record<string, string | undefined>;

function optionsFor(catalog: CatalogOption[], category: CatalogCategory): string[] {
  return catalog.filter((option) => option.category === category).map((option) => option.value);
}

function fromDetail(detail: ImageDetailView): Record<string, string> {
  return {
    image_type: detail.image_type,
    product_id: detail.product_id,
    lot_id: detail.lot_id,
    wafer_id: detail.wafer_id,
    process_step: detail.process_step ?? "",
    note: detail.note ?? "",
    calibration_nm_per_pixel: String(detail.calibration_nm_per_pixel),
  };
}

/**
 * The image information block on the measurement screen: a read-only facts list
 * that flips into a form to correct anything a person typed at registration.
 *
 * The file, its pixel dimensions and the registration date are fixed and stay
 * read-only. Changing the calibration only affects measurements made after the
 * edit -- each stored measurement keeps the calibration it was computed with --
 * so a correction here never silently rewrites an existing value.
 */
export function ImageInfoPanel({ detail, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [values, setValues] = useState<Record<string, string>>(() => fromDetail(detail));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Load the catalog only once the operator opens the editor, not on every
  // measurement screen: the comboboxes are the only thing that needs it, and
  // deferring the call keeps the page's load path unchanged when nobody edits.
  useEffect(() => {
    if (!editing) return;
    let active = true;
    // A failed catalog load is not fatal: the operator can still type values.
    api
      .getCatalog()
      .then((value) => active && setCatalog(Array.isArray(value) ? value : []))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [editing]);

  const catalogByField = useMemo(
    () => ({
      image_type: optionsFor(catalog, "image_type"),
      product_id: optionsFor(catalog, "product_id"),
      lot_id: optionsFor(catalog, "lot_id"),
      wafer_id: optionsFor(catalog, "wafer_id"),
      process_step: optionsFor(catalog, "process_step"),
    }),
    [catalog],
  );

  function openEdit() {
    setValues(fromDetail(detail));
    setFieldErrors({});
    setFormError(null);
    setEditing(true);
  }

  function closeEdit() {
    setEditing(false);
  }

  // While the modal is open, move focus into it, restore focus to the opener
  // when it closes, hold Escape to cancel, and keep Tab within the dialog.
  useEffect(() => {
    if (!editing) return;
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current
      ?.querySelector<HTMLElement>("input, select, textarea, button")
      ?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeEdit();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "a[href], input, select, textarea, button:not([disabled])",
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      opener?.focus?.();
    };
  }, [editing]);

  function setValue(name: string, next: string) {
    setValues((current) => ({ ...current, [name]: next }));
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    for (const { name, label } of CATALOG_FIELDS) {
      if (!values[name].trim()) found[name] = `${label}은(는) 필수입니다.`;
    }
    const raw = values.calibration_nm_per_pixel;
    const calibration = Number(raw);
    if (!raw.trim()) {
      found.calibration_nm_per_pixel = "nm/pixel 보정값은 필수입니다.";
    } else if (!Number.isFinite(calibration) || calibration <= 0) {
      found.calibration_nm_per_pixel = "nm/pixel 보정값은 0보다 큰 숫자여야 합니다.";
    }
    return found;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    setFormError(null);
    try {
      const updated = await api.updateImage(detail.id, {
        image_type: values.image_type.trim(),
        product_id: values.product_id.trim(),
        lot_id: values.lot_id.trim(),
        wafer_id: values.wafer_id.trim(),
        process_step: values.process_step.trim() || null,
        note: values.note.trim() || null,
        calibration_nm_per_pixel: Number(values.calibration_nm_per_pixel),
      });
      onUpdated(updated);
      closeEdit();
    } catch (caught) {
      if (caught instanceof ApiError && caught.field) {
        setFieldErrors({ [caught.field]: caught.message });
      } else {
        setFormError(
          caught instanceof ApiError ? caught.message : "이미지 정보를 저장하지 못했습니다.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function fieldAria(name: string) {
    return {
      ariaInvalid: fieldErrors[name] ? true : undefined,
      ariaDescribedBy: fieldErrors[name] ? `${name}-error` : undefined,
    };
  }

  function FieldError({ name }: { name: string }) {
    const message = fieldErrors[name];
    if (!message) return null;
    return (
      <span className="field-error" id={`${name}-error`} role="alert">
        {message}
      </span>
    );
  }

  return (
    <section className="image-facts" aria-labelledby="image-facts-heading">
      <div className="image-facts-head">
        <h2 id="image-facts-heading">이미지 정보</h2>
        <button type="button" className="button" onClick={openEdit} data-testid="image-edit">
          정보 수정
        </button>
      </div>
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
        {detail.note && <div><dt>비고</dt><dd data-testid="image-note">{detail.note}</dd></div>}
        <div><dt>등록</dt><dd>{new Date(detail.created_at).toLocaleString()}</dd></div>
      </dl>

      {editing && (
        <div className="dialog-backdrop" data-testid="image-edit-backdrop">
          <div
            className="dialog dialog-form"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-edit-title"
          >
            <h2 id="image-edit-title">이미지 정보 수정</h2>
            <form className="registration-form image-edit-form" onSubmit={submit} data-testid="image-edit-form" noValidate>
              <p className="field-hint">
                목록에 없는 값은 직접 입력하면 새로 추가됩니다. <Link to="/catalog">목록 관리</Link>
              </p>
              {CATALOG_FIELDS.map(({ name, category, label, testId }) => (
                <label key={name}>
                  <span>{label} <span className="required-mark">*</span></span>
                  <Combobox
                    name={name}
                    testId={testId}
                    value={values[name]}
                    onChange={(next) => setValue(name, next)}
                    options={catalogByField[category]}
                    {...fieldAria(name)}
                  />
                  <FieldError name={name} />
                </label>
              ))}
              <label>
                <span>공정 Step</span>
                <Combobox
                  name="process_step"
                  testId="edit-process-step"
                  value={values.process_step}
                  onChange={(next) => setValue("process_step", next)}
                  options={catalogByField.process_step}
                  placeholder="예: Gate Etch"
                />
                <span className="field-hint">선택 입력. 이 이미지를 촬영한 공정 단계입니다.</span>
              </label>
              <label>
                <span>nm/pixel <span className="required-mark">*</span></span>
                <input
                  name="calibration_nm_per_pixel"
                  data-testid="edit-calibration"
                  inputMode="decimal"
                  value={values.calibration_nm_per_pixel}
                  onChange={(event) => setValue("calibration_nm_per_pixel", event.target.value)}
                  aria-required
                  aria-invalid={fieldErrors.calibration_nm_per_pixel ? true : undefined}
                  aria-describedby={fieldErrors.calibration_nm_per_pixel ? "calibration_nm_per_pixel-error" : undefined}
                />
                <FieldError name="calibration_nm_per_pixel" />
                <span className="field-hint">
                  이미 저장된 측정값은 계산 당시의 보정값을 유지합니다. 변경은 이후 측정부터 적용됩니다.
                </span>
              </label>
              <label>
                <span>비고</span>
                <textarea
                  name="note"
                  data-testid="edit-note"
                  rows={3}
                  value={values.note}
                  onChange={(event) => setValue("note", event.target.value)}
                  placeholder="이미지에 대한 메모 (선택 입력)"
                />
              </label>
              {formError && <p role="alert" data-testid="image-edit-error">{formError}</p>}
              <div className="actions">
                <button type="button" className="button" onClick={closeEdit} disabled={saving} data-testid="image-edit-cancel">
                  취소
                </button>
                <button type="submit" className="button primary" disabled={saving} data-testid="image-edit-save">
                  {saving ? "저장 중…" : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
