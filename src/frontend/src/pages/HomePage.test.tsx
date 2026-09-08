import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithRouter } from "../test/helpers";
import { HomePage } from "./HomePage";

afterEach(() => vi.unstubAllGlobals());

describe("HomePage", () => {
  it("shows loading then actual summary and implemented CTAs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      image_count: 3,
      measurement_count: 7,
      calculated_at: "2026-09-08T04:00:00Z",
    })));

    renderWithRouter(<HomePage />);
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
    expect(await screen.findByTestId("home-summary")).toHaveTextContent("3");
    expect(screen.getByTestId("home-summary")).toHaveTextContent("7");
    expect(screen.getByTestId("home-browse-images")).toHaveAttribute("href", "/images");
    expect(screen.getByTestId("home-register-image")).toHaveAttribute("href", "/images/new");
  });

  it("shows a text failure without example KPI values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    renderWithRouter(<HomePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("불러오지 못했습니다");
    expect(screen.queryByTestId("home-summary")).not.toBeInTheDocument();
  });

  it("labels future features as roadmap rather than links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      image_count: 0,
      measurement_count: 0,
      calculated_at: "2026-09-08T04:00:00Z",
    })));

    renderWithRouter(<HomePage />);
    await waitFor(() => expect(screen.getByTestId("home-summary")).toBeInTheDocument());

    const roadmap = screen.getByRole("heading", { name: "후속 로드맵" }).parentElement;
    expect(roadmap).toHaveTextContent("자동 측정");
    expect(roadmap?.querySelector("a")).toBeNull();
  });
});
