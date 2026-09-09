import type {
  ApiErrorEnvelope,
  CatalogCreateInput,
  CatalogOption,
  CatalogUpdateInput,
  ImageDetailView,
  ImageListView,
  ImageType,
  ImageUpdateInput,
  ImageView,
  MeasurementAnnotationInput,
  MeasurementGeometryInput,
  MeasurementCreateInput,
  MeasurementItemCreateInput,
  MeasurementItemUpdateInput,
  MeasurementItemView,
  MeasurementView,
  FeatureExtractionInput,
  FeatureExtractionResultView,
  SegmentationResultView,
  SegmentationRunInput,
  SummaryView,
} from "./types";

export interface ImageListQuery {
  q?: string;
  imageType?: ImageType;
  productId?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) {
    let error: ApiErrorEnvelope = {
      code: "REQUEST_FAILED",
      message: "요청을 완료하지 못했습니다. 다시 시도해 주세요.",
    };
    try {
      error = (await response.json()) as ApiErrorEnvelope;
    } catch {
      // Keep the bounded fallback rather than exposing response internals.
    }
    throw new ApiError(error.code, error.message, error.detail?.field);
  }
  return (await response.json()) as T;
}

async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) {
    let error: ApiErrorEnvelope = {
      code: "REQUEST_FAILED",
      message: "요청을 완료하지 못했습니다. 다시 시도해 주세요.",
    };
    try {
      error = (await response.json()) as ApiErrorEnvelope;
    } catch {
      // Keep the bounded fallback rather than exposing response internals.
    }
    throw new ApiError(error.code, error.message, error.detail?.field);
  }
  // 204 No Content: nothing to parse.
}

export const api = {
  getSummary: () => request<SummaryView>("/api/summary"),
  listImages: (filter?: ImageListQuery) => {
    const search = new URLSearchParams();
    if (filter?.q?.trim()) search.set("q", filter.q.trim());
    if (filter?.imageType) search.set("image_type", filter.imageType);
    if (filter?.productId) search.set("product_id", filter.productId);
    const qs = search.toString();
    return request<ImageListView[]>(`/api/images${qs ? `?${qs}` : ""}`);
  },
  getImage: (imageId: number) => request<ImageDetailView>(`/api/images/${imageId}`),
  updateImage: (imageId: number, value: ImageUpdateInput) =>
    request<ImageView>(`/api/images/${imageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
  createMeasurement: (imageId: number, value: MeasurementCreateInput) =>
    request<MeasurementView>(`/api/images/${imageId}/measurements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
  updateMeasurementAnnotation: (
    imageId: number,
    measurementId: number,
    value: MeasurementAnnotationInput,
  ) =>
    request<MeasurementView>(`/api/images/${imageId}/measurements/${measurementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
  // Correcting the geometry is a separate call from the annotation: it moves
  // evidence, the server revalues it, and the first correction preserves what
  // the measurement was produced with.
  updateMeasurementGeometry: (
    imageId: number,
    measurementId: number,
    value: MeasurementGeometryInput,
  ) =>
    request<MeasurementView>(
      `/api/images/${imageId}/measurements/${measurementId}/geometry`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      },
    ),
  revertMeasurementGeometry: (imageId: number, measurementId: number) =>
    request<MeasurementView>(
      `/api/images/${imageId}/measurements/${measurementId}/geometry/reset`,
      { method: "POST" },
    ),
  deleteMeasurement: (imageId: number, measurementId: number) =>
    requestVoid(`/api/images/${imageId}/measurements/${measurementId}`, {
      method: "DELETE",
    }),
  deleteImage: (imageId: number) =>
    requestVoid(`/api/images/${imageId}`, { method: "DELETE" }),
  registerImage: (form: FormData) =>
    request<ImageView>("/api/images", { method: "POST", body: form }),
  getCatalog: () => request<CatalogOption[]>("/api/catalog"),
  createCatalogOption: (value: CatalogCreateInput) =>
    request<CatalogOption>("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
  updateCatalogOption: (optionId: number, value: CatalogUpdateInput) =>
    request<CatalogOption>(`/api/catalog/${optionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
  deleteCatalogOption: (optionId: number) =>
    requestVoid(`/api/catalog/${optionId}`, { method: "DELETE" }),
  listMeasurementItems: (productId: string) => {
    const search = new URLSearchParams({ product_id: productId });
    return request<MeasurementItemView[]>(`/api/measurement-items?${search}`);
  },
  createMeasurementItem: (value: MeasurementItemCreateInput) =>
    request<MeasurementItemView>("/api/measurement-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
  updateMeasurementItem: (itemId: number, value: MeasurementItemUpdateInput) =>
    request<MeasurementItemView>(`/api/measurement-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
  deleteMeasurementItem: (itemId: number) =>
    requestVoid(`/api/measurement-items/${itemId}`, { method: "DELETE" }),
  getSegmentation: (imageId: number) =>
    request<SegmentationResultView>(`/api/images/${imageId}/segmentation`),
  runSegmentation: (imageId: number, value?: SegmentationRunInput) =>
    request<SegmentationResultView>(`/api/images/${imageId}/segmentation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value ?? {}),
    }),
  extractFeatures: (imageId: number, value?: FeatureExtractionInput) =>
    request<FeatureExtractionResultView>(`/api/images/${imageId}/features`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value ?? {}),
    }),
};
