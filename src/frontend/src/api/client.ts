import type {
  ApiErrorEnvelope,
  ImageDetailView,
  ImageListView,
  ImageView,
  MeasurementCreateInput,
  MeasurementView,
  SummaryView,
} from "./types";

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

async function contextDownload(imageId: number): Promise<Blob> {
  const response = await fetch(`/api/images/${imageId}/context-export`, {
    headers: { Accept: "application/zip" },
  });
  if (!response.ok) {
    let error: ApiErrorEnvelope = {
      code: "REQUEST_FAILED",
      message: "Context ZIP을 생성하지 못했습니다. 다시 시도해 주세요.",
    };
    try {
      error = (await response.json()) as ApiErrorEnvelope;
    } catch {
      // Keep the bounded fallback rather than downloading an error response.
    }
    throw new ApiError(error.code, error.message, error.detail?.field);
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/zip") {
    throw new ApiError(
      "INVALID_EXPORT_RESPONSE",
      "서버가 올바른 Context ZIP을 반환하지 않았습니다.",
    );
  }
  return response.blob();
}

export const api = {
  getSummary: () => request<SummaryView>("/api/summary"),
  listImages: () => request<ImageListView[]>("/api/images"),
  getImage: (imageId: number) => request<ImageDetailView>(`/api/images/${imageId}`),
  createMeasurement: (imageId: number, value: MeasurementCreateInput) =>
    request<MeasurementView>(`/api/images/${imageId}/measurements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
  registerImage: (form: FormData) =>
    request<ImageView>("/api/images", { method: "POST", body: form }),
  downloadContext: contextDownload,
};
