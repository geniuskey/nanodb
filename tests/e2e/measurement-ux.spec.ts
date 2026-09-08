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

// A saved measurement's note is editable while the value it rests on is not,
// and a drawn shape reaches the exported context. Requirements: RES-007, ANN-008.
test("edits a note and exports a bundle that carries the shape", async ({
  page,
}) => {
  await registerSampleImage(page);
  await drawTwoPoints(page);
  await page.getByTestId("measurement-save").click();
  const saved = page.getByTestId("saved-measurement-item");
  await expect(saved).toHaveCount(1);
  const valueBefore = await saved.locator("strong").textContent();

  await page.getByTestId("edit-note").click();
  await page.getByTestId("note-input").fill("경계 재확인");
  await page.getByTestId("note-save").click();

  await expect(page.getByTestId("status-banner")).toContainText("메모를 수정했습니다");
  await expect(saved).toContainText("경계 재확인");
  // Editing the note does not touch the measured value.
  await expect(saved.locator("strong")).toHaveText(valueBefore!);

  // Draw a labelled shape, then export.
  await page.getByTestId("tool-circle").click();
  const box = (await page.getByTestId("annotation-overlay").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5);
  await page.mouse.up();
  await expect(page.getByTestId("annotation-row")).toHaveCount(1);
  await page.getByTestId("annotation-name").fill("홀 경계");
  await page.getByTestId("annotation-step").click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("context-export-button").click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const archive = Buffer.concat(chunks);

  // The ZIP is a real archive whose data.json carries the labelled shape.
  const text = archive.toString("latin1");
  expect(text.slice(0, 2)).toBe("PK");
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "nanodb-e2e-"));
  const zipPath = join(dir, "bundle.zip");
  writeFileSync(zipPath, archive);
  const data = JSON.parse(
    execFileSync("unzip", ["-p", zipPath, "data.json"], { encoding: "utf-8" }),
  );

  expect(data.schema_version).toBe("1.1");
  expect(data.annotations).toHaveLength(1);
  expect(data.annotations[0].kind).toBe("circle");
  expect(data.annotations[0].measurement_name).toBe("홀 경계");
  expect(data.measurements[0].note).toBe("경계 재확인");
});
