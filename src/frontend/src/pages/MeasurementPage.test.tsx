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
    reference_status: "unreviewed",
    created_at: "2026-09-08T04:00:00Z",
  }],
};

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
      if (url.includes("/api/measurement-items") && (init?.method ?? "GET") === "GET") {
        return Promise.resolve(jsonResponse([]));
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
    expect(caption.closest("g")).toHaveAttribute("data-measurement-id", "1");
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
