import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

afterEach(() => vi.restoreAllMocks());

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error("internal detail that must not surface");
  return <p>정상 화면</p>;
}

it("replaces a crashed subtree with a recovery screen and hides the cause", async () => {
  // React logs the caught error itself; keep the test output readable.
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  const { rerender } = render(
    <ErrorBoundary>
      <Boom explode />
    </ErrorBoundary>,
  );

  expect(screen.getByTestId("error-boundary")).toBeInTheDocument();
  expect(document.body.textContent).not.toContain("internal detail");

  // Retry re-renders the children, so a transient failure is recoverable
  // without losing the whole page to a reload.
  rerender(
    <ErrorBoundary>
      <Boom explode={false} />
    </ErrorBoundary>,
  );
  await userEvent.click(screen.getByTestId("error-retry"));

  expect(screen.getByText("정상 화면")).toBeInTheDocument();
});
