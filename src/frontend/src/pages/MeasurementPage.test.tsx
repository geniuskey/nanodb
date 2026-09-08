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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

// Drag a shape across the annotation overlay. jsdom's pointer-capture rejects
// unknown pointer ids, so neutralise it before dispatching pointer events.
function dragShape(from: { x: number; y: number }, to: { x: number; y: number }) {
  const overlay = screen.getByTestId("annotation-overlay");
  Object.defineProperty(overlay, "setPointerCapture", { value: () => undefined, configurable: true });
  fireEvent.pointerDown(overlay, { clientX: from.x, clientY: from.y, pointerId: 1 });
  fireEvent.pointerMove(overlay, { clientX: to.x, clientY: to.y, pointerId: 1 });
  fireEvent.pointerUp(overlay, { clientX: to.x, clientY: to.y, pointerId: 1 });
}

const createdAnnotation = {
  id: 10,
  image_id: 1,
  kind: "arrow",
  start_x: 100,
  start_y: 100,
  end_x: 400,
  end_y: 500,
  product: null,
  step: "",
  measurement_name: "",
  created_at: "2026-09-08T05:00:00Z",
};

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

  it("removes a saved measurement after confirmation and disables export", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    renderPage(fetchMock);
    await preparedImage();
    expect(screen.getByTestId("saved-measurement-item")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("delete-measurement"));

    await waitFor(() =>
      expect(screen.queryByTestId("saved-measurement-item")).not.toBeInTheDocument(),
    );
    const [path, init] = fetchMock.mock.calls[1];
    expect(String(path)).toBe("/api/images/1/measurements/1");
    expect(init).toMatchObject({ method: "DELETE" });
    expect(screen.getByTestId("context-export-button")).toBeDisabled();
  });

  it("keeps the measurement when deletion is not confirmed", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    const fetchMock = renderPage();
    await preparedImage();

    await userEvent.click(screen.getByTestId("delete-measurement"));

    expect(screen.getByTestId("saved-measurement-item")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial getImage
  });

  it("surfaces a delete failure without dropping the measurement", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(
        jsonResponse({ code: "STORAGE_FAILED", message: "삭제하지 못했습니다." }, 500),
      );
    renderPage(fetchMock);
    await preparedImage();

    await userEvent.click(screen.getByTestId("delete-measurement"));

    expect(await screen.findByRole("alert")).toHaveTextContent("삭제하지 못했습니다");
    expect(screen.getByTestId("saved-measurement-item")).toBeInTheDocument();
  });

  it("deletes the image and returns to the catalog", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MemoryRouter initialEntries={["/images/1"]}>
        <Routes>
          <Route path="/images/:imageId" element={<MeasurementPage />} />
          <Route path="/images" element={<p>catalog</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByTestId("measurement-image");

    await userEvent.click(screen.getByTestId("detail-image-delete"));

    expect(await screen.findByText("catalog")).toBeInTheDocument();
    const [path, init] = fetchMock.mock.calls[1];
    expect(String(path)).toBe("/api/images/1");
    expect(init).toMatchObject({ method: "DELETE" });
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

  it("discloses included data, image exclusion and the manual transfer boundary", async () => {
    renderPage();
    await screen.findByTestId("measurement-image");

    expect(screen.getByText(/Product ID, Lot ID, Wafer ID, 원본 파일명, 저장된 측정과 메모/)).toBeInTheDocument();
    expect(screen.getByText(/제외: 이미지 바이너리/)).toBeInTheDocument();
    expect(screen.getByText(/자동으로 외부에 전송하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByTestId("context-export-button")).toBeEnabled();
  });

  it("disables export and explains why when no measurements are saved", async () => {
    renderPage(vi.fn().mockResolvedValue(jsonResponse({ ...detail, measurements: [] })));

    expect(await screen.findByTestId("context-export-button")).toBeDisabled();
    expect(screen.getByTestId("context-export-disabled-reason")).toHaveTextContent("측정이 하나 이상");
  });

  it("downloads one successful ZIP and blocks duplicate export requests", async () => {
    let resolveExport!: (response: Response) => void;
    const exportResponse = new Promise<Response>((resolve) => { resolveExport = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockReturnValueOnce(exportResponse);
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:nanodb-export");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage(fetchMock);
    const button = await screen.findByTestId("context-export-button");

    await userEvent.click(button);
    await userEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(button).toBeDisabled();

    resolveExport(new Response("PKzip", { headers: { "Content-Type": "application/zip" } }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:nanodb-export");
    expect(button).toBeEnabled();
  });

  it("shows an error envelope without downloading it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(jsonResponse({ code: "EXPORT_FAILED", message: "ZIP을 생성하지 못했습니다." }, 500));
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage(fetchMock);

    await userEvent.click(await screen.findByTestId("context-export-button"));

    expect(await screen.findByRole("alert")).toHaveTextContent("ZIP을 생성하지 못했습니다");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("renders existing annotations loaded with the image detail", async () => {
    renderPage(vi.fn().mockResolvedValue(jsonResponse({
      ...detail,
      annotations: [
        { ...createdAnnotation, id: 7, product: "DRAM", step: "S1", measurement_name: "게이트" },
        { ...createdAnnotation, id: 8, kind: "circle", product: "Sensor", step: "S2", measurement_name: "홀" },
      ],
    })));
    await preparedImage();

    const rows = await screen.findAllByTestId("annotation-row");
    expect(rows).toHaveLength(2);
    expect(screen.queryByTestId("annotation-empty")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("annotation-product")[0]).toHaveValue("DRAM");
    expect(screen.getAllByTestId("annotation-name")[1]).toHaveValue("홀");
  });

  it("draws a shape, persists it, and adds a numbered row", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(jsonResponse(createdAnnotation, 201));
    renderPage(fetchMock);
    await preparedImage();
    expect(screen.getByTestId("annotation-empty")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("tool-arrow"));
    dragShape({ x: 100, y: 100 }, { x: 400, y: 500 });

    const row = await screen.findByTestId("annotation-row");
    expect(row).toHaveTextContent("1");
    const [path, init] = fetchMock.mock.calls[1];
    expect(String(path)).toBe("/api/images/1/annotations");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(init.body)).toEqual({
      kind: "arrow",
      start: { x: 100, y: 100 },
      end: { x: 400, y: 500 },
      product: null,
      step: "",
      measurement_name: "",
    });
  });

  it("does not create a row for a click without a drag", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(detail));
    renderPage(fetchMock);
    await preparedImage();

    await userEvent.click(screen.getByTestId("tool-arrow"));
    dragShape({ x: 200, y: 200 }, { x: 200, y: 200 });

    expect(screen.getByTestId("annotation-empty")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial getImage
  });

  it("saves a Sensor product selection with a PATCH", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(jsonResponse(createdAnnotation, 201))
      .mockResolvedValueOnce(jsonResponse({ ...createdAnnotation, product: "Sensor" }));
    renderPage(fetchMock);
    await preparedImage();
    await userEvent.click(screen.getByTestId("tool-arrow"));
    dragShape({ x: 100, y: 100 }, { x: 400, y: 500 });
    await screen.findByTestId("annotation-row");

    await userEvent.selectOptions(screen.getByTestId("annotation-product"), "Sensor");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [path, init] = fetchMock.mock.calls[2];
    expect(String(path)).toBe("/api/images/1/annotations/10");
    expect(init).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(init.body)).toEqual({ product: "Sensor", step: "", measurement_name: "" });
    expect(screen.getByTestId("annotation-product")).toHaveValue("Sensor");
  });

  it("persists a Step edit when the field loses focus", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(jsonResponse(createdAnnotation, 201))
      .mockResolvedValueOnce(jsonResponse({ ...createdAnnotation, step: "ETCH" }));
    renderPage(fetchMock);
    await preparedImage();
    await userEvent.click(screen.getByTestId("tool-arrow"));
    dragShape({ x: 100, y: 100 }, { x: 400, y: 500 });
    await screen.findByTestId("annotation-row");

    const stepInput = screen.getByTestId("annotation-step");
    await userEvent.type(stepInput, "ETCH");
    fireEvent.blur(stepInput);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [path, init] = fetchMock.mock.calls[2];
    expect(String(path)).toBe("/api/images/1/annotations/10");
    expect(init).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(init.body)).toMatchObject({ step: "ETCH" });
  });

  it("rejects a successful response that is not a ZIP", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(detail))
      .mockResolvedValueOnce(jsonResponse({ message: "not an archive" }));
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage(fetchMock);

    await userEvent.click(await screen.findByTestId("context-export-button"));

    expect(await screen.findByRole("alert")).toHaveTextContent("올바른 Context ZIP");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});
