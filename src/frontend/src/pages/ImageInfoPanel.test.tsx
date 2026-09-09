import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { jsonResponse } from "../test/helpers";
import type { ImageDetailView } from "../api/types";
import { ImageInfoPanel } from "./ImageInfoPanel";

const detail: ImageDetailView = {
  id: 14,
  original_filename: "wafer.png",
  image_type: "TEM",
  product_id: "P1",
  lot_id: "L1",
  wafer_id: "W1",
  process_step: "Gate Etch",
  note: null,
  calibration_nm_per_pixel: 0.2,
  pixel_width: 1000,
  pixel_height: 800,
  created_at: "2026-09-08T04:00:00Z",
  file_url: "/api/images/14/file",
  measurements: [],
};

const catalog = [
  { id: 1, category: "image_type", value: "TEM", is_predefined: true },
  { id: 2, category: "image_type", value: "SEM", is_predefined: true },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Serve the catalog on GET and hand every other call the next queued response. */
function stubFetch(responses: Array<Response | Promise<Response>> = []) {
  const queue = [...responses];
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/api/catalog") && method === "GET") {
      return Promise.resolve(jsonResponse(catalog));
    }
    return Promise.resolve(queue.shift() ?? jsonResponse({}));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPanel(onUpdated = vi.fn()) {
  render(
    <MemoryRouter>
      <ImageInfoPanel detail={detail} onUpdated={onUpdated} />
    </MemoryRouter>,
  );
  return onUpdated;
}

it("shows the read-only facts until the operator opens the editor", () => {
  stubFetch();
  renderPanel();

  expect(screen.getByTestId("image-facts")).toHaveTextContent("TEM");
  expect(screen.getByTestId("image-facts")).toHaveTextContent("nm/pixel");
  expect(screen.queryByTestId("image-edit-form")).toBeNull();
});

it("saves corrected fields and reports the updated image", async () => {
  const saved = { ...detail, image_type: "SEM", note: "재보정", calibration_nm_per_pixel: 0.35 };
  const fetchMock = stubFetch([jsonResponse(saved)]);
  const onUpdated = renderPanel();
  const user = userEvent.setup();

  await user.click(screen.getByTestId("image-edit"));
  const form = await screen.findByTestId("image-edit-form");

  const calibration = screen.getByTestId("edit-calibration");
  await user.clear(calibration);
  await user.type(calibration, "0.35");
  await user.type(screen.getByTestId("edit-note"), "재보정");
  await user.click(within(form).getByTestId("image-edit-save"));

  await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(saved));

  // The PATCH carried trimmed values, and the panel returned to the facts view.
  const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
  expect(patch?.[0]).toBe("/api/images/14");
  expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({
    calibration_nm_per_pixel: 0.35,
    note: "재보정",
  });
  expect(screen.queryByTestId("image-edit-form")).toBeNull();
});

it("opens the editor in a modal over the still-visible facts and closes on Escape", async () => {
  const user = userEvent.setup();
  stubFetch();
  renderPanel();

  await user.click(screen.getByTestId("image-edit"));
  await screen.findByTestId("image-edit-form");
  // The facts list stays mounted behind the dialog rather than being replaced.
  expect(screen.getByTestId("image-facts")).toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBeInTheDocument();

  await user.keyboard("{Escape}");

  await waitFor(() => expect(screen.queryByTestId("image-edit-form")).toBeNull());
});

it("blocks saving when the calibration is not a positive number", async () => {
  const fetchMock = stubFetch();
  renderPanel();
  const user = userEvent.setup();

  await user.click(screen.getByTestId("image-edit"));
  const calibration = await screen.findByTestId("edit-calibration");
  await user.clear(calibration);
  await user.type(calibration, "0");
  await user.click(screen.getByTestId("image-edit-save"));

  expect(screen.getByRole("alert")).toHaveTextContent("0보다 큰");
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
});

it("surfaces a field-scoped server error on the offending field", async () => {
  stubFetch([
    jsonResponse(
      { code: "VALIDATION", message: "이미 사용 중입니다.", detail: { field: "image_type" } },
      422,
    ),
  ]);
  renderPanel();
  const user = userEvent.setup();

  await user.click(screen.getByTestId("image-edit"));
  await screen.findByTestId("image-edit-form");
  await user.click(screen.getByTestId("image-edit-save"));

  await waitFor(() =>
    expect(screen.getByText("이미 사용 중입니다.")).toBeInTheDocument(),
  );
  // A field error keeps the editor open for correction.
  expect(screen.getByTestId("image-edit-form")).toBeInTheDocument();
});
