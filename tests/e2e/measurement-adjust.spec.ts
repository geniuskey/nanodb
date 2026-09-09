import { expect, test } from "@playwright/test";

import { drawTwoPoints, registerSampleImage } from "./helpers";

// Automatic extraction is not exact and a hand-placed point can miss, so the
// points of a saved measurement are correctable. The correction is recorded
// rather than silent: the value is recomputed from the moved points, what the
// measurement first read is kept beside it, and it can be put back.
test("a saved measurement can be corrected, compared and reverted", async ({ page }) => {
  await registerSampleImage(page);
  await drawTwoPoints(page);
  await page.getByTestId("measurement-label-input").fill("Gate CD");
  await page.getByTestId("measurement-save").click();
  const saved = page.getByTestId("saved-measurement-item");
  await expect(saved).toHaveCount(1);
  const before = await saved.locator("strong").textContent();

  await page.getByTestId("adjust-measurement").click();
  await expect(page.getByTestId("adjust-panel")).toBeVisible();
  // Nothing has moved yet, so there is nothing to save.
  await expect(page.getByTestId("adjust-save")).toBeDisabled();

  const handles = page.getByTestId("adjust-handle");
  await expect(handles).toHaveCount(2);
  // Clicking the row below scrolls the image out of view; the drag needs it back.
  await handles.first().scrollIntoViewIfNeeded();
  const box = await handles.first().boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 40, box!.y + box!.height / 2 + 25, {
    steps: 8,
  });
  await page.mouse.up();

  // The value on the image counts along with the drag, before anything is saved.
  await expect(page.getByTestId("adjust-delta")).toBeVisible();
  await expect(page.getByTestId("adjust-save")).toBeEnabled();
  await expect(saved.locator("strong")).toHaveText(before!);

  await page.getByTestId("adjust-save").click();
  await expect(page.getByTestId("status-banner")).toContainText("보정했습니다");
  await expect(page.getByTestId("measurement-adjusted")).toBeVisible();
  // The first reading stays readable next to the corrected one.
  await expect(page.getByTestId("measurement-original")).toContainText("처음 값");
  await expect(saved.locator("strong")).not.toHaveText(before!);

  // A correction is a judgement call, so it has to be undoable.
  await page.getByTestId("adjust-measurement").click();
  await page.getByTestId("adjust-revert").click();
  await expect(page.getByTestId("status-banner")).toContainText("복원했습니다");
  await expect(page.getByTestId("measurement-adjusted")).toHaveCount(0);
  await expect(saved.locator("strong")).toHaveText(before!);
});

// Placing points is a hand operation on a noisy image: one misplaced click
// should cost one click, not the whole drawing.
test("a misplaced point can be undone, dragged or abandoned while drawing", async ({
  page,
}) => {
  await registerSampleImage(page);
  const image = page.getByTestId("measurement-image");
  const box = await image.boundingBox();
  await image.click({ position: { x: box!.width * 0.25, y: box!.height * 0.3 } });
  await image.click({ position: { x: box!.width * 0.75, y: box!.height * 0.7 } });
  await expect(page.getByTestId("measurement-preview")).toBeVisible();

  // Undo takes back the last point and leaves the first standing.
  await page.getByTestId("measurement-undo").click();
  await expect(page.getByTestId("measurement-preview")).toHaveCount(0);
  await expect(page.getByText("선택한 점: 1/2")).toBeVisible();

  await image.click({ position: { x: box!.width * 0.6, y: box!.height * 0.6 } });
  const first = await page.getByTestId("measurement-preview").textContent();

  // A placed point can be dragged into place instead of redrawing.
  const handle = page.getByTestId("adjust-handle").first();
  await handle.scrollIntoViewIfNeeded();
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2 + 50,
    handleBox!.y + handleBox!.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(page.getByTestId("measurement-preview")).not.toHaveText(first!);

  // Escape abandons the drawing entirely.
  await page.keyboard.press("Escape");
  await expect(page.getByText("선택한 점: 0/2")).toBeVisible();
  await expect(page.getByTestId("measurement-save")).toBeDisabled();
});
