import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type { ImageListView, ImageType } from "../api/types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useDocumentTitle } from "../ui/useDocumentTitle";
import { StatusBanner } from "../ui/StatusBanner";

type State = "loading" | "success" | "failure";
type TypeFilter = "ALL" | ImageType;

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "SEM", label: "SEM" },
  { value: "TEM", label: "TEM" },
];

export function ImageListPage() {
  useDocumentTitle("이미지 목록");
  const [images, setImages] = useState<ImageListView[]>([]);
  const [state, setState] = useState<State>("loading");
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [pending, setPending] = useState<ImageListView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Debounce the free-text box so typing does not fire a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setActiveQuery(queryInput), 250);
    return () => clearTimeout(handle);
  }, [queryInput]);

  useEffect(() => {
    let active = true;
    // Only the first load blanks the page. A filter refetch keeps the previous
    // results on screen and just marks them as refreshing (CAT-008), so the
    // catalog does not flash empty on every keystroke.
    setState((current) => (current === "success" ? current : "loading"));
    setRefreshing(true);
    api
      .listImages({
        q: activeQuery || undefined,
        imageType: typeFilter === "ALL" ? undefined : typeFilter,
      })
      .then((value) => {
        if (active) {
          setImages(value);
          setState("success");
        }
      })
      .catch(() => active && setState("failure"))
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [activeQuery, typeFilter, attempt]);

  async function removeImage() {
    const image = pending;
    if (!image || deleting) return;
    setDeleting(true); setActionError(null); setStatus(null);
    try {
      await api.deleteImage(image.id);
      setImages((current) => current.filter((item) => item.id !== image.id));
      setStatus(`이미지 '${image.original_filename}'를 삭제했습니다.`);
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : "이미지를 삭제하지 못했습니다.");
    } finally { setDeleting(false); setPending(null); }
  }

  const isFiltered = activeQuery.trim() !== "" || typeFilter !== "ALL";

  return (
    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Image catalog</p>
          <h1>이미지 목록</h1>
        </div>
        <Link className="button primary" to="/images/new" data-testid="catalog-register-image">
          이미지 등록
        </Link>
      </div>

      <div className="catalog-toolbar">
        <input
          type="search"
          className="catalog-search"
          data-testid="image-search-input"
          aria-label="이미지 검색 (파일명·Product·Lot·Wafer)"
          placeholder="파일명 · Product · Lot · Wafer 검색"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
        />
        <div className="type-filter" role="group" aria-label="이미지 종류 필터">
          {TYPE_FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.value}
              data-testid={`filter-${filter.value.toLowerCase()}`}
              className={typeFilter === filter.value ? "chip active" : "chip"}
              aria-pressed={typeFilter === filter.value}
              onClick={() => setTypeFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <StatusBanner message={status} />
      {actionError && <p role="alert">{actionError}</p>}
      {state === "loading" && <p role="status">이미지를 불러오는 중입니다.</p>}
      {state === "success" && (
        <p className="result-count" role="status" data-testid="catalog-count">
          {isFiltered ? "조건에 맞는 이미지" : "등록된 이미지"} {images.length}건
          {refreshing ? " · 갱신 중" : ""}
        </p>
      )}
      {state === "failure" && (
        <p role="alert">
          이미지 목록을 불러오지 못했습니다.{" "}
          <button
            type="button"
            className="retry"
            data-testid="retry-catalog"
            onClick={() => setAttempt((current) => current + 1)}
          >
            다시 시도
          </button>
        </p>
      )}
      {state === "success" && images.length === 0 && (
        <section className="empty-state">
          {isFiltered ? (
            <>
              <h2>조건에 맞는 이미지가 없습니다</h2>
              <p>검색어나 종류 필터를 바꿔 보세요.</p>
            </>
          ) : (
            <>
              <h2>등록된 이미지가 없습니다</h2>
              <p>첫 SEM/TEM 이미지를 등록해 측정을 시작하세요.</p>
            </>
          )}
        </section>
      )}
      {state === "success" && images.length > 0 && (
        <div className={refreshing ? "image-grid refreshing" : "image-grid"} data-testid="image-catalog">
          {images.map((image) => (
            <article className="image-card-wrap" key={image.id}>
              <Link className="image-card" to={`/images/${image.id}`} data-testid="catalog-image-card">
                <img src={image.file_url} alt={`${image.original_filename} 미리보기`} />
                <div>
                  <span className="badge">{image.image_type}</span>
                  <h2>{image.original_filename}</h2>
                  <dl>
                    <div><dt>Product</dt><dd>{image.product_id}</dd></div>
                    <div><dt>Lot</dt><dd>{image.lot_id}</dd></div>
                    <div><dt>Wafer</dt><dd>{image.wafer_id}</dd></div>
                  </dl>
                  <p>{image.measurement_count}개 측정</p>
                </div>
              </Link>
              <button
                type="button"
                className="delete-image"
                data-testid="catalog-image-delete"
                aria-label={`${image.original_filename} 삭제`}
                onClick={() => setPending(image)}
              >
                삭제
              </button>
            </article>
          ))}
        </div>
      )}
      {pending && (
        <ConfirmDialog
          title={`'${pending.original_filename}'를 삭제할까요?`}
          body={pending.measurement_count > 0
            ? `저장된 측정 ${pending.measurement_count}개가 함께 삭제됩니다. 되돌릴 수 없습니다.`
            : "되돌릴 수 없습니다."}
          confirmLabel="이미지 삭제"
          busy={deleting}
          onConfirm={removeImage}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  );
}
