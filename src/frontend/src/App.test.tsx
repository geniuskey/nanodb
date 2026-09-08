import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { App } from "./App";
import { jsonResponse, renderWithRouter } from "./test/helpers";

afterEach(() => vi.unstubAllGlobals());

it("provides branded accessible primary navigation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/images")) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse({
      image_count: 0,
      measurement_count: 0,
      calculated_at: "2026-09-08T04:00:00Z",
      parameters: [],
    }));
  }));

  renderWithRouter(<App />);

  expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "NANoDB 홈" })).toBeInTheDocument();
  expect(await screen.findByTestId("home-summary")).toHaveTextContent("0");
});

it("routes an unknown address to a recoverable not-found screen", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

  render(
    <MemoryRouter initialEntries={["/does-not-exist"]}>
      <App />
    </MemoryRouter>,
  );

  // Not a blank shell: the screen says what happened and where to go next.
  expect(await screen.findByTestId("not-found")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "이미지 목록" })).toBeInTheDocument();
  expect(document.title).toBe("찾을 수 없는 주소 · NANoDB");
});

it("offers a way past the header for keyboard users", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

  renderWithRouter(<App />);

  const skip = screen.getByRole("link", { name: "본문으로 건너뛰기" });
  expect(skip).toHaveAttribute("href", "#main-content");
  expect(document.getElementById("main-content")).not.toBeNull();
});

it("marks exactly one tab as the current location", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

  render(
    <MemoryRouter initialEntries={["/images/new"]}>
      <App />
    </MemoryRouter>,
  );

  // `/images/new` sits under `/images`, so both tabs would light up without
  // the explicit exclusion — two "current locations" at once.
  const active = document.querySelectorAll("nav .tab.active .tab-label");
  expect([...active].map((node) => node.textContent)).toEqual(["이미지 등록"]);
});
