import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithRouter } from "../test/helpers";
import { DemoRegisterPage } from "./DemoRegisterPage";

afterEach(() => vi.unstubAllGlobals());

const listItem = {
  id: 7,
  original_filename: "wafer-07.png",
  image_type: "TEM",
  product_id: "P1",
  lot_id: "L1",
  wafer_id: "W1",
  process_step: "Gate Etch",
  note: null,
  calibration_nm_per_pixel: 0.25,
  pixel_width: 512,
  pixel_height: 384,
  created_at: "2026-09-07T00:00:00Z",
  file_url: "/api/images/7/file",
  measurement_count: 0,
};

const detail = { ...listItem, measurements: [] };

const segResult = {
  image_id: 7,
  method: "chan-vese",
  classes: 3,
  denoise_weight: 0.1,
  min_size: 64,
  thresholds: [0.31, 0.62],
  class_stats: [
    { class_index: 0, intensity_range: [0, 0.31], pixels: 6000, area_fraction: 0.6, mean_intensity: 0.18, area_nm2: 375 },
    { class_index: 1, intensity_range: [0.31, 0.62], pixels: 3000, area_fraction: 0.3, mean_intensity: 0.47, area_nm2: null },
    { class_index: 2, intensity_range: [0.62, 1], pixels: 1000, area_fraction: 0.1, mean_intensity: 0.8, area_nm2: null },
  ],
  duration_ms: 42,
  downscaled: false,
  has_tagged_tiff: true,
  map_url: "/api/images/7/segmentation/map",
  boundary_url: "/api/images/7/segmentation/boundary",
  created_at: "2026-09-08T04:00:00Z",
  replaced: false,
};

const featResult = {
  image_id: 7,
  target_class: 0,
  region_area_px: 5000,
  region_clipped: false,
  measurements: [
    { id: 9, measurement_type: "length", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    { id: 10, measurement_type: "curvature", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }] },
  ],
  skipped: [],
  preserved_adjusted: 0,
};

function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/images")) return Promise.resolve(jsonResponse([listItem]));
      if (url.includes("/segmentation") && method === "POST") return Promise.resolve(jsonResponse(segResult));
      if (url.includes("/features") && method === "POST") return Promise.resolve(jsonResponse(featResult));
      if (url.includes("/api/images/7")) return Promise.resolve(jsonResponse(detail));
      return Promise.resolve(jsonResponse({}));
    }),
  );
}

describe("DemoRegisterPage", () => {
  it("opens on the pick tab and lists existing images", async () => {
    stubApi();
    renderWithRouter(<DemoRegisterPage />);

    expect(screen.getByTestId("demo-tab-pick")).toHaveAttribute("aria-selected", "true");
    // The analysis tabs are locked until a photo is chosen.
    expect(screen.getByTestId("demo-tab-segment")).toBeDisabled();
    expect(screen.getByTestId("demo-tab-measure")).toBeDisabled();

    const options = await screen.findAllByTestId("demo-image-option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("wafer-07.png");
  });

  it("runs the pipeline, showing the segmentation histogram then auto measurements", async () => {
    stubApi();
    renderWithRouter(<DemoRegisterPage />);

    const option = await screen.findByTestId("demo-image-option");
    await userEvent.click(option);

    // Picking a photo advances to the segmentation tab and fills the properties.
    await waitFor(() =>
      expect(screen.getByTestId("demo-tab-segment")).toHaveAttribute("aria-selected", "true"),
    );
    const props = screen.getByTestId("demo-properties");
    expect(props).toHaveTextContent("wafer-07.png");
    expect(props).toHaveTextContent("Gate Etch");
    expect(props).toHaveTextContent("512 × 384 px");

    // All three pipeline steps finish.
    await waitFor(() => expect(screen.getByTestId("demo-step-features")).toHaveClass("done"));
    expect(screen.getByTestId("demo-step-detail")).toHaveClass("done");
    expect(screen.getByTestId("demo-step-segment")).toHaveClass("done");

    // Segmentation output: the class map, the brightness/threshold histogram
    // that explains the criterion, and a bar per class in the area histogram.
    expect(screen.getByTestId("demo-segmentation-map")).toHaveAttribute(
      "src",
      "/api/images/7/segmentation/map",
    );
    expect(screen.getByTestId("demo-intensity-histogram")).toBeInTheDocument();
    expect(screen.getByTestId("demo-intensity-histogram")).toHaveTextContent("0.31");
    const bars = screen.getAllByTestId("demo-histogram-bar");
    expect(bars).toHaveLength(3);
    expect(within(bars[0]).getByText("60.0%")).toBeInTheDocument();

    // The demo then advances itself to the measurement tab (after the dwell).
    await waitFor(
      () => expect(screen.getByTestId("demo-tab-measure")).toHaveAttribute("aria-selected", "true"),
      { timeout: 6000 },
    );

    // The auto measurements are broken down by kind (length / curvature).
    const summary = screen.getByTestId("demo-feature-summary");
    expect(summary).toHaveTextContent("자동 측정 2개");
    expect(summary).toHaveTextContent("길이 1 · 곡률 1");

    // Once every shape is drawn, a link leads to the full measurement screen.
    await waitFor(
      () => expect(screen.getByTestId("demo-open-image")).toHaveAttribute("href", "/images/7"),
      { timeout: 6000 },
    );
  });

  it("names the screen in the document title", async () => {
    stubApi();
    renderWithRouter(<DemoRegisterPage />);
    await screen.findByTestId("demo-image-option");
    expect(document.title).toBe("이미지 등록 데모 · NANoDB");
  });
});
