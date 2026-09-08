import { expect, test } from "@playwright/test";

import { registerSampleImage } from "./helpers";

// Unit C headline flow: run segmentation on an image, view its class map and
// stats, then extract auto features. Auto measurements must show up in the
// saved list marked distinct from manual ones and never as human-verified.
test("runs segmentation and auto feature extraction from the measurement page", async ({ page }) => {
  await registerSampleImage(page);

  await expect(page.getByTestId("segmentation-empty")).toBeVisible();
  await page.getByTestId("run-segmentation").click();

  await expect(page.getByTestId("segmentation-result")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("segmentation-map")).toBeVisible();
  await expect(page.getByTestId("segmentation-class-row").first()).toBeVisible();

  await page.getByTestId("run-features").click();

  // At least one auto measurement lands in the saved list, badged "자동".
  await expect(
    page.getByTestId("measurement-source").filter({ hasText: "자동" }).first(),
  ).toBeVisible({ timeout: 30_000 });
});

// Batch auto-analysis from the catalog covers the multi-image path: select the
// image, run the batch, and confirm the per-run result summary.
test("runs batch auto-analysis over a selected image from the catalog", async ({ page }) => {
  await registerSampleImage(page);
  await page.goto("/images");

  await page.getByTestId("batch-select").first().check();
  await page.getByTestId("batch-extract-features").check();
  await expect(page.getByTestId("run-batch")).toBeEnabled();
  await page.getByTestId("run-batch").click();

  await expect(page.getByTestId("batch-result")).toContainText("성공", { timeout: 30_000 });
  await expect(page.getByTestId("status-banner")).toContainText("일괄 자동 분석 완료");
});
