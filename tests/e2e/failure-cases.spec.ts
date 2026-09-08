import { expect, test } from "@playwright/test";

import { drawTwoPoints, registerSampleImage } from "./helpers";

// Registration client validation blocks submit and keeps the user on the form
// with a visible reason (US-03).
test("registration without a file is rejected before submit", async ({
  page,
}) => {
  await page.goto("/images/new");
  await page.getByTestId("registration-product").fill("DEMO-PRODUCT");
  await page.locator('input[name="lot_id"]').fill("LOT-1");
  await page.locator('input[name="wafer_id"]').fill("WAFER-1");
  await page.locator('input[name="calibration_nm_per_pixel"]').fill("0.5");

  await page.getByTestId("registration-submit").click();

  await expect(page).toHaveURL(/\/images\/new$/);
  await expect(page.getByRole("alert")).toContainText("PNG, JPEG 또는 TIFF");
});

// Export stays disabled with a stated reason until a measurement exists (US-06).
test("context export is disabled without measurements", async ({ page }) => {
  await registerSampleImage(page);

  await expect(page.getByTestId("context-export-button")).toBeDisabled();
  await expect(
    page.getByTestId("context-export-disabled-reason"),
  ).toBeVisible();
});

// A third click does not extend a complete two-point draft (US-04).
test("third click does not add a third point", async ({ page }) => {
  await registerSampleImage(page);
  await drawTwoPoints(page);
  await expect(page.getByText("선택한 점: 2/2")).toBeVisible();

  const image = page.getByTestId("measurement-image");
  const box = await image.boundingBox();
  await image.click({ position: { x: box!.width * 0.5, y: box!.height * 0.5 } });

  await expect(page.getByText("선택한 점: 2/2")).toBeVisible();
});
