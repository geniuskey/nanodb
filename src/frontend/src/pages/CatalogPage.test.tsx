import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithRouter } from "../test/helpers";
import { CatalogPage } from "./CatalogPage";

afterEach(() => vi.unstubAllGlobals());

const CATALOG = [
  { id: 1, category: "image_type", value: "TEM", is_predefined: true },
  { id: 2, category: "product_id", value: "P-DRAM", is_predefined: false },
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

describe("CatalogPage", () => {
  it("groups options by category and protects predefined values", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({})));
    renderWithRouter(<CatalogPage />);

    const imageTypes = await screen.findByTestId("catalog-image_type");
    // A predefined value shows the badge and offers no delete control.
    expect(within(imageTypes).getByText("기본")).toBeInTheDocument();
    expect(within(imageTypes).queryByTestId(/^catalog-delete-/)).not.toBeInTheDocument();

    const products = screen.getByTestId("catalog-product_id");
    // A custom value can be deleted.
    expect(within(products).getByTestId("catalog-delete-2")).toBeInTheDocument();
  });

  it("adds a new option and forwards its category and value", async () => {
    const fetchMock = stubFetch((input, init) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({ id: 9, category: "lot_id", value: "L-99", is_predefined: false }, 201),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderWithRouter(<CatalogPage />);
    const user = userEvent.setup();

    await screen.findByTestId("catalog-lot_id");
    await user.type(screen.getByTestId("catalog-add-input-lot_id"), "L-99");
    await user.click(screen.getByTestId("catalog-add-submit-lot_id"));

    await waitFor(() =>
      expect(within(screen.getByTestId("catalog-lot_id")).getByText("L-99")).toBeInTheDocument(),
    );
    const post = fetchMock.mock.calls.find((call) => call[1]?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ category: "lot_id", value: "L-99" });
  });

  it("shows the server message when adding a duplicate", async () => {
    stubFetch((input, init) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({ code: "DUPLICATE_OPTION", message: "이미 있는 값입니다." }, 409),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderWithRouter(<CatalogPage />);
    const user = userEvent.setup();

    await screen.findByTestId("catalog-product_id");
    await user.type(screen.getByTestId("catalog-add-input-product_id"), "P-DRAM");
    await user.click(screen.getByTestId("catalog-add-submit-product_id"));

    expect(await screen.findByTestId("catalog-error-product_id")).toHaveTextContent(
      "이미 있는 값입니다.",
    );
  });

  it("removes an option after confirmation", async () => {
    const fetchMock = stubFetch((input, init) => {
      if (init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(jsonResponse({}));
    });
    renderWithRouter(<CatalogPage />);
    const user = userEvent.setup();

    await screen.findByTestId("catalog-product_id");
    await user.click(screen.getByTestId("catalog-delete-2"));
    await user.click(screen.getByTestId("confirm-accept"));

    await waitFor(() => expect(screen.queryByTestId("catalog-delete-2")).not.toBeInTheDocument());
    const del = fetchMock.mock.calls.find((call) => call[1]?.method === "DELETE")!;
    expect(String(del[0]).endsWith("/api/catalog/2")).toBe(true);
  });

  it("renames a custom option and forwards the new value", async () => {
    const fetchMock = stubFetch((input, init) => {
      if (init?.method === "PATCH") {
        return Promise.resolve(
          jsonResponse({ id: 2, category: "product_id", value: "P-DRAM-2", is_predefined: false }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    renderWithRouter(<CatalogPage />);
    const user = userEvent.setup();

    await screen.findByTestId("catalog-product_id");
    await user.click(screen.getByTestId("catalog-edit-2"));
    const input = screen.getByTestId("catalog-edit-input-2");
    await user.clear(input);
    await user.type(input, "P-DRAM-2");
    await user.click(screen.getByTestId("catalog-save-2"));

    await waitFor(() =>
      expect(within(screen.getByTestId("catalog-product_id")).getByText("P-DRAM-2")).toBeInTheDocument(),
    );
    const patch = fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH")!;
    expect(String(patch[0]).endsWith("/api/catalog/2")).toBe(true);
    expect(JSON.parse(patch[1]!.body as string)).toEqual({ value: "P-DRAM-2" });
  });

  it("offers no rename control on a predefined option", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({})));
    renderWithRouter(<CatalogPage />);

    const imageTypes = await screen.findByTestId("catalog-image_type");
    expect(within(imageTypes).queryByTestId(/^catalog-edit-/)).not.toBeInTheDocument();
  });

  it("reports a failed initial load with a retry", async () => {
    const mock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/catalog")) {
        return Promise.resolve(jsonResponse({ code: "REQUEST_FAILED", message: "x" }, 500));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", mock);
    renderWithRouter(<CatalogPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("불러오지 못했습니다");
  });
});
