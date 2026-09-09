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
        types: [
          { measurement_type: "length", unit: "nm", count: 5, mean: 15.5, min: 10, max: 21 },
          { measurement_type: "angle", unit: "deg", count: 2, mean: 30, min: 28, max: 32 },
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

    // Cross-image/type averages are gone: a single number over mixed
    // products and regions is not meaningful, so it is not shown.
    expect(summary).not.toHaveTextContent("길이 평균");
    expect(screen.queryByTestId("type-breakdown")).not.toBeInTheDocument();
  });

  it("plays a bundled intro video with no third-party embed", () => {
    stubApi({
      image_count: 0,
      measurement_count: 0,
      calculated_at: "2026-09-08T04:00:00Z",
      types: [],
    });

    renderWithRouter(<HomePage />);

    const video = screen.getByTestId("intro-video");
    expect(video.tagName).toBe("VIDEO");
    // The file ships with the build, so a demo machine with no network still
    // plays it and no viewer data leaves the host (HOM-040).
    expect(document.querySelector("iframe")).toBeNull();
    expect(video).toHaveAttribute("src");
    expect(video.getAttribute("src")).not.toContain("http");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("autoplay");
    expect(screen.getByTestId("video-caption")).toHaveTextContent(
      "영상 없이도 아래 내용만으로",
    );
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
      types: [],
    });

    renderWithRouter(<HomePage />);

    // The video stays on the page with its controls; only autoplay is dropped.
    const video = screen.getByTestId("intro-video");
    expect(video).not.toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("controls");
  });

  it("puts the only in-body links at the end of the usage flow", () => {
    stubApi({
      image_count: 0,
      measurement_count: 0,
      calculated_at: "2026-09-08T04:00:00Z",
      types: [],
    });

    renderWithRouter(<HomePage />);

    expect(screen.getByTestId("home-start-demo")).toHaveAttribute("href", "/demo");
    expect(screen.getByTestId("home-register-image")).toHaveAttribute("href", "/images/new");
    expect(screen.getByTestId("home-browse-images")).toHaveAttribute("href", "/images");
    // HOM-005: even with no images registered, the page's only in-body links are
    // these deliberate entry points -- the 1분 demo, plus register and browse.
    const links = [...document.querySelectorAll("main a[href^='/']")];
    expect(links).toHaveLength(3);
  });

  it("opens the measurement screen from a recent image card", async () => {
    stubApi(
      {
        image_count: 1,
        measurement_count: 0,
        calculated_at: "2026-09-08T04:00:00Z",
        types: [],
      },
      [
        {
          id: 42,
          original_filename: "wafer.png",
          image_type: "TEM",
          product_id: "P",
          lot_id: "L1",
          wafer_id: "W1",
          calibration_nm_per_pixel: 0.2,
          pixel_width: 100,
          pixel_height: 100,
          created_at: "2026-09-07T00:00:00Z",
          file_url: "/api/images/42/file",
          measurement_count: 0,
        },
      ],
    );

    renderWithRouter(<HomePage />);

    // The whole card is the link: a visible thumbnail that could not be opened
    // was the most confusing thing about this section.
    const card = await screen.findByTestId("recent-image-link");
    expect(card).toHaveAttribute("href", "/images/42");
    expect(card).toHaveTextContent("wafer.png");
  });

  it("names the screen in the document title", () => {
    stubApi({
      image_count: 0,
      measurement_count: 0,
      calculated_at: "2026-09-08T04:00:00Z",
      types: [],
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
    // The static argument survives a failed fetch; only measured numbers vanish.
    expect(screen.getByRole("heading", { name: "이렇게 쓰세요" })).toBeInTheDocument();
  });

  it("renders future phases as roadmap rather than links", async () => {
    stubApi({
      image_count: 0,
      measurement_count: 0,
      calculated_at: "2026-09-08T04:00:00Z",
      types: [],
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
