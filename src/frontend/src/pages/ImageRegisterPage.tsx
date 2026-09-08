import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { useDocumentTitle } from "../ui/useDocumentTitle";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** Field names that can carry their own error message. */
type FieldName =
  | "file"
  | "product_id"
  | "lot_id"
  | "wafer_id"
  | "calibration_nm_per_pixel";

type FieldErrors = Partial<Record<FieldName, string>>;

/** Order used to focus the first offending input after a failed submit. */
const FIELD_ORDER: FieldName[] = [
  "file",
  "product_id",
  "lot_id",
  "wafer_id",
  "calibration_nm_per_pixel",
];

const TEXT_FIELDS: { name: FieldName; label: string; testId?: string }[] = [
  { name: "product_id", label: "Product ID", testId: "registration-product" },
  { name: "lot_id", label: "Lot ID" },
  { name: "wafer_id", label: "Wafer ID" },
];

export function ImageRegisterPage() {
  useDocumentTitle("이미지 등록");
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") { setPreview(null); return; }
    const value = URL.createObjectURL(file);
    setPreview(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);

  /** Collect every problem at once so the user fixes one round, not five. */
  function validate(form: FormData): FieldErrors {
    const found: FieldErrors = {};
    if (!file) {
      found.file = "PNG, JPEG 또는 TIFF 이미지 한 장을 선택해 주세요.";
    } else if (file.size > MAX_FILE_SIZE) {
      found.file = "이미지는 20MB 이하여야 합니다.";
    }
    for (const { name, label } of TEXT_FIELDS) {
      if (!String(form.get(name) ?? "").trim()) {
        found[name] = `${label}는 필수입니다.`;
      }
    }
    const calibration = Number(form.get("calibration_nm_per_pixel"));
    if (!String(form.get("calibration_nm_per_pixel") ?? "").trim()) {
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
    const form = new FormData(event.currentTarget);
    const found = validate(form);
    setFieldErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      focusFirstError(found);
      return;
    }
    form.set("file", file!);
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

  /** Props that tie an input to its own error text for assistive technology. */
  function fieldProps(name: FieldName) {
    const message = fieldErrors[name];
    return {
      "aria-required": true,
      "aria-invalid": message ? true : undefined,
      "aria-describedby": message ? `${name}-error` : undefined,
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
      <p className="section-note">별표(<span className="required-mark">*</span>)는 필수 입력입니다.</p>
      <div className="registration-layout">
        <section className="preview-panel" aria-label="이미지 미리보기">
          {preview ? <img src={preview} alt="선택한 이미지 미리보기" /> : <p>PNG/JPEG/TIFF · 최대 20MB</p>}
        </section>
        <form className="registration-form" ref={formRef} onSubmit={submit} data-testid="image-registration-form" noValidate>
          <label>
            <span>이미지 파일 <span className="required-mark">*</span></span>
            <input data-testid="registration-file" name="file-input" type="file" accept="image/png,image/jpeg,image/tiff,.tif,.tiff" onChange={(event) => setFile(event.target.files?.[0] ?? null)} {...fieldProps("file")} />
            <FieldError name="file" />
          </label>
          <label>
            <span>이미지 종류 <span className="required-mark">*</span></span>
            <select name="image_type" defaultValue="TEM" aria-required="true"><option value="TEM">TEM</option><option value="SEM">SEM</option></select>
          </label>
          {TEXT_FIELDS.map(({ name, label, testId }) => (
            <label key={name}>
              <span>{label} <span className="required-mark">*</span></span>
              <input name={name} data-testid={testId} {...fieldProps(name)} />
              <FieldError name={name} />
            </label>
          ))}
          {/* The process step describes the whole image, not any one
              measurement, and is optional: an operator who does not know it
              should still be able to register the evidence. */}
          <label>
            <span>공정 Step</span>
            <input name="process_step" maxLength={255} placeholder="예: Gate Etch" data-testid="registration-process-step" />
            <span className="field-hint">선택 입력. 이 이미지를 촬영한 공정 단계입니다.</span>
          </label>
          <label>
            <span>nm/pixel <span className="required-mark">*</span></span>
            <input name="calibration_nm_per_pixel" inputMode="decimal" {...fieldProps("calibration_nm_per_pixel")} />
            <FieldError name="calibration_nm_per_pixel" />
          </label>
          {formError && <p role="alert">{formError}</p>}
          <button className="button primary" type="submit" disabled={submitting} data-testid="registration-submit">{submitting ? "등록 중…" : "이미지 등록"}</button>
        </form>
      </div>
    </main>
  );
}
