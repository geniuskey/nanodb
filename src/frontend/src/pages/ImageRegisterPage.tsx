import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type { CatalogCategory, CatalogOption } from "../api/types";
import { Combobox } from "../ui/Combobox";
import { useDocumentTitle } from "../ui/useDocumentTitle";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** Formats the browser accepts as a registration image. */
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/tiff"]);

/** True for a File that looks like one of the accepted image formats. A pasted
 *  or dropped file may arrive with an empty type, so we also accept a matching
 *  extension. */
function isAcceptedImage(candidate: File): boolean {
  if (candidate.type && ACCEPTED_TYPES.has(candidate.type)) return true;
  return /\.(png|jpe?g|tiff?)$/i.test(candidate.name);
}

/** Field names that can carry their own error message. */
type FieldName =
  | "file"
  | "image_type"
  | "product_id"
  | "lot_id"
  | "wafer_id"
  | "calibration_nm_per_pixel";

type FieldErrors = Partial<Record<FieldName, string>>;

/** Order used to focus the first offending input after a failed submit. */
const FIELD_ORDER: FieldName[] = [
  "file",
  "image_type",
  "product_id",
  "lot_id",
  "wafer_id",
  "calibration_nm_per_pixel",
];

/** Catalog-backed combobox fields, in display order. */
const CATALOG_FIELDS: {
  name: FieldName;
  category: CatalogCategory;
  label: string;
  testId?: string;
  required: boolean;
}[] = [
  { name: "image_type", category: "image_type", label: "이미지 종류", testId: "registration-image-type", required: true },
  { name: "product_id", category: "product_id", label: "Product ID", testId: "registration-product", required: true },
  { name: "lot_id", category: "lot_id", label: "Lot ID", testId: "registration-lot", required: true },
  { name: "wafer_id", category: "wafer_id", label: "Wafer ID", testId: "registration-wafer", required: true },
];

function optionsFor(catalog: CatalogOption[], category: CatalogCategory): string[] {
  return catalog.filter((option) => option.category === category).map((option) => option.value);
}

