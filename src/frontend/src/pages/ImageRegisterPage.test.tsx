import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithRouter } from "../test/helpers";
import { ImageRegisterPage } from "./ImageRegisterPage";

afterEach(() => vi.unstubAllGlobals());

const CATALOG = [
  { id: 1, category: "image_type", value: "TEM", is_predefined: true },
  { id: 2, category: "image_type", value: "SEM", is_predefined: true },
  { id: 3, category: "product_id", value: "P-DRAM", is_predefined: false },
  { id: 4, category: "wafer_id", value: "W01", is_predefined: true },
];

/** GET /api/catalog is answered from a fixture; other calls go to `rest`. */
function stubFetch(rest: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/catalog") && (!init?.method || init.method === "GET")) {
      return Promise.resolve(jsonResponse(CATALOG));
    }
    return rest(input, init);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Calls that registered an image (POST /api/images). */
function registerCalls(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls.filter(
    (call) => String(call[0]).endsWith("/api/images") && call[1]?.method === "POST",
  );
}

function field(name: string) {
  return document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
}

async function fillValidForm(calibration = "0.2") {
  const user = userEvent.setup();
  await user.upload(screen.getByTestId("registration-file"), new File(["png"], "sample.png", { type: "image/png" }));
  await user.type(screen.getByTestId("registration-product"), "P1");
  await user.type(field("lot_id"), "L1");
  await user.type(field("wafer_id"), "W1");
  await user.type(field("calibration_nm_per_pixel"), calibration);
  return user;
}

