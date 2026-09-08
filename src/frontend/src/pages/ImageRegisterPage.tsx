import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function ImageRegisterPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") { setPreview(null); return; }
    const value = URL.createObjectURL(file);
    setPreview(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = new FormData(event.currentTarget);
    const calibration = Number(form.get("calibration_nm_per_pixel"));
    const fields = ["product_id", "lot_id", "wafer_id"];
    if (!file) { setError("PNG 또는 JPEG 이미지 한 장을 선택해 주세요."); return; }
    if (file.size > MAX_FILE_SIZE) { setError("이미지는 20MB 이하여야 합니다."); return; }
    if (!fields.every((name) => String(form.get(name) ?? "").trim())) {
      setError("Product, Lot, Wafer는 모두 필수입니다."); return;
    }
    if (!Number.isFinite(calibration) || calibration <= 0) {
      setError("nm/pixel 보정값은 0보다 큰 숫자여야 합니다."); return;
    }
    form.set("file", file);
    setError(null);
    setSubmitting(true);
    try {
      const image = await api.registerImage(form);
      navigate(`/images/${image.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "이미지를 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <p className="eyebrow">New image</p><h1>이미지 등록</h1>
      <div className="registration-layout">
        <section className="preview-panel" aria-label="이미지 미리보기">
          {preview ? <img src={preview} alt="선택한 이미지 미리보기" /> : <p>PNG/JPEG · 최대 20MB</p>}
        </section>
        <form className="registration-form" onSubmit={submit} data-testid="image-registration-form">
          <label>이미지 파일<input data-testid="registration-file" name="file-input" type="file" accept="image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <label>이미지 종류<select name="image_type" defaultValue="TEM"><option value="TEM">TEM</option><option value="SEM">SEM</option></select></label>
          <label>Product ID<input name="product_id" data-testid="registration-product" /></label>
          <label>Lot ID<input name="lot_id" /></label>
          <label>Wafer ID<input name="wafer_id" /></label>
          <label>nm/pixel<input name="calibration_nm_per_pixel" inputMode="decimal" /></label>
          {error && <p role="alert">{error}</p>}
          <button className="button primary" type="submit" disabled={submitting} data-testid="registration-submit">{submitting ? "등록 중…" : "이미지 등록"}</button>
        </form>
      </div>
    </main>
  );
}
