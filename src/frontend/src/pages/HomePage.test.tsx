import { fireEvent, screen, waitFor } from "@testing-library/react";
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

  it("embeds the autoplaying intro video at the top of the page", () => {
    stubApi({
      image_count: 0,
      measurement_count: 0,
      calculated_at: "2026-09-08T04:00:00Z",
      parameters: [],
    });

    renderWithRouter(<HomePage />);

    const frame = document.querySelector('iframe[title="NANoDB 소개 영상"]');
    expect(frame?.getAttribute("src")).toContain("youtube.com/embed/x1iTw_qvHB0");
    expect(frame?.getAttribute("src")).toContain("autoplay=1");
    expect(frame?.getAttribute("src")).toContain("mute=1");
    // The frame is always explained, so a blocked network leaves a labelled
    // area rather than an unexplained black box (HOM-040).
    expect(screen.getByTestId("video-caption")).toHaveTextContent("네트워크가 차단된 환경");
  });

  it("does not autoplay for a reduced-motion viewer", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })));
    stubApi({
      image_count: 0,
      measurement_count: 0,
      calculated_at: "2026-09-08T04:00:00Z",
      parameters: [],
    });

    renderWithRouter(<HomePage />);

    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByTestId("video-play")).toBeInTheDocument();
    // The video is still reachable, just on the viewer's terms.
    fireEvent.click(screen.getByTestId("video-play"));
    expect(document.querySelector('iframe[title="NANoDB 소개 영상"]')).not.toBeNull();
  });

  it("puts the only in-body links at the end of the usage flow", () => {
    stubApi({
      image_count: 0,
      measurement_count: 0,
      calculated_at: "2026-09-08T04:00:00Z",
      parameters: [],
    });

    renderWithRouter(<HomePage />);

    expect(screen.getByTestId("home-register-image")).toHaveAttribute("href", "/images/new");
    expect(screen.getByTestId("home-browse-images")).toHaveAttribute("href", "/images");
    // HOM-005: those two are the whole set. Nothing else in the body navigates.
    const links = [...document.querySelectorAll("main a[href^='/']")];
    expect(links).toHaveLength(2);
  });

  it("names the screen in the document title", () => {
    stubApi({
      image_count: 0,
      measurement_count: 0,
      calculated_at: "2026-09-08T04:00:00Z",
      parameters: [],
    });

    renderWithRouter(<HomePage />);

    expect(document.title).toBe("홈 · NANoDB");
  });

  it("offers a retry when the data cannot be loaded", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    renderWithRouter(<HomePage />);

    const retry = await screen.findByTestId("retry-images");
    const before = fetchMock.mock.calls.length;
    fireEvent.click(retry);

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
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
