import type { ApiErrorEnvelope, ImageListView, ImageView, SummaryView } from "./types";

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

export const api = {
  getSummary: () => request<SummaryView>("/api/summary"),
  listImages: () => request<ImageListView[]>("/api/images"),
  registerImage: (form: FormData) =>
    request<ImageView>("/api/images", { method: "POST", body: form }),
};