describe("ImageRegisterPage", () => {
  it("reports every missing input beside its own field, without registering", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({})));
    renderWithRouter(<ImageRegisterPage />);

    fireEvent.submit(screen.getByTestId("image-registration-form"));

    // Every problem at once, each next to the input that caused it.
    expect(await screen.findByTestId("error-file")).toHaveTextContent("이미지 한 장");
    expect(screen.getByTestId("error-product_id")).toHaveTextContent("Product ID는 필수입니다");
    expect(screen.getByTestId("error-lot_id")).toHaveTextContent("Lot ID는 필수입니다");
    expect(screen.getByTestId("error-wafer_id")).toHaveTextContent("Wafer ID는 필수입니다");
    expect(screen.getByTestId("error-calibration_nm_per_pixel")).toBeInTheDocument();
    expect(registerCalls(fetchMock)).toHaveLength(0);
  });

  it("marks invalid fields for assistive technology and focuses the first one", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({})));
    renderWithRouter(<ImageRegisterPage />);
    const product = screen.getByTestId("registration-product");

    fireEvent.submit(screen.getByTestId("image-registration-form"));

    await screen.findByTestId("error-file");
    expect(product).toHaveAttribute("aria-invalid", "true");
    expect(product).toHaveAttribute("aria-describedby", "product_id-error");
    expect(product).toHaveAttribute("aria-required", "true");
    // The file input is first in the form, so it takes focus.
    expect(screen.getByTestId("registration-file")).toHaveFocus();
  });

  it("rejects a non-positive calibration next to that field", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({})));
    renderWithRouter(<ImageRegisterPage />);
    const user = await fillValidForm("0");

    await user.click(screen.getByTestId("registration-submit"));

    expect(await screen.findByTestId("error-calibration_nm_per_pixel"))
      .toHaveTextContent("0보다 큰 숫자");
    expect(screen.queryByTestId("error-product_id")).not.toBeInTheDocument();
    expect(registerCalls(fetchMock)).toHaveLength(0);
  });

  it("submits multipart data once and disables while pending", async () => {
    let resolveRequest!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveRequest = resolve; });
    const fetchMock = stubFetch(() => pending);
    renderWithRouter(<ImageRegisterPage />);
    const user = await fillValidForm();
    await user.click(screen.getByTestId("registration-submit"));
    expect(screen.getByTestId("registration-submit")).toBeDisabled();
    expect(registerCalls(fetchMock)).toHaveLength(1);
    resolveRequest(jsonResponse({ id: 5 }));
    await waitFor(() => expect(screen.getByTestId("registration-submit")).not.toBeDisabled());
  });

  it("defaults the image type and can pick a catalog option", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ id: 5 }, 201)));
    renderWithRouter(<ImageRegisterPage />);
    // The image type combobox starts on the predefined TEM value.
    expect(field("image_type")).toHaveValue("TEM");
    const user = await fillValidForm();
    await user.click(screen.getByTestId("registration-submit"));

    await waitFor(() => expect(registerCalls(fetchMock)).toHaveLength(1));
    const body = registerCalls(fetchMock)[0][1]!.body as FormData;
    expect(body.get("image_type")).toBe("TEM");
  });

  it("sends the optional process step with the image", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ id: 5 }, 201)));
    renderWithRouter(<ImageRegisterPage />);
    const user = await fillValidForm();
    await user.type(screen.getByTestId("registration-process-step"), "Gate Etch");
    await user.click(screen.getByTestId("registration-submit"));

    await waitFor(() => expect(registerCalls(fetchMock)).toHaveLength(1));
    const body = registerCalls(fetchMock)[0][1]!.body as FormData;
    // One step for the whole image: the operator picks it once at registration
    // instead of retyping it on every figure drawn later.
    expect(body.get("process_step")).toBe("Gate Etch");
  });

  it("registers without a process step because the field is optional", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ id: 5 }, 201)));
    renderWithRouter(<ImageRegisterPage />);
    const user = await fillValidForm();
    await user.click(screen.getByTestId("registration-submit"));

    await waitFor(() => expect(registerCalls(fetchMock)).toHaveLength(1));
    const body = registerCalls(fetchMock)[0][1]!.body as FormData;
    expect(body.get("process_step")).toBe("");
  });

  /** Fill every required field except the file, so a drop/paste supplies it. */
  async function fillExceptFile(calibration = "0.2") {
    const user = userEvent.setup();
    await user.type(screen.getByTestId("registration-product"), "P1");
    await user.type(field("lot_id"), "L1");
    await user.type(field("wafer_id"), "W1");
    await user.type(field("calibration_nm_per_pixel"), calibration);
    return user;
  }

  it("registers an image dropped onto the preview zone", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ id: 5 }, 201)));
    renderWithRouter(<ImageRegisterPage />);
    const user = await fillExceptFile();
    const dropped = new File(["png"], "dropped.png", { type: "image/png" });

    fireEvent.drop(screen.getByTestId("image-drop-zone"), { dataTransfer: { files: [dropped] } });
    await user.click(screen.getByTestId("registration-submit"));

    await waitFor(() => expect(registerCalls(fetchMock)).toHaveLength(1));
    const body = registerCalls(fetchMock)[0][1]!.body as FormData;
    expect((body.get("file") as File).name).toBe("dropped.png");
  });

  it("registers an image pasted from the clipboard", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ id: 5 }, 201)));
    renderWithRouter(<ImageRegisterPage />);
    const user = await fillExceptFile();
    const pasted = new File(["png"], "pasted.png", { type: "image/png" });

    fireEvent.paste(document, {
      clipboardData: { items: [{ type: "image/png", getAsFile: () => pasted }] },
    });
    await user.click(screen.getByTestId("registration-submit"));

    await waitFor(() => expect(registerCalls(fetchMock)).toHaveLength(1));
    const body = registerCalls(fetchMock)[0][1]!.body as FormData;
    expect((body.get("file") as File).name).toBe("pasted.png");
  });

  it("rejects a dropped non-image beside the file field", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({})));
    renderWithRouter(<ImageRegisterPage />);
    const notImage = new File(["nope"], "notes.txt", { type: "text/plain" });

    fireEvent.drop(screen.getByTestId("image-drop-zone"), { dataTransfer: { files: [notImage] } });

    expect(await screen.findByTestId("error-file")).toHaveTextContent("PNG, JPEG 또는 TIFF");
  });

  it("keeps entered values when the server rejects registration", async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse({ code: "INVALID_IMAGE_FILE", message: "실제 PNG/JPEG가 아닙니다." }, 422)),
    );
    renderWithRouter(<ImageRegisterPage />);
    const user = await fillValidForm();
    await user.click(screen.getByTestId("registration-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent("실제 PNG/JPEG");
    expect(screen.getByTestId("registration-product")).toHaveValue("P1");
  });
});
