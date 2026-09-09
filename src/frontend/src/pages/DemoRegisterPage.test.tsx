import { screen, waitFor } from "@testing-library/react";
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
  thresholds: [80, 160],
  class_stats: [],
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
  measurements: [{ id: 9 }, { id: 10 }],
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
  it("lists existing images to pick from", async () => {
    stubApi();
    renderWithRouter(<DemoRegisterPage />);

    const options = await screen.findAllByTestId("demo-image-option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("wafer-07.png");
  });

  it("fills the properties and runs the analysis pipeline on the picked image", async () => {
    stubApi();
    renderWithRouter(<DemoRegisterPage />);

    const option = await screen.findByTestId("demo-image-option");
    await userEvent.click(option);

    // Properties are filled from the selected image.
    const props = await screen.findByTestId("demo-properties");
    expect(props).toHaveTextContent("wafer-07.png");
    expect(props).toHaveTextContent("Gate Etch");
    expect(props).toHaveTextContent("512 × 384 px");

    // The three pipeline steps all finish.
    await waitFor(() => expect(screen.getByTestId("demo-step-features")).toHaveClass("done"));
    expect(screen.getByTestId("demo-step-detail")).toHaveClass("done");
    expect(screen.getByTestId("demo-step-segment")).toHaveClass("done");

    // Segmentation output and the auto-measurement count are shown.
    expect(screen.getByTestId("demo-segmentation-map")).toHaveAttribute(
      "src",
      "/api/images/7/segmentation/map",
    );
    expect(screen.getByTestId("demo-feature-summary")).toHaveTextContent("자동 측정 2개");

    // A link leads to the full measurement screen for the analysed image.
    expect(screen.getByTestId("demo-open-image")).toHaveAttribute("href", "/images/7");
  });

  it("names the screen in the document title", async () => {
    stubApi();
    renderWithRouter(<DemoRegisterPage />);
    await screen.findByTestId("demo-image-option");
    expect(document.title).toBe("이미지 등록 데모 · NANoDB");
  });
});
