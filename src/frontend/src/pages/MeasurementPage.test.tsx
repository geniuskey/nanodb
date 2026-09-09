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
  process_step: "Gate Etch",
  calibration_nm_per_pixel: 0.2,
  pixel_width: 1000,
  pixel_height: 800,
  created_at: "2026-09-08T04:00:00Z",
  file_url: "/api/images/1/file",
  measurements: [{
    id: 1,
    image_id: 1,
    item_id: null,
    measurement_type: "length",
    points: [{ x: 100, y: 100 }, { x: 400, y: 500 }],
    value: 100,
    unit: "nm",
    calibration_nm_per_pixel: 0.2,
    label: "Gate CD",
    note: "saved",
    measurement_method: "manual",
    source: "manual",
    confidence: null,
    reference_status: "unreviewed",
    original_points: null,
    original_value: null,
    adjusted_at: null,
    created_at: "2026-09-08T04:00:00Z",
  }],
};

const NO_SEGMENTATION = { code: "SEGMENTATION_NOT_FOUND", message: "세그멘테이션이 없습니다." };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * The measurement screen makes two loading calls: GET /api/images/:id and, once
 * the product is known, GET /api/measurement-items. The item list is answered
 * from `items`; every other call (getImage, POST/PATCH/DELETE measurements,
 * context export, item mutations) is served in order from `responses`.
 */
function renderPage(
  responses: Array<Response | Promise<Response>> = [jsonResponse(detail)],
  items: unknown[] = [],
) {
  const queue = [...responses];
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/api/measurement-items") && method === "GET") {
      return Promise.resolve(jsonResponse(items));
    }
    // The segmentation load on mount is "not found" by default so tests keep
    // their queue for the calls they actually assert on.
    if (url.includes("/segmentation") && method === "GET") {
      return Promise.resolve(jsonResponse(NO_SEGMENTATION, 404));
    }
    return Promise.resolve(queue.shift() ?? jsonResponse(detail));
  });
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

/** Give the scroll viewport a size so the fit scale can be computed. */
function stubViewport(width: number, height: number) {
  const viewport = screen.getByLabelText(/이미지 뷰어/);
  Object.defineProperty(viewport, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width, height }),
    configurable: true,
  });
  fireEvent(window, new Event("resize"));
}

/** Accept the in-app confirmation dialog (UIX-001). */
async function acceptConfirm() {
  await userEvent.click(await screen.findByTestId("confirm-accept"));
}

function postCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find((call) => call[1]?.method === "POST")!;
}
function deleteCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find((call) => call[1]?.method === "DELETE")!;
}
function patchCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH")!;
}

