import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type { ImageListView, ImageType } from "../api/types";

type State = "loading" | "success" | "failure";
type TypeFilter = "ALL" | ImageType;

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "SEM", label: "SEM" },
  { value: "TEM", label: "TEM" },
];

export function ImageListPage() {
  const [images, setImages] = useState<ImageListView[]>([]);
  const [state, setState] = useState<State>("loading");
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Debounce the free-text box so typing does not fire a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setActiveQuery(queryInput), 250);
    return () => clearTimeout(handle);
  }, [queryInput]);

  useEffect(() => {
    let active = true;
    setState("loading");
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
      .catch(() => active && setState("failure"));
    return () => {
      active = false;
    };
  }, [activeQuery, typeFilter]);

  async function removeImage(image: ImageListView) {
    if (deletingId !== null) return;
    const warning = image.measurement_count > 0
      ? `이미지 '${image.original_filename}'와 저장된 측정 ${image.measurement_count}개를 함께 삭제합니다. 되돌릴 수 없습니다.`
      : `이미지 '${image.original_filename}'를 삭제합니다. 되돌릴 수 없습니다.`;
    if (!window.confirm(warning)) return;
    setDeletingId(image.id); setActionError(null);
    try {
      await api.deleteImage(image.id);
      setImages((current) => current.filter((item) => item.id !== image.id));
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : "이미지를 삭제하지 못했습니다.");
    } finally { setDeletingId(null); }
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

      {actionError && <p role="alert">{actionError}</p>}
      {state === "loading" && <p role="status">이미지를 불러오는 중입니다.</p>}
      {state === "failure" && <p role="alert">이미지 목록을 불러오지 못했습니다.</p>}
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
        <div className="image-grid" data-testid="image-catalog">
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
                disabled={deletingId === image.id}
                onClick={() => removeImage(image)}
              >
                {deletingId === image.id ? "삭제 중…" : "삭제"}
              </button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
