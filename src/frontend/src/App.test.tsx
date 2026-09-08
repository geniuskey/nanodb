import { screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { App } from "./App";
import { jsonResponse, renderWithRouter } from "./test/helpers";

afterEach(() => vi.unstubAllGlobals());

it("provides branded accessible primary navigation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
    image_count: 0,
    measurement_count: 0,
    calculated_at: "2026-09-08T04:00:00Z",
  })));

  renderWithRouter(<App />);

  expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "NANoDB 홈" })).toBeInTheDocument();
  expect(await screen.findByTestId("home-summary")).toHaveTextContent("0");
});
