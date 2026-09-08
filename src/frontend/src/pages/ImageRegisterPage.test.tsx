import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithRouter } from "../test/helpers";
import { ImageRegisterPage } from "./ImageRegisterPage";

afterEach(() => vi.unstubAllGlobals());

async function fillValidForm() {
  const user = userEvent.setup();
  await user.upload(screen.getByTestId("registration-file"), new File(["png"], "sample.png", { type: "image/png" }));
  await user.type(screen.getByTestId("registration-product"), "P1");
  const inputs = screen.getAllByRole("textbox");
  await user.type(inputs[1], "L1");
  await user.type(inputs[2], "W1");
  await user.type(inputs[3], "0.2");
  return user;
}

describe("ImageRegisterPage", () => {
  it("reports every missing input beside its own field, without calling the server", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    renderWithRouter(<ImageRegisterPage />);

    fireEvent.submit(screen.getByTestId("image-registration-form"));

    // Every problem at once, each next to the input that caused it.
    expect(await screen.findByTestId("error-file")).toHaveTextContent("이미지 한 장");
    expect(screen.getByTestId("error-product_id")).toHaveTextContent("Product ID는 필수입니다");
    expect(screen.getByTestId("error-lot_id")).toHaveTextContent("Lot ID는 필수입니다");
    expect(screen.getByTestId("error-wafer_id")).toHaveTextContent("Wafer ID는 필수입니다");
    expect(screen.getByTestId("error-calibration_nm_per_pixel")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks invalid fields for assistive technology and focuses the first one", async () => {
    vi.stubGlobal("fetch", vi.fn());
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
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    renderWithRouter(<ImageRegisterPage />);
    const user = userEvent.setup();
    await user.upload(screen.getByTestId("registration-file"), new File(["png"], "s.png", { type: "image/png" }));
    await user.type(screen.getByTestId("registration-product"), "P1");
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[1], "L1");
    await user.type(inputs[2], "W1");
    await user.type(inputs[3], "0");

    await user.click(screen.getByTestId("registration-submit"));

    expect(await screen.findByTestId("error-calibration_nm_per_pixel"))
      .toHaveTextContent("0보다 큰 숫자");
    expect(screen.queryByTestId("error-product_id")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits multipart data once and disables while pending", async () => {
    let resolveRequest!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveRequest = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pending); vi.stubGlobal("fetch", fetchMock);
    renderWithRouter(<ImageRegisterPage />);
    const user = await fillValidForm();
    await user.click(screen.getByTestId("registration-submit"));
    expect(screen.getByTestId("registration-submit")).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveRequest(jsonResponse({ id: 5 }));
    await waitFor(() => expect(screen.getByTestId("registration-submit")).not.toBeDisabled());
  });

  it("keeps entered values when the server rejects registration", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ code: "INVALID_IMAGE_FILE", message: "실제 PNG/JPEG가 아닙니다." }, 422)));
    renderWithRouter(<ImageRegisterPage />);
    const user = await fillValidForm();
    await user.click(screen.getByTestId("registration-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent("실제 PNG/JPEG");
    expect(screen.getByTestId("registration-product")).toHaveValue("P1");
  });
});
