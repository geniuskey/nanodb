import { FormEvent, useEffect, useMemo, useState } from "react";

import { ApiError, api } from "../api/client";
import type { CatalogCategory, CatalogOption } from "../api/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { StatusBanner } from "../ui/StatusBanner";
import { useDocumentTitle } from "../ui/useDocumentTitle";

type State = "loading" | "success" | "failure";

const CATEGORIES: { category: CatalogCategory; label: string }[] = [
  { category: "image_type", label: "이미지 종류" },
  { category: "product_id", label: "Product ID" },
  { category: "lot_id", label: "Lot ID" },
  { category: "wafer_id", label: "Wafer ID" },
  { category: "process_step", label: "공정 Step" },
];

export function CatalogPage() {
  useDocumentTitle("목록 관리");
  const [options, setOptions] = useState<CatalogOption[]>([]);
  const [state, setState] = useState<State>("loading");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<CatalogCategory | null>(null);
  const [errors, setErrors] = useState<Partial<Record<CatalogCategory, string>>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<CatalogOption | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState((current) => (current === "success" ? current : "loading"));
    api
      .getCatalog()
      .then((value) => {
        if (active) {
          setOptions(value);
          setState("success");
        }
      })
      .catch(() => active && setState("failure"));
    return () => {
      active = false;
    };
  }, [attempt]);

  const grouped = useMemo(() => {
    const map = new Map<CatalogCategory, CatalogOption[]>();
    for (const { category } of CATEGORIES) map.set(category, []);
    for (const option of options) map.get(option.category)?.push(option);
    return map;
  }, [options]);

  async function addOption(event: FormEvent<HTMLFormElement>, category: CatalogCategory) {
    event.preventDefault();
    const value = (drafts[category] ?? "").trim();
    setErrors((current) => ({ ...current, [category]: undefined }));
    if (!value) {
      setErrors((current) => ({ ...current, [category]: "값을 입력해 주세요." }));
      return;
    }
    setBusy(category);
    setStatus(null);
    try {
      const created = await api.createCatalogOption({ category, value });
      setOptions((current) => [...current, created]);
      setDrafts((current) => ({ ...current, [category]: "" }));
      setStatus(`'${created.value}'를 추가했습니다.`);
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        [category]: caught instanceof ApiError ? caught.message : "추가하지 못했습니다.",
      }));
    } finally {
      setBusy(null);
    }
  }

  async function removeOption() {
    const option = pending;
    if (!option || deleting) return;
    setDeleting(true);
    setStatus(null);
    try {
      await api.deleteCatalogOption(option.id);
      setOptions((current) => current.filter((item) => item.id !== option.id));
      setStatus(`'${option.value}'를 삭제했습니다.`);
    } catch (caught) {
      setStatus(caught instanceof ApiError ? caught.message : "삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
      setPending(null);
    }
  }

  return (
    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Catalog</p>
          <h1>목록 관리</h1>
        </div>
      </div>
      <p className="section-note">
        이미지 등록 화면의 검색·선택 목록을 관리합니다. 기본값(<span className="badge">기본</span>)은 삭제할 수 없습니다.
      </p>

      <StatusBanner message={status} />

      {state === "loading" && <p role="status">목록을 불러오는 중입니다.</p>}
      {state === "failure" && (
        <p role="alert">
          목록을 불러오지 못했습니다.{" "}
          <button type="button" className="retry" onClick={() => setAttempt((current) => current + 1)}>
            다시 시도
          </button>
        </p>
      )}

      {state === "success" && (
        <div className="catalog-grid">
          {CATEGORIES.map(({ category, label }) => {
            const items = grouped.get(category) ?? [];
            return (
              <section className="catalog-card" key={category} data-testid={`catalog-${category}`}>
                <h2>{label} <span className="catalog-count">{items.length}</span></h2>
                <ul className="catalog-values">
                  {items.length === 0 && <li className="catalog-empty">등록된 값이 없습니다.</li>}
                  {items.map((option) => (
                    <li key={option.id} className="catalog-value">
                      <span>{option.value}</span>
                      {option.is_predefined ? (
                        <span className="badge" title="기본값은 삭제할 수 없습니다">기본</span>
                      ) : (
                        <button
                          type="button"
                          className="catalog-delete"
                          aria-label={`${option.value} 삭제`}
                          data-testid={`catalog-delete-${option.id}`}
                          onClick={() => setPending(option)}
                        >
                          삭제
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <form className="catalog-add" onSubmit={(event) => addOption(event, category)}>
                  <input
                    type="text"
                    aria-label={`${label} 추가`}
                    data-testid={`catalog-add-input-${category}`}
                    placeholder="새 값 추가"
                    value={drafts[category] ?? ""}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [category]: event.target.value }))
                    }
                  />
                  <button
                    type="submit"
                    className="button"
                    disabled={busy === category}
                    data-testid={`catalog-add-submit-${category}`}
                  >
                    추가
                  </button>
                </form>
                {errors[category] && (
                  <span className="field-error" role="alert" data-testid={`catalog-error-${category}`}>
                    {errors[category]}
                  </span>
                )}
              </section>
            );
          })}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={`'${pending.value}'를 삭제할까요?`}
          body="이미 등록된 이미지의 값은 그대로 유지되며, 목록에서만 제거됩니다."
          confirmLabel="삭제"
          busy={deleting}
          onConfirm={removeOption}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  );
}