describe("MeasurementPage", () => {
  it("previews two points and ignores a third until reset", async () => {
    renderPage();
    const image = await preparedImage();
    fireEvent.click(image, { clientX: 100, clientY: 100 });
    fireEvent.click(image, { clientX: 400, clientY: 500 });
    fireEvent.click(image, { clientX: 10, clientY: 10 });

    expect(screen.getByTestId("measurement-preview")).toHaveTextContent("길이 · 100.00nm");
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

  it("can strip the overlay back while measuring a crowded region", async () => {
    // Auto extraction puts up to six shapes on one structure; hiding them, their
    // captions, or all but the selected one is how a single value stays legible.
    renderPage();
    await preparedImage();
    expect(screen.getByTestId("measurement-label")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("toggle-labels"));
    expect(screen.queryByTestId("measurement-label")).not.toBeInTheDocument();
    expect(document.querySelectorAll("g[data-measurement-id]")).toHaveLength(1);

    await userEvent.click(screen.getByTestId("toggle-shapes"));
    expect(document.querySelectorAll("g[data-measurement-id]")).toHaveLength(0);
    expect(screen.getByTestId("toggle-labels")).toBeDisabled();
  });

  it("offers 'selected only' just for a selected measurement", async () => {
    renderPage();
    await preparedImage();
    expect(screen.getByTestId("toggle-only-selected")).toBeDisabled();

    await userEvent.click(screen.getByTestId("saved-measurement-item"));
    await userEvent.click(screen.getByTestId("toggle-only-selected"));

    expect(document.querySelectorAll("g[data-measurement-id]")).toHaveLength(1);
  });

  it("explains the overlay conventions only once auto values are on the image", async () => {
    renderPage();
    await preparedImage();
    expect(screen.queryByTestId("viewer-legend")).not.toBeInTheDocument();

    renderPage([jsonResponse({
      ...detail,
      measurements: [{ ...detail.measurements[0], source: "auto", confidence: 0.8 }],
    })]);
    const legends = await screen.findAllByTestId("viewer-legend");
    expect(legends[0]).toHaveTextContent("점선 = 자동 추출");
  });

  it("corrects a saved measurement by nudging a point, and revalues it", async () => {
    // Auto extraction is not exact, so a saved point has to be movable. The
    // arrow key is the part that matters: at the zoom where a correction
    // counts, one pixel is smaller than the shake in a hand.
    const adjusted = {
      ...detail.measurements[0],
      points: [{ x: 100, y: 100 }, { x: 400, y: 499 }],
      value: 99.8,
      original_points: detail.measurements[0].points,
      original_value: 100,
      adjusted_at: "2026-09-09T05:00:00Z",
    };
    const fetchMock = renderPage([jsonResponse(detail), jsonResponse(adjusted)]);
    await preparedImage();

    await userEvent.click(screen.getByTestId("adjust-measurement"));
    expect(screen.getByTestId("adjust-panel")).toBeInTheDocument();
    // Nothing has moved yet, so there is nothing to save and no difference.
    expect(screen.getByTestId("adjust-save")).toBeDisabled();
    expect(screen.queryByTestId("adjust-delta")).not.toBeInTheDocument();

    const handles = screen.getAllByTestId("adjust-handle");
    expect(handles).toHaveLength(2);
    handles[1].focus();
    fireEvent.keyDown(handles[1], { key: "ArrowUp" });

    expect(screen.getByTestId("adjust-delta")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("adjust-save"));

    await waitFor(() =>
      expect(screen.getByTestId("status-banner")).toHaveTextContent("보정했습니다"),
    );
    const [path, init] = patchCall(fetchMock);
    expect(String(path)).toBe("/api/images/1/measurements/1/geometry");
    expect(init).toMatchObject({ method: "PATCH" });
    // The moved point is sent in original pixels; the server revalues it.
    expect(JSON.parse(init!.body as string)).toEqual({
      points: [{ x: 100, y: 100 }, { x: 400, y: 499 }],
    });
    expect(screen.getByTestId("measurement-adjusted")).toBeInTheDocument();
    expect(screen.getByTestId("measurement-original")).toHaveTextContent("처음 값 100.00nm");
  });

  it("leaves the saved measurement alone when a correction is cancelled", async () => {
    const fetchMock = renderPage();
    await preparedImage();

    await userEvent.click(screen.getByTestId("adjust-measurement"));
    const handles = screen.getAllByTestId("adjust-handle");
    fireEvent.keyDown(handles[0], { key: "ArrowRight", shiftKey: true });
    await userEvent.click(screen.getByTestId("adjust-cancel"));

    expect(screen.queryByTestId("adjust-panel")).not.toBeInTheDocument();
    expect(patchCall(fetchMock)).toBeUndefined();
    expect(screen.getByTestId("saved-measurement-item")).toHaveTextContent("100.00nm");
  });

  it("offers 'back to the first value' only on a corrected measurement", async () => {
    const adjusted = {
      ...detail.measurements[0],
      original_points: [{ x: 100, y: 100 }, { x: 400, y: 500 }],
      original_value: 100,
      adjusted_at: "2026-09-09T05:00:00Z",
      value: 88,
    };
    const fetchMock = renderPage([
      jsonResponse({ ...detail, measurements: [adjusted] }),
      jsonResponse(detail.measurements[0]),
    ]);
    await preparedImage();

    await userEvent.click(screen.getByTestId("adjust-measurement"));
    await userEvent.click(screen.getByTestId("adjust-revert"));

    await waitFor(() =>
      expect(screen.getByTestId("status-banner")).toHaveTextContent("복원했습니다"),
    );
    const call = fetchMock.mock.calls.find((entry) =>
      String(entry[0]).endsWith("/geometry/reset"),
    )!;
    expect(call[1]).toMatchObject({ method: "POST" });
    expect(screen.queryByTestId("measurement-adjusted")).not.toBeInTheDocument();
  });

  it("does not start a new drawing from a click meant for a correction", async () => {
    renderPage();
    const image = await preparedImage();

    await userEvent.click(screen.getByTestId("adjust-measurement"));
    fireEvent.click(image, { clientX: 700, clientY: 700 });

    expect(screen.getByTestId("adjust-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("measurement-preview")).not.toBeInTheDocument();
  });

  it("undoes the last placed point without discarding the rest", async () => {
    renderPage();
    const image = await preparedImage();
    fireEvent.click(image, { clientX: 100, clientY: 100 });
    fireEvent.click(image, { clientX: 400, clientY: 500 });
    expect(screen.getByTestId("measurement-preview")).toHaveTextContent("100.00nm");

    await userEvent.click(screen.getByTestId("measurement-undo"));

    expect(screen.queryByTestId("measurement-preview")).not.toBeInTheDocument();
    expect(screen.getByText("선택한 점: 1/2")).toBeInTheDocument();
    // The first point survived, so one more click completes the measurement.
    fireEvent.click(image, { clientX: 400, clientY: 500 });
    expect(screen.getByTestId("measurement-preview")).toHaveTextContent("100.00nm");
  });

  it("abandons an unfinished drawing on Escape", async () => {
    renderPage();
    const image = await preparedImage();
    fireEvent.click(image, { clientX: 100, clientY: 100 });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByText("선택한 점: 0/2")).toBeInTheDocument();
  });

  it("removes a saved measurement after confirmation and disables export", async () => {
    const fetchMock = renderPage([jsonResponse(detail), new Response(null, { status: 204 })]);
    await preparedImage();
    expect(screen.getByTestId("saved-measurement-item")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("delete-measurement"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    await acceptConfirm();

    await waitFor(() =>
      expect(screen.queryByTestId("saved-measurement-item")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("status-banner")).toHaveTextContent("측정을 삭제했습니다");
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    const [path, init] = deleteCall(fetchMock);
    expect(String(path)).toBe("/api/images/1/measurements/1");
    expect(init).toMatchObject({ method: "DELETE" });
    expect(screen.getByTestId("context-export-button")).toBeDisabled();
  });

  it("keeps the measurement when the confirmation is cancelled", async () => {
    const fetchMock = renderPage();
    await preparedImage();

    await userEvent.click(screen.getByTestId("delete-measurement"));
    await userEvent.click(screen.getByTestId("confirm-cancel"));

    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-measurement-item")).toBeInTheDocument();
    expect(deleteCall(fetchMock)).toBeUndefined();
  });

  it("cancels the confirmation with Escape and deletes nothing", async () => {
    const fetchMock = renderPage();
    await preparedImage();

    await userEvent.click(screen.getByTestId("delete-measurement"));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-measurement-item")).toBeInTheDocument();
    expect(deleteCall(fetchMock)).toBeUndefined();
  });

  it("names the cascade before deleting an image", async () => {
    renderPage();
    await preparedImage();

    await userEvent.click(screen.getByTestId("detail-image-delete"));

    expect(screen.getByTestId("confirm-dialog")).toHaveTextContent(
      "저장된 측정 1개가 함께 삭제됩니다",
    );
  });

  it("surfaces a delete failure without dropping the measurement", async () => {
    renderPage([
      jsonResponse(detail),
      jsonResponse({ code: "STORAGE_FAILED", message: "삭제하지 못했습니다." }, 500),
    ]);
    await preparedImage();

    await userEvent.click(screen.getByTestId("delete-measurement"));
    await acceptConfirm();

    expect(await screen.findByRole("alert")).toHaveTextContent("삭제하지 못했습니다");
    expect(screen.getByTestId("saved-measurement-item")).toBeInTheDocument();
  });

  it("deletes the image and returns to the catalog", async () => {
    const queue: Array<Response> = [jsonResponse(detail), new Response(null, { status: 204 })];
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/api/measurement-items") && method === "GET") {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.includes("/segmentation") && method === "GET") {
        return Promise.resolve(jsonResponse(NO_SEGMENTATION, 404));
      }
      return Promise.resolve(queue.shift() ?? jsonResponse(detail));
    });
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
    await acceptConfirm();

    expect(await screen.findByText("catalog")).toBeInTheDocument();
    const [path, init] = deleteCall(fetchMock);
    expect(String(path)).toBe("/api/images/1");
    expect(init).toMatchObject({ method: "DELETE" });
  });

  it("uses the server result after saving and clears the draft", async () => {
    const created = { ...detail.measurements[0], id: 2, value: 101 };
    const fetchMock = renderPage([jsonResponse(detail), jsonResponse(created, 201)]);
    const image = await preparedImage();
    fireEvent.click(image, { clientX: 100, clientY: 100 });
    fireEvent.click(image, { clientX: 400, clientY: 500 });
    await userEvent.click(screen.getByTestId("measurement-save"));

    await waitFor(() => expect(screen.getAllByTestId("saved-measurement-item")).toHaveLength(2));
    expect(screen.getAllByTestId("saved-measurement-item")[0]).toHaveTextContent("101.00nm");
    expect(screen.queryByTestId("measurement-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("status-banner")).toHaveTextContent("Gate CD 101.00nm 측정을 저장했습니다");
    expect(postCall(fetchMock)).toBeTruthy();
  });

  it("keeps a valid draft visible when server save fails", async () => {
    renderPage([
      jsonResponse(detail),
      jsonResponse({ code: "STORAGE_FAILED", message: "저장하지 못했습니다." }, 500),
    ]);
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

    expect(screen.getByText(/저장된 측정과 측정별 라벨·메모/)).toBeInTheDocument();
    expect(screen.getByText(/제외: 이미지 바이너리/)).toBeInTheDocument();
    expect(screen.getByText(/자동으로 외부에 전송하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByTestId("context-export-button")).toBeEnabled();
  });

  it("disables export and explains why when no measurements are saved", async () => {
    renderPage([jsonResponse({ ...detail, measurements: [] })]);

    expect(await screen.findByTestId("context-export-button")).toBeDisabled();
    expect(screen.getByTestId("context-export-disabled-reason")).toHaveTextContent("측정이 하나 이상");
  });

  it("downloads one successful ZIP and blocks duplicate export requests", async () => {
    let resolveExport!: (response: Response) => void;
    const exportResponse = new Promise<Response>((resolve) => { resolveExport = resolve; });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:nanodb-export");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage([jsonResponse(detail), exportResponse]);
    const button = await screen.findByTestId("context-export-button");

    await userEvent.click(button);
    await userEvent.click(button);
    expect(button).toBeDisabled();

    resolveExport(new Response("PKzip", { headers: { "Content-Type": "application/zip" } }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:nanodb-export");
    expect(button).toBeEnabled();
  });

  it("shows an error envelope without downloading it", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage([
      jsonResponse(detail),
      jsonResponse({ code: "EXPORT_FAILED", message: "ZIP을 생성하지 못했습니다." }, 500),
    ]);

    await userEvent.click(await screen.findByTestId("context-export-button"));

    expect(await screen.findByRole("alert")).toHaveTextContent("ZIP을 생성하지 못했습니다");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("shows the calibration, original size and registration time while measuring", async () => {
    renderPage();
    await preparedImage();

    const facts = screen.getByTestId("image-facts");
    expect(facts).toHaveTextContent("0.2 nm/pixel");
    expect(facts).toHaveTextContent("1000 × 800 px");
    expect(screen.getByTestId("image-process-step")).toHaveTextContent("Gate Etch");
  });

  it("omits the process step row when the image was registered without one", async () => {
    renderPage([jsonResponse({ ...detail, process_step: null })]);
    await preparedImage();

    expect(screen.queryByTestId("image-process-step")).not.toBeInTheDocument();
    expect(screen.getByTestId("image-facts")).toHaveTextContent("0.2 nm/pixel");
  });

  it("scales the image with the zoom control", async () => {
    renderPage();
    const image = await preparedImage();
    stubViewport(800, 600);

    expect(image).toHaveStyle({ width: "750px" });
    expect(screen.getByTestId("zoom-level")).toHaveTextContent("100%");
    expect(screen.getByTestId("zoom-fit")).toBeDisabled();

    await userEvent.click(screen.getByTestId("zoom-in"));

    expect(screen.getByTestId("zoom-level")).toHaveTextContent("150%");
    expect(image).toHaveStyle({ width: "1125px" });
    expect(screen.getByTestId("zoom-fit")).toBeEnabled();
  });

  it("states that original-pixel accuracy is unreachable while shrunk", async () => {
    renderPage();
    const image = await screen.findByTestId("measurement-image");
    Object.defineProperty(image, "getBoundingClientRect", {
      value: () => ({ left: 0, top: 0, width: 500, height: 400 }),
    });
    fireEvent.load(image);

    expect(screen.getByTestId("viewer-scale")).toHaveTextContent("원본 2.00px");
    expect(screen.getByTestId("viewer-scale")).toHaveTextContent(
      "원본 1px 단위로는 지정할 수 없습니다",
    );
  });

  it("draws the label of a saved measurement beside its own line", async () => {
    renderPage();
    await preparedImage();

    const caption = screen.getByTestId("measurement-label");
    expect(caption).toHaveTextContent("Gate CD");
    expect(caption.closest("g[data-measurement-id]")).toHaveAttribute(
      "data-measurement-id",
      "1",
    );
  });

  it("leaves an unlabelled measurement without a caption", async () => {
    renderPage([jsonResponse({
      ...detail,
      measurements: [{ ...detail.measurements[0], label: null }],
    })]);
    await preparedImage();

    expect(screen.queryByTestId("measurement-label")).not.toBeInTheDocument();
    expect(screen.getByTestId("saved-measurement-item")).toHaveTextContent("길이 · 100.00nm");
  });

  it("sends the drawn geometry with the typed label naming it", async () => {
    const fetchMock = renderPage([
      jsonResponse(detail),
      jsonResponse({ ...detail.measurements[0], id: 2 }, 201),
    ]);
    const image = await preparedImage();
    fireEvent.click(image, { clientX: 100, clientY: 100 });
    fireEvent.click(image, { clientX: 400, clientY: 500 });
    await userEvent.type(screen.getByTestId("measurement-label-input"), "  Gate CD  ");
    await userEvent.click(screen.getByTestId("measurement-save"));

    await waitFor(() => expect(postCall(fetchMock)).toBeTruthy());
    expect(JSON.parse(postCall(fetchMock)[1]!.body as string)).toMatchObject({
      measurement_type: "length",
      points: [{ x: 100, y: 100 }, { x: 400, y: 500 }],
      item_id: null,
      label: "Gate CD",
      note: null,
    });
    expect(screen.getByTestId("measurement-label-input")).toHaveValue("");
  });

  it("fixes the type from a selected item and names the saved measurement after it", async () => {
    const item = { id: 5, product_id: "P1", name: "코너 각도", measurement_type: "angle" };
    const created = {
      ...detail.measurements[0],
      id: 3,
      item_id: 5,
      measurement_type: "angle",
      points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 100, y: 200 }],
      value: 90,
      unit: "deg",
      label: "코너 각도",
    };
    const fetchMock = renderPage([jsonResponse(detail), jsonResponse(created, 201)], [item]);
    const image = await preparedImage();

    await userEvent.selectOptions(screen.getByTestId("measurement-item-select"), "5");
    expect(screen.getByTestId("measurement-type-fixed")).toHaveTextContent("각도");
    expect(screen.getByTestId("draw-hint")).toHaveTextContent("꼭짓점");
    // The item fixes the type; there is no free label field while an item drives it.
    expect(screen.queryByTestId("measurement-label-input")).not.toBeInTheDocument();

    fireEvent.click(image, { clientX: 100, clientY: 100 });
    fireEvent.click(image, { clientX: 200, clientY: 100 });
    fireEvent.click(image, { clientX: 100, clientY: 200 });
    expect(screen.getByTestId("measurement-preview")).toHaveTextContent("각도 · 90.00°");

    await userEvent.click(screen.getByTestId("measurement-save"));
    await waitFor(() => expect(postCall(fetchMock)).toBeTruthy());
    expect(JSON.parse(postCall(fetchMock)[1]!.body as string)).toMatchObject({
      measurement_type: "angle",
      item_id: 5,
      label: "코너 각도",
      points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 100, y: 200 }],
    });
  });

  it("adds a per-product measurement item and forwards its name and type", async () => {
    const createdItem = { id: 7, product_id: "P1", name: "Gate CD", measurement_type: "length" };
    const fetchMock = renderPage([jsonResponse(detail), jsonResponse(createdItem, 201)], []);
    await preparedImage();

    await userEvent.type(screen.getByTestId("item-new-name"), "Gate CD");
    await userEvent.selectOptions(screen.getByTestId("item-new-type"), "length");
    await userEvent.click(screen.getByTestId("item-add"));

    await waitFor(() =>
      expect(screen.getAllByTestId("measurement-item-row")).toHaveLength(1),
    );
    const [path, init] = postCall(fetchMock);
    expect(String(path)).toBe("/api/measurement-items");
    expect(JSON.parse(init!.body as string)).toEqual({
      product_id: "P1",
      name: "Gate CD",
      measurement_type: "length",
    });
    expect(screen.getByTestId("measurement-items")).toHaveTextContent("Gate CD");
  });

  it("deletes a measurement item after confirmation and keeps saved measurements", async () => {
    const item = { id: 5, product_id: "P1", name: "코너 각도", measurement_type: "angle" };
    const fetchMock = renderPage([jsonResponse(detail), new Response(null, { status: 204 })], [item]);
    await preparedImage();
    expect(screen.getByTestId("measurement-item-row")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("item-delete"));
    expect(screen.getByTestId("confirm-dialog")).toHaveTextContent("'코너 각도'을(를) 삭제할까요");
    await acceptConfirm();

    await waitFor(() =>
      expect(screen.queryByTestId("measurement-item-row")).not.toBeInTheDocument(),
    );
    const [path, init] = deleteCall(fetchMock);
    expect(String(path)).toBe("/api/measurement-items/5");
    expect(init).toMatchObject({ method: "DELETE" });
    // The saved measurement is untouched by removing the item.
    expect(screen.getByTestId("saved-measurement-item")).toBeInTheDocument();
  });

  it("edits a saved measurement's annotation and leaves its evidence alone", async () => {
    const fetchMock = renderPage([
      jsonResponse(detail),
      jsonResponse({
        ...detail.measurements[0],
        label: "Gate CD (재확인)",
        note: "경계 재확인",
      }),
    ]);
    await preparedImage();

    await userEvent.click(screen.getByTestId("edit-annotation"));
    await userEvent.clear(screen.getByTestId("label-input"));
    await userEvent.type(screen.getByTestId("label-input"), "Gate CD (재확인)");
    await userEvent.clear(screen.getByTestId("note-input"));
    await userEvent.type(screen.getByTestId("note-input"), "경계 재확인");
    await userEvent.click(screen.getByTestId("note-save"));

    await waitFor(() =>
      expect(screen.getByTestId("status-banner")).toHaveTextContent("측정 라벨과 메모를 수정했습니다"),
    );
    const [path, init] = patchCall(fetchMock);
    expect(String(path)).toBe("/api/images/1/measurements/1");
    expect(init).toMatchObject({ method: "PATCH" });
    expect(JSON.parse(init!.body as string)).toEqual({ label: "Gate CD (재확인)", note: "경계 재확인" });
    expect(screen.getByTestId("saved-measurement-item")).toHaveTextContent("100.00nm");
    expect(screen.getByTestId("saved-measurement-item")).toHaveTextContent("경계 재확인");
    expect(screen.getByTestId("measurement-label")).toHaveTextContent("Gate CD (재확인)");
    expect(screen.queryByTestId("note-input")).not.toBeInTheDocument();
  });

  it("sends a cleared annotation as null on both halves and can be cancelled", async () => {
    const fetchMock = renderPage([
      jsonResponse(detail),
      jsonResponse({ ...detail.measurements[0], label: null, note: null }),
    ]);
    await preparedImage();

    await userEvent.click(screen.getByTestId("edit-annotation"));
    await userEvent.click(screen.getByTestId("note-cancel"));
    expect(screen.queryByTestId("note-input")).not.toBeInTheDocument();
    expect(patchCall(fetchMock)).toBeUndefined();

    await userEvent.click(screen.getByTestId("edit-annotation"));
    await userEvent.clear(screen.getByTestId("label-input"));
    await userEvent.clear(screen.getByTestId("note-input"));
    await userEvent.click(screen.getByTestId("note-save"));

    await waitFor(() => expect(patchCall(fetchMock)).toBeTruthy());
    expect(JSON.parse(patchCall(fetchMock)[1]!.body as string)).toEqual({ label: null, note: null });
    expect(screen.queryByTestId("measurement-label")).not.toBeInTheDocument();
  });

  it("offers a retry when the image detail cannot be loaded", async () => {
    renderPage([
      jsonResponse({ code: "IMAGE_NOT_FOUND", message: "이미지를 찾을 수 없습니다." }, 404),
      jsonResponse(detail),
    ]);

    await userEvent.click(await screen.findByTestId("retry-detail"));

    expect(await screen.findByTestId("measurement-image")).toBeInTheDocument();
  });

  it("names the open image in the document title", async () => {
    renderPage();
    await preparedImage();

    expect(document.title).toBe("sample.png · NANoDB");
  });

  const segResult = {
    image_id: 1,
    method: "chan-vese",
    classes: 3,
    denoise_weight: 0.1,
    min_size: 64,
    thresholds: [80, 160],
    class_stats: [
      { class_index: 0, intensity_range: [0, 80], pixels: 1000, area_fraction: 0.5, mean_intensity: 40, area_nm2: 12.3 },
      { class_index: 1, intensity_range: [80, 160], pixels: 600, area_fraction: 0.3, mean_intensity: 120, area_nm2: null },
    ],
    duration_ms: 42,
    downscaled: false,
    has_tagged_tiff: true,
    map_url: "/api/images/1/segmentation/map",
    boundary_url: "/api/images/1/segmentation/boundary",
    created_at: "2026-09-08T04:00:00Z",
    replaced: false,
  };
  const autoMeasurement = {
    ...detail.measurements[0],
    id: 9,
    label: "auto: 폭(CD)",
    source: "auto",
    measurement_method: "auto",
    confidence: 0.82,
  };
  const featResult = {
    image_id: 1,
    target_class: 0,
    region_area_px: 5000,
    region_clipped: false,
    measurements: [autoMeasurement],
    skipped: [{ key: "spacing", reason: "단일 영역" }],
  };

  it("shows the empty state and disables feature extraction before segmentation", async () => {
    renderPage();
    await preparedImage();

    expect(await screen.findByTestId("segmentation-empty")).toBeInTheDocument();
    expect(screen.getByTestId("run-segmentation")).toHaveTextContent("세그멘테이션 실행");
    expect(screen.getByTestId("run-features")).toBeDisabled();
    expect(screen.getByTestId("measurement-source")).toHaveTextContent("수동");
  });

  it("runs segmentation and shows the class map, stats and tagged download", async () => {
    renderPage([jsonResponse(detail), jsonResponse(segResult)]);
    await preparedImage();

    await userEvent.click(screen.getByTestId("run-segmentation"));

    await waitFor(() => expect(screen.getByTestId("segmentation-result")).toBeInTheDocument());
    expect(screen.getByTestId("segmentation-map")).toHaveAttribute("src", "/api/images/1/segmentation/map");
    expect(screen.getByTestId("segmentation-boundary")).toHaveAttribute("src", "/api/images/1/segmentation/boundary");
    expect(screen.getAllByTestId("segmentation-class-row")).toHaveLength(2);
    expect(screen.getByTestId("tagged-download")).toHaveAttribute("href", "/api/images/1/tagged");
    expect(screen.getByTestId("run-features")).toBeEnabled();
  });

  it("extracts auto features and keeps them distinct from manual in the saved list", async () => {
    const refreshed = { ...detail, measurements: [detail.measurements[0], autoMeasurement] };
    const fetchMock = renderPage([
      jsonResponse(detail),
      jsonResponse(segResult),
      jsonResponse(featResult),
      jsonResponse(refreshed),
    ]);
    await preparedImage();

    await userEvent.click(screen.getByTestId("run-segmentation"));
    await waitFor(() => expect(screen.getByTestId("run-features")).toBeEnabled());
    await userEvent.click(screen.getByTestId("run-features"));

    await waitFor(() => expect(screen.getAllByTestId("saved-measurement-item")).toHaveLength(2));
    const sources = screen.getAllByTestId("measurement-source").map((el) => el.textContent);
    expect(sources).toContain("수동");
    expect(sources.some((text) => text?.includes("자동 82%"))).toBe(true);
    expect(screen.getByTestId("feature-skipped")).toHaveTextContent("spacing");
    const featCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("/features"));
    expect(featCall).toBeTruthy();
    expect(featCall![1]?.method).toBe("POST");
  });

  it("says that corrections survived a re-run of the extractor", async () => {
    // A re-run replaces auto rows, so an operator who corrected one needs to be
    // told it was kept -- otherwise the safe move is to re-check every value.
    const fetchMock = renderPage([
      jsonResponse(detail),
      jsonResponse(segResult),
      jsonResponse({ ...featResult, preserved_adjusted: 2 }),
      jsonResponse(detail),
    ]);
    await preparedImage();

    await userEvent.click(screen.getByTestId("run-segmentation"));
    await waitFor(() => expect(screen.getByTestId("run-features")).toBeEnabled());
    await userEvent.click(screen.getByTestId("run-features"));

    await waitFor(() =>
      expect(screen.getByTestId("status-banner")).toHaveTextContent(
        "직접 보정한 2개는 그대로 두었습니다",
      ),
    );
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/features"))).toBe(true);
  });

  it("surfaces a segmentation failure without leaving a result", async () => {
    renderPage([
      jsonResponse(detail),
      jsonResponse({ code: "SEGMENTATION_FAILED", message: "세그멘테이션을 실행하지 못했습니다." }, 500),
    ]);
    await preparedImage();

    await userEvent.click(screen.getByTestId("run-segmentation"));

    expect(await screen.findByTestId("segmentation-error")).toHaveTextContent(
      "세그멘테이션을 실행하지 못했습니다",
    );
    expect(screen.queryByTestId("segmentation-result")).not.toBeInTheDocument();
  });

  it("rejects a successful response that is not a ZIP", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage([jsonResponse(detail), jsonResponse({ message: "not an archive" })]);

    await userEvent.click(await screen.findByTestId("context-export-button"));

    expect(await screen.findByRole("alert")).toHaveTextContent("올바른 Context ZIP");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});
