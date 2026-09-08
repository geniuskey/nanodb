import { expect, test } from "@playwright/test";

import { drawTwoPoints, registerSampleImage } from "./helpers";

// Zoom rescales what is on screen while coordinates stay in original pixels,
// and the viewer states the accuracy the user can actually point at.
// Requirements: MEA-013, MEA-014, MEA-012.
test("zooming rescales the image and keeps the saved overlay on it", async ({
  page,
}) => {
  await registerSampleImage(page);

  // The calibration that every value depends on is visible while measuring.
  await expect(page.getByTestId("image-facts")).toContainText("nm/pixel");

  await drawTwoPoints(page);
  await page.getByTestId("measurement-save").click();
  await expect(page.getByTestId("saved-measurement-item")).toHaveCount(1);

  const image = page.getByTestId("measurement-image");
  const line = page.locator("g[data-measurement-id] line").first();
  const imageBefore = await image.boundingBox();
  const lineBefore = await line.boundingBox();
  await expect(page.getByTestId("zoom-level")).toHaveText("100%");
  await expect(page.getByTestId("viewer-scale")).toContainText("화면 1px");

  await page.getByTestId("zoom-in").click();

  await expect(page.getByTestId("zoom-level")).toHaveText("150%");
  const imageAfter = await image.boundingBox();
  const lineAfter = await line.boundingBox();
  expect(imageAfter!.width).toBeGreaterThan(imageBefore!.width * 1.4);
  // The overlay is rebuilt from stored original coordinates, so the saved line
  // grows with the image rather than drifting away from its position.
  expect(lineAfter!.width).toBeGreaterThan(lineBefore!.width * 1.4);

  await page.getByTestId("zoom-fit").click();
  await expect(page.getByTestId("zoom-level")).toHaveText("100%");
});

// A drawn shape can be removed, and destructive actions are confirmed in the
// app rather than by a browser dialog. Requirements: ANN-005, UIX-001, UIX-002.
test("a drawn shape can be cancelled out of, then deleted", async ({ page }) => {
  await registerSampleImage(page);

  await page.getByTestId("tool-arrow").click();
  const overlay = page.getByTestId("annotation-overlay");
  const box = (await overlay.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6);
  await page.mouse.up();
  await expect(page.getByTestId("annotation-row")).toHaveCount(1);

  // Cancelling leaves the shape in place.
  await page.getByTestId("delete-annotation").click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("annotation-row")).toHaveCount(1);

  await page.getByTestId("delete-annotation").click();
  await page.getByTestId("confirm-accept").click();

  await expect(page.getByTestId("annotation-empty")).toBeVisible();
  await expect(page.getByTestId("status-banner")).toContainText("도형을 삭제했습니다");
});