export function ImageRegisterPage() {
  useDocumentTitle("이미지 등록");
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [values, setValues] = useState<Record<string, string>>({
    image_type: "TEM",
    product_id: "",
    lot_id: "",
    wafer_id: "",
    process_step: "",
    note: "",
    calibration_nm_per_pixel: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);

  /** Accept an image that arrived by picker, paste or drop through one path so
   *  the preview, validation and submit all see the same File. Clears any stale
   *  file error and rejects a non-image outright. */
  function acceptFile(candidate: File | null | undefined) {
    if (!candidate) return;
    if (!isAcceptedImage(candidate)) {
      setFieldErrors((current) => ({
        ...current,
        file: "PNG, JPEG 또는 TIFF 이미지만 넣을 수 있습니다.",
      }));
      return;
    }
    setFile(candidate);
    setFieldErrors((current) => {
      if (!current.file) return current;
      const { file: _dropped, ...rest } = current;
      return rest;
    });
  }

  useEffect(() => {
    let active = true;
    // A failed catalog load is not fatal: the operator can still type values.
    api.getCatalog().then((value) => active && setCatalog(value)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") { setPreview(null); return; }
    const value = URL.createObjectURL(file);
    setPreview(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);

  // Paste an image straight from the clipboard (e.g. a crop copied from a
  // viewer). We ignore pastes into the note/text fields so typing is untouched.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) {
        if ((target as HTMLInputElement).type !== "file") return;
      }
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) =>
        entry.type.startsWith("image/"),
      );
      const pasted = item?.getAsFile();
      if (pasted) {
        event.preventDefault();
        acceptFile(pasted);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

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

  function setValue(name: string, next: string) {
    setValues((current) => ({ ...current, [name]: next }));
  }

  /** Collect every problem at once so the user fixes one round, not five. */
  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!file) {
      found.file = "PNG, JPEG 또는 TIFF 이미지 한 장을 선택해 주세요.";
    } else if (file.size > MAX_FILE_SIZE) {
      found.file = "이미지는 20MB 이하여야 합니다.";
    }
    for (const { name, label } of CATALOG_FIELDS) {
      if (!values[name].trim()) {
        found[name] = `${label}는 필수입니다.`;
      }
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

  function focusFirstError(errors: FieldErrors) {
    const first = FIELD_ORDER.find((name) => errors[name]);
    if (!first) return;
    const selector = first === "file" ? '[name="file-input"]' : `[name="${first}"]`;
    formRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const found = validate();
    setFieldErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      focusFirstError(found);
      return;
    }
    const form = new FormData();
    form.set("file", file!);
    form.set("image_type", values.image_type.trim());
    form.set("product_id", values.product_id.trim());
    form.set("lot_id", values.lot_id.trim());
    form.set("wafer_id", values.wafer_id.trim());
    form.set("process_step", values.process_step.trim());
    form.set("note", values.note.trim());
    form.set("calibration_nm_per_pixel", values.calibration_nm_per_pixel.trim());
    setSubmitting(true);
    try {
      const image = await api.registerImage(form);
      navigate(`/images/${image.id}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.field && FIELD_ORDER.includes(caught.field as FieldName)) {
        // The server names the offending field; show it in the same place.
        const serverErrors = { [caught.field as FieldName]: caught.message };
        setFieldErrors(serverErrors);
        focusFirstError(serverErrors);
      } else {
        setFormError(caught instanceof ApiError ? caught.message : "이미지를 등록하지 못했습니다.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function fieldAria(name: FieldName) {
    const message = fieldErrors[name];
    return {
      ariaRequired: true,
      ariaInvalid: message ? true : undefined,
      ariaDescribedBy: message ? `${name}-error` : undefined,
    } as const;
  }

  function FieldError({ name }: { name: FieldName }) {
    const message = fieldErrors[name];
    if (!message) return null;
    return (
      <span className="field-error" id={`${name}-error`} role="alert" data-testid={`error-${name}`}>
        {message}
      </span>
    );
  }

  return (
    <main>
      <p className="eyebrow">New image</p><h1>이미지 등록</h1>
      <p className="section-note">
        별표(<span className="required-mark">*</span>)는 필수 입력입니다. 목록에 없는 값은 직접 입력하면 새로 추가됩니다.{" "}
        <Link to="/catalog">목록 관리</Link>
      </p>
      <div className="registration-layout">
        <section
          className={dragging ? "preview-panel is-dragging" : "preview-panel"}
          aria-label="이미지 미리보기"
          data-testid="image-drop-zone"
          onDragOver={(event) => {
            event.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={(event) => {
            // Ignore bubbling from children; only clear when leaving the panel.
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFile(event.dataTransfer.files?.[0]);
          }}
        >
          {preview ? (
            <img src={preview} alt="선택한 이미지 미리보기" />
          ) : (
            <p>이미지를 끌어다 놓거나 붙여넣기(Ctrl/⌘+V) · PNG/JPEG/TIFF · 최대 20MB</p>
          )}
        </section>
        <form className="registration-form" ref={formRef} onSubmit={submit} data-testid="image-registration-form" noValidate>
          <label>
            <span>이미지 파일 <span className="required-mark">*</span></span>
            <input data-testid="registration-file" name="file-input" type="file" accept="image/png,image/jpeg,image/tiff,.tif,.tiff" onChange={(event) => acceptFile(event.target.files?.[0])} aria-required aria-invalid={fieldErrors.file ? true : undefined} aria-describedby={fieldErrors.file ? "file-error" : undefined} />
            <FieldError name="file" />
          </label>
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
          {/* The process step describes the whole image, not any one
              measurement, and is optional: an operator who does not know it
              should still be able to register the evidence. */}
          <label>
            <span>공정 Step</span>
            <Combobox
              name="process_step"
              testId="registration-process-step"
              value={values.process_step}
              onChange={(next) => setValue("process_step", next)}
              options={catalogByField.process_step}
              placeholder="예: Gate Etch"
            />
            <span className="field-hint">선택 입력. 이 이미지를 촬영한 공정 단계입니다.</span>
          </label>
          <label>
            <span>nm/pixel <span className="required-mark">*</span></span>
            <input name="calibration_nm_per_pixel" inputMode="decimal" value={values.calibration_nm_per_pixel} onChange={(event) => setValue("calibration_nm_per_pixel", event.target.value)} aria-required aria-invalid={fieldErrors.calibration_nm_per_pixel ? true : undefined} aria-describedby={fieldErrors.calibration_nm_per_pixel ? "calibration_nm_per_pixel-error" : undefined} />
            <FieldError name="calibration_nm_per_pixel" />
          </label>
          {/* A remark about the whole image (a sample caveat, a ticket
              reference). Optional free text, never tied to a measurement. */}
          <label>
            <span>비고</span>
            <textarea
              name="note"
              data-testid="registration-note"
              rows={3}
              value={values.note}
              onChange={(event) => setValue("note", event.target.value)}
              placeholder="이미지에 대한 메모 (선택 입력)"
            />
            <span className="field-hint">선택 입력. 이 이미지에 대한 자유 메모입니다.</span>
          </label>
          {formError && <p role="alert">{formError}</p>}
          <button className="button primary" type="submit" disabled={submitting} data-testid="registration-submit">{submitting ? "등록 중…" : "이미지 등록"}</button>
        </form>
      </div>
    </main>
  );
}
