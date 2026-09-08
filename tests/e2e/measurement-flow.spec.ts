import { expect, test } from "@playwright/test";

import { drawTwoPoints, registerSampleImage } from "./helpers";

// P0 happy path: upload -> two clicks -> save -> reload/resize overlay restore
// -> context export download. Requirements/stories: US-03, US-04, US-05, US-06.
test("register, measure, restore across reload/resize, and export", async ({
  page,
}) => {
  // Upload and register (US-03).
  await registerSampleImage(page);

  // Two-point draft with live preview (US-04).
  await drawTwoPoints(page);
  await expect(page.getByTestId("measurement-preview")).toBeVisible();
  await expect(page.getByText("선택한 점: 2/2")).toBeVisible();

  // Server recalculates and saves the measurement (US-04).
  const save = page.getByTestId("measurement-save");
  await expect(save).toBeEnabled();
  await save.click();
  const saved = page.getByTestId("saved-measurement-item");
  await expect(saved).toHaveCount(1);

  // Persist across reload: the measurement and its overlay are restored (US-05).
  await page.reload();
  await expect(page.getByTestId("saved-measurement-item")).toHaveCount(1);
  await expect(page.getByTestId("measurement-overlay")).toBeVisible();

  // Restore across a resize as well (US-05).
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(page.getByTestId("measurement-overlay")).toBeVisible();
  await expect(page.getByTestId("saved-measurement-item")).toHaveCount(1);

  // Selecting a saved measurement highlights it (US-05).
  await page.getByTestId("saved-measurement-item").first().click();

  // Export the context ZIP as a download (US-06).
  const exportButton = page.getByTestId("context-export-button");
  await expect(exportButton).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportButton.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^nanodb-image-\d+\.zip$/);
});
