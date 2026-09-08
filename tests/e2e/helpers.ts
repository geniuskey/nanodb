import { fileURLToPath } from "node:url";

import { expect, type Page } from "@playwright/test";

export const SAMPLE_IMAGE = fileURLToPath(
  new URL("./fixtures/sample.png", import.meta.url),
);

/**
 * Register the sample image through the UI and land on its measurement page.
 * Returns the new image id parsed from the resulting URL.
 */
export async function registerSampleImage(page: Page): Promise<string> {
  await page.goto("/images/new");
  await page.getByTestId("registration-file").setInputFiles(SAMPLE_IMAGE);
  await page.getByTestId("registration-product").fill("DEMO-PRODUCT");
  await page.locator('input[name="lot_id"]').fill("LOT-1");
  await page.locator('input[name="wafer_id"]').fill("WAFER-1");
  await page.locator('input[name="calibration_nm_per_pixel"]').fill("0.5");
  await page.getByTestId("registration-submit").click();

  await expect(page).toHaveURL(/\/images\/\d+$/);
  const match = /\/images\/(\d+)$/.exec(page.url());
  expect(match).not.toBeNull();
  return match![1];
}

/** Click two distinct points on the measurement image to build a draft. */
export async function drawTwoPoints(page: Page): Promise<void> {
  const image = page.getByTestId("measurement-image");
  await expect(image).toBeVisible();
  const box = await image.boundingBox();
  expect(box).not.toBeNull();
  await image.click({ position: { x: box!.width * 0.25, y: box!.height * 0.3 } });
  await image.click({ position: { x: box!.width * 0.75, y: box!.height * 0.7 } });
}
