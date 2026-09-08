import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithRouter } from "../test/helpers";
import { ImageListPage } from "./ImageListPage";

afterEach(() => vi.unstubAllGlobals());

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
    expect(card).toHaveTextContent("tem-09.png");
    expect(card).toHaveTextContent("2개 측정");
    expect(screen.getByRole("img")).toHaveAttribute("src", "/api/images/9/file");
  });

  it("does not disguise a request failure as empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    renderWithRouter(<ImageListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("불러오지 못했습니다");
    expect(screen.queryByText("등록된 이미지가 없습니다")).not.toBeInTheDocument();
  });
});
