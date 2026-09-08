import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithRouter } from "../test/helpers";
import { HomePage } from "./HomePage";

afterEach(() => vi.unstubAllGlobals());

function stubApi(summary: unknown, images: unknown = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/images")) return Promise.resolve(jsonResponse(images));
      return Promise.resolve(jsonResponse(summary));
    }),
  );
}

describe("HomePage", () => {
  it("shows loading then only real measured KPI values", async () => {
    stubApi(
      {
        image_count: 3,
        measurement_count: 7,
        calculated_at: "2026-09-08T04:00:00Z",
        parameters: [
          { parameter_type: "CD", count: 5, mean_nm: 15.5, min_nm: 10, max_nm: 21 },
          { parameter_type: "Depth", count: 2, mean_nm: 30, min_nm: 28, max_nm: 32 },
        ],
      },
      [
        {
          id: 1,
          original_filename: "wafer.png",
          image_type: "SEM",
          product_id: "P",
          lot_id: "L1",
          wafer_id: "W1",
          calibration_nm_per_pixel: 0.2,
          pixel_width: 100,
          pixel_height: 100,
          created_at: "2026-09-07T00:00:00Z",
          file_url: "/api/images/1/file",
          measurement_count: 5,
        },
      ],
    );

    renderWithRouter(<HomePage />);
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");

    const summary = await screen.findByTestId("home-summary");
    expect(summary).toHaveTextContent("3");
    expect(summary).toHaveTextContent("7");
    expect(summary).toHaveTextContent("15.50");
    expect(summary).toHaveTextContent("CD 평균");

    // Full per-parameter breakdown with min/max, not just the top-2 tiles.
    const breakdown = screen.getByTestId("param-breakdown");
    expect(breakdown).toHaveTextContent("최소");
    expect(breakdown).toHaveTextContent("10.00");
    expect(breakdown).toHaveTextContent("21.00");
  });

  it("shows a text failure without example KPI values but keeps static sections", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    renderWithRouter(<HomePage />);

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((el) => el.textContent?.includes("불러오지 못했습니다"))).toBe(true);
    expect(screen.queryByTestId("home-summary")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "왜 지금인가" })).toBeInTheDocument();
  });

  it("renders future phases as roadmap rather than links", async () => {
    stubApi({
      image_count: 0,
      measurement_count: 0,
      calculated_at: "2026-09-08T04:00:00Z",
      parameters: [],
    });

    renderWithRouter(<HomePage />);
    await waitFor(() => expect(screen.getByTestId("home-summary")).toBeInTheDocument());

    const phases = screen.getByRole("heading", {
      name: "NANoDB가 가는 길, Phase 1에서 4까지",
    }).parentElement;
    expect(phases).toHaveTextContent("로드맵");
    expect(phases).toHaveTextContent("제안한다");
    expect(phases?.querySelector("a")).toBeNull();
  });
});
