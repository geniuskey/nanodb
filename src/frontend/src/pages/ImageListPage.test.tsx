import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithRouter } from "../test/helpers";
import { ImageListPage } from "./ImageListPage";

afterEach(() => vi.unstubAllGlobals());

function urlsOf(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

const sampleImage = {
  id: 9,
  original_filename: "tem-09.png",
  image_type: "TEM",
  product_id: "P9",
  lot_id: "L9",
  wafer_id: "W9",
  calibration_nm_per_pixel: 0.2,
  pixel_width: 1000,
  pixel_height: 800,
  created_at: "2026-09-08T04:00:00Z",
  file_url: "/api/images/9/file",
  measurement_count: 2,
};

describe("ImageListPage", () => {
  it("shows an explicit empty state and registration action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    renderWithRouter(<ImageListPage />);

    expect(await screen.findByText("등록된 이미지가 없습니다")).toBeInTheDocument();
    expect(screen.getByTestId("catalog-register-image")).toHaveAttribute("href", "/images/new");
  });

  it("shows image metadata and stored measurement count", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{
      id: 9,
      original_filename: "tem-09.png",
      image_type: "TEM",
      product_id: "P9",
      lot_id: "L9",
      wafer_id: "W9",
      note: "재촬영 필요",
      calibration_nm_per_pixel: 0.2,
      pixel_width: 1000,
      pixel_height: 800,
      created_at: "2026-09-08T04:00:00Z",
      file_url: "/api/images/9/file",
      measurement_count: 2,
    }])));

    renderWithRouter(<ImageListPage />);

    const card = await screen.findByTestId("catalog-image-card");
    expect(card).toHaveAttribute("href", "/images/9");
    expect(card).toHaveTextContent("2개 측정");
    // The filename is no longer shown as a card title; it survives only as the
    // thumbnail's alt text.
    expect(screen.queryByRole("heading", { name: "tem-09.png" })).not.toBeInTheDocument();
    // A note (비고) shows under the Wafer row when present.
    expect(screen.getByTestId("catalog-image-note")).toHaveTextContent("재촬영 필요");
    expect(screen.getByRole("img")).toHaveAttribute("src", "/api/images/9/file");
  });

  it("omits the 비고 row when an image has no note", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([sampleImage])));

    renderWithRouter(<ImageListPage />);

    await screen.findByTestId("catalog-image-card");
    expect(screen.queryByTestId("catalog-image-note")).not.toBeInTheDocument();
  });

  it("does not disguise a request failure as empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    renderWithRouter(<ImageListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("불러오지 못했습니다");
    expect(screen.queryByText("등록된 이미지가 없습니다")).not.toBeInTheDocument();
  });

  it("passes the search text as a q query parameter", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));
    vi.stubGlobal("fetch", fetchMock);

    renderWithRouter(<ImageListPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("image-search-input"), {
      target: { value: "lot42" },
    });

    await waitFor(() =>
      expect(urlsOf(fetchMock).some((url) => url.includes("q=lot42"))).toBe(true),
    );
  });

  it("narrows by image type via the image_type query parameter", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));
    vi.stubGlobal("fetch", fetchMock);

    renderWithRouter(<ImageListPage />);
    fireEvent.click(await screen.findByTestId("filter-sem"));

    await waitFor(() =>
      expect(urlsOf(fetchMock).some((url) => url.includes("image_type=SEM"))).toBe(true),
    );
  });

  it("offers no delete control on a card; deletion lives on the image page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([sampleImage])));

    renderWithRouter(<ImageListPage />);

    const card = await screen.findByTestId("catalog-image-card");
    // The card is a single link to the image page -- no per-card delete button.
    expect(card).toHaveAttribute("href", "/images/9");
    expect(screen.queryByTestId("catalog-image-delete")).not.toBeInTheDocument();
  });

  it("shows the image type as a badge", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([sampleImage])));

    renderWithRouter(<ImageListPage />);

    const card = await screen.findByTestId("catalog-image-card");
    expect(within(card).getByText("TEM")).toHaveClass("badge");
  });

  it("reports the result count and keeps results visible while refetching", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse([sampleImage])),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderWithRouter(<ImageListPage />);
    expect(await screen.findByTestId("catalog-count")).toHaveTextContent(
      "등록된 이미지 1건",
    );

    fireEvent.click(screen.getByTestId("filter-sem"));

    // The previous card stays on screen through the refetch instead of the
    // page blanking back to its loading state.
    expect(screen.getByTestId("catalog-image-card")).toBeInTheDocument();
    expect(screen.queryByText("이미지를 불러오는 중입니다.")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("catalog-count")).toHaveTextContent(
        "조건에 맞는 이미지 1건",
      ),
    );
  });

  it("reserves the grid while the first load is in flight", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => undefined)));

    renderWithRouter(<ImageListPage />);

    // Placeholders hold the layout, and they are decorative only.
    const skeleton = await screen.findByTestId("catalog-skeleton");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  });

  it("offers a retry when the catalog cannot be loaded", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    renderWithRouter(<ImageListPage />);

    const retry = await screen.findByTestId("retry-catalog");
    const before = fetchMock.mock.calls.length;
    fireEvent.click(retry);

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });

  it("runs batch auto-analysis over the selected images and forwards the feature flag", async () => {
    const batchResult = {
      requested: 1,
      succeeded: 1,
      failed: 0,
      items: [{ image_id: 9, status: "ok", replaced: false, feature_count: 4, skipped_count: 1, code: null, message: null }],
    };
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/api/segmentation/batch")) {
        return Promise.resolve(jsonResponse(batchResult));
      }
      return Promise.resolve(jsonResponse([sampleImage]));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithRouter(<ImageListPage />);
    fireEvent.click(await screen.findByTestId("batch-select"));
    fireEvent.click(screen.getByTestId("batch-extract-features"));
    expect(screen.getByTestId("batch-selected-count")).toHaveTextContent("1개 선택됨");
    fireEvent.click(screen.getByTestId("run-batch"));

    await waitFor(() =>
      expect(screen.getByTestId("batch-result")).toHaveTextContent("성공 1건"),
    );
    const batchCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/api/segmentation/batch"));
    expect(batchCall).toBeTruthy();
    expect(JSON.parse(batchCall![1]!.body as string)).toEqual({
      image_ids: [9],
      extract_features: true,
    });
    expect(screen.getByTestId("status-banner")).toHaveTextContent("일괄 자동 분석 완료");
  });

  it("keeps the batch action disabled until an image is selected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([sampleImage])));

    renderWithRouter(<ImageListPage />);

    expect(await screen.findByTestId("run-batch")).toBeDisabled();
  });

  it("lists per-image errors from a partial batch failure", async () => {
    const batchResult = {
      requested: 1,
      succeeded: 0,
      failed: 1,
      items: [{ image_id: 9, status: "error", replaced: false, feature_count: null, skipped_count: null, code: "SEGMENTATION_FAILED", message: "세그멘테이션 실패" }],
    };
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes("/api/segmentation/batch")) {
        return Promise.resolve(jsonResponse(batchResult));
      }
      return Promise.resolve(jsonResponse([sampleImage]));
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithRouter(<ImageListPage />);
    fireEvent.click(await screen.findByTestId("batch-select"));
    fireEvent.click(screen.getByTestId("run-batch"));

    await waitFor(() =>
      expect(screen.getByTestId("batch-errors")).toHaveTextContent("이미지 9: 세그멘테이션 실패"),
    );
  });

  it("distinguishes a filtered empty result from an empty catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([]))));

    renderWithRouter(<ImageListPage />);
    fireEvent.click(await screen.findByTestId("filter-tem"));

    expect(await screen.findByText("조건에 맞는 이미지가 없습니다")).toBeInTheDocument();
  });
});
