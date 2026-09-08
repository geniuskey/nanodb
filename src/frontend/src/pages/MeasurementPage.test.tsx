import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse } from "../test/helpers";
import { MeasurementPage } from "./MeasurementPage";

const detail = {
  id: 1,
  original_filename: "sample.png",
  image_type: "TEM",
  product_id: "P1",
  lot_id: "L1",
  wafer_id: "W1",
  calibration_nm_per_pixel: 0.2,
  pixel_width: 1000,
  pixel_height: 800,
  created_at: "2026-09-08T04:00:00Z",
  file_url: "/api/images/1/file",
  measurements: [{
    id: 1,
    image_id: 1,
    parameter_type: "CD",
    start_x: 100,
    start_y: 100,
    end_x: 400,
    end_y: 500,
    distance_px: 500,
    calibration_nm_per_pixel: 0.2,
    value_nm: 100,
    note: "saved",
    measurement_method: "manual_two_point",
    reference_status: "unreviewed",
    created_at: "2026-09-08T04:00:00Z",
  }],
};

afterEach(() => vi.unstubAllGlobals());

function renderPage(fetchMock = vi.fn().mockResolvedValue(jsonResponse(detail))) {
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/images/1"]}>
      <Routes><Route path="/images/:imageId" element={<MeasurementPage />} /></Routes>
    </MemoryRouter>,
  );
  return fetchMock;
}

async function preparedImage() {
  const image = await screen.findByTestId("measurement-image");
  Object.defineProperty(image, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
  });
  fireEvent.load(image);
  return image;
}

describe("MeasurementPage", () => {
  it("previews two points and ignores a third until reset", async () => {
    renderPage();
    const image = await preparedImage();
    fireEvent.click(image, { clientX: 100, clientY: 100 });
    fireEvent.click(image, { clientX: 400, clientY: 500 });
    fireEvent.click(image, { clientX: 10, clientY: 10 });

    expect(screen.getByTestId("measurement-preview")).toHaveTextContent("500.00px · 100.00nm");
    expect(screen.getByTestId("measurement-save")).toBeEnabled();
  });

  it("reset clears only the draft and preserves saved measurements", async () => {
    renderPage();
    const image = await preparedImage();
    fireEvent.click(image, { clientX: 100, clientY: 100 });
    fireEvent.click(image, { clientX: 400, clientY: 500 });
    await userEvent.click(screen.getByTestId("measurement-reset"));

    expect(screen.queryByTestId("measurement-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("measurement-save")).toBeDisabled();
    expect(screen.getByTestId("saved-measurement-item")).toHaveTextContent("100.00nm");
  });

  it("links saved-list selection to overlay highlight", async () => {
    renderPage();
    await preparedImage();
    await userEvent.click(screen.getByTestId("saved-measurement-item"));

    const selectedLine = document.querySelector('g[data-measurement-id="1"] line');
    expect(selectedLine).toHaveClass("selected");
    expect(screen.getByTestId("saved-measurement-item")).toHaveClass("selected");
  });

  it("uses the server result after saving and clears the draft", async () => {
    const created = { ...detail.measurements[0], id: 2, value_nm: 101 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(jsonResponse(created, 201));
    renderPage(fetchMock);
    const image = await preparedImage();
    fireEvent.click(image, { clientX: 100, clientY: 100 });
    fireEvent.click(image, { clientX: 400, clientY: 500 });
    await userEvent.click(screen.getByTestId("measurement-save"));

    await waitFor(() => expect(screen.getAllByTestId("saved-measurement-item")).toHaveLength(2));
    expect(screen.getAllByTestId("saved-measurement-item")[0]).toHaveTextContent("101.00nm");
    expect(screen.queryByTestId("measurement-preview")).not.toBeInTheDocument();
  });

  it("keeps a valid draft visible when server save fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(jsonResponse({ code: "STORAGE_FAILED", message: "저장하지 못했습니다." }, 500));
    renderPage(fetchMock);
    const image = await preparedImage();
    fireEvent.click(image, { clientX: 100, clientY: 100 });
    fireEvent.click(image, { clientX: 400, clientY: 500 });
    await userEvent.click(screen.getByTestId("measurement-save"));

    expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했습니다");
    expect(screen.getByTestId("measurement-preview")).toBeInTheDocument();
  });
});
