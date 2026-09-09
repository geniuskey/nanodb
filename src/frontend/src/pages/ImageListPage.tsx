import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type {
  ImageListView,
  SegmentationBatchResultView,
} from "../api/types";
import { useDocumentTitle } from "../ui/useDocumentTitle";
import { StatusBanner } from "../ui/StatusBanner";

type State = "loading" | "success" | "failure";

/** Sentinel for "no type filter"; every registered type is offered alongside. */
const ALL_TYPES = "ALL";

export function ImageListPage() {
  useDocumentTitle("이미지 목록");
  const [images, setImages] = useState<ImageListView[]>([]);
  const [state, setState] = useState<State>("loading");
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);
  const [productFilter, setProductFilter] = useState<string>(ALL_TYPES);
  // The image types and products to offer in the filters. Sourced from the
  // catalog so they grow as new values are registered, rather than a hard-coded
  // list.
  const [imageTypes, setImageTypes] = useState<string[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Batch auto-analysis: pick images, then run segmentation (and optionally
  // feature extraction) across all of them. Original files are never touched.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchFeatures, setBatchFeatures] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResult, setBatchResult] = useState<SegmentationBatchResultView | null>(null);

  // Debounce the free-text box so typing does not fire a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setActiveQuery(queryInput), 250);
    return () => clearTimeout(handle);
  }, [queryInput]);

  // Load the registered image types and products once for the filter
  // dropdowns. A failed load is not fatal: the filters still offer "전체".
  useEffect(() => {
    let active = true;
    api
      .getCatalog()
      .then((options) => {
        if (!active) return;
        setImageTypes(
          options
            .filter((option) => option.category === "image_type")
            .map((option) => option.value),
        );
        setProducts(
          options
            .filter((option) => option.category === "product_id")
            .map((option) => option.value),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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
        imageType: typeFilter === ALL_TYPES ? undefined : typeFilter,
        productId: productFilter === ALL_TYPES ? undefined : productFilter,
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
  }, [activeQuery, typeFilter, productFilter, attempt]);

  function toggleSelect(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBatch() {
    if (selected.size === 0 || batchRunning) return;
    setBatchRunning(true); setActionError(null); setStatus(null); setBatchResult(null);
    try {
      const result = await api.runSegmentationBatch({
        image_ids: [...selected],
        extract_features: batchFeatures,
      });
      setBatchResult(result);
      setStatus(
        `일괄 자동 분석 완료: 성공 ${result.succeeded}건 · 실패 ${result.failed}건`,
      );
      setSelected(new Set());
      // Measurement counts may have changed when features were extracted.
      setAttempt((current) => current + 1);
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : "일괄 자동 분석을 실행하지 못했습니다.",
      );
    } finally { setBatchRunning(false); }
  }

  const isFiltered =
    activeQuery.trim() !== "" ||
    typeFilter !== ALL_TYPES ||
    productFilter !== ALL_TYPES;

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
        <select
          className="type-filter"
          data-testid="image-type-filter"
          aria-label="이미지 종류 필터"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        >
          <option value={ALL_TYPES}>전체</option>
          {imageTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select
          className="type-filter"
          data-testid="product-filter"
          aria-label="Product 필터"
          value={productFilter}
          onChange={(event) => setProductFilter(event.target.value)}
        >
          <option value={ALL_TYPES}>전체 Product</option>
          {products.map((product) => (
            <option key={product} value={product}>
              {product}
            </option>
          ))}
        </select>
      </div>

      {state === "success" && images.length > 0 && (
        <div className="batch-bar" data-testid="batch-bar">
          <span data-testid="batch-selected-count">{selected.size}개 선택됨</span>
          <label className="batch-feature-toggle">
            <input
              type="checkbox"
              data-testid="batch-extract-features"
              checked={batchFeatures}
              onChange={(event) => setBatchFeatures(event.target.checked)}
            />
            자동 특징도 추출
          </label>
          <button
            type="button"
            className="button primary"
            data-testid="run-batch"
            disabled={selected.size === 0 || batchRunning}
            onClick={runBatch}
          >
            {batchRunning ? "처리 중…" : "선택 이미지 일괄 자동 분석"}
          </button>
        </div>
      )}
      {batchResult && (
        <div className="batch-result" data-testid="batch-result">
          <p>요청 {batchResult.requested}건 · 성공 {batchResult.succeeded}건 · 실패 {batchResult.failed}건</p>
          {batchResult.items.some((item) => item.status === "error") && (
            <ul data-testid="batch-errors">
              {batchResult.items
                .filter((item) => item.status === "error")
                .map((item) => (
                  <li key={item.image_id}>이미지 {item.image_id}: {item.message ?? item.code}</li>
                ))}
            </ul>
          )}
        </div>
      )}

      <StatusBanner message={status} />
      {actionError && <p role="alert">{actionError}</p>}
      {state === "loading" && (
        <>
          <p role="status">이미지를 불러오는 중입니다.</p>
          {/* Hold the grid's shape so the page does not jump when cards
              arrive (UIX-009). */}
          <div className="image-grid" aria-hidden="true" data-testid="catalog-skeleton">
            {[0, 1, 2, 3].map((slot) => (
              <div className="image-card skeleton-card" key={slot}>
                <span className="skeleton skeleton-thumb" />
                <div className="skeleton-lines">
                  <span className="skeleton skeleton-line" />
                  <span className="skeleton skeleton-line short" />
                  <span className="skeleton skeleton-line" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
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
              <label className="card-select">
                <input
                  type="checkbox"
                  data-testid="batch-select"
                  checked={selected.has(image.id)}
                  onChange={() => toggleSelect(image.id)}
                  aria-label={`${image.original_filename} 일괄 분석 선택`}
                />
              </label>
              <Link className="image-card" to={`/images/${image.id}`} data-testid="catalog-image-card">
                <img src={image.file_url} alt={`${image.original_filename} 미리보기`} width={180} height={150} loading="lazy" />
                <div>
                  <span className="badge">{image.image_type}</span>
                  <dl>
                    <div><dt>Product</dt><dd>{image.product_id}</dd></div>
                    <div><dt>Lot</dt><dd>{image.lot_id}</dd></div>
                    <div><dt>Wafer</dt><dd>{image.wafer_id}</dd></div>
                    {image.note && (
                      <div><dt>비고</dt><dd data-testid="catalog-image-note">{image.note}</dd></div>
                    )}
                  </dl>
                  <p>{image.measurement_count}개 측정</p>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
