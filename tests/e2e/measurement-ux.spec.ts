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

// A saved measurement can be removed, and destructive actions are confirmed in
// the app rather than by a browser dialog. Requirements: RES-005, UIX-001,
// UIX-002.
test("a saved measurement can be cancelled out of, then deleted", async ({
  page,
}) => {
  await registerSampleImage(page);
  await drawTwoPoints(page);
  await page.getByTestId("measurement-save").click();
  await expect(page.getByTestId("saved-measurement-item")).toHaveCount(1);

  // Cancelling leaves the measurement in place.
  await page.getByTestId("delete-measurement").click();
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  await page.getByTestId("confirm-cancel").click();
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("saved-measurement-item")).toHaveCount(1);

  await page.getByTestId("delete-measurement").click();
  await page.getByTestId("confirm-accept").click();

  await expect(page.getByTestId("saved-measurement-item")).toHaveCount(0);
  await expect(page.getByTestId("status-banner")).toContainText(
    "측정을 삭제했습니다",
  );
});

// A measurement names itself on the image, its annotation stays editable while
// the value it rests on does not, and both reach the exported context.
// Requirements: ANN-002, ANN-003, ANN-005, RES-007, CTX-004.
test("labels a measurement, edits it, and exports a bundle that carries it", async ({
  page,
}) => {
  await registerSampleImage(page);
  await drawTwoPoints(page);
  await page.getByTestId("measurement-label-input").fill("홀 경계");
  await page.getByTestId("measurement-save").click();
  const saved = page.getByTestId("saved-measurement-item");
  await expect(saved).toHaveCount(1);
  const valueBefore = await saved.locator("strong").textContent();

  // The label is drawn beside the line it names, so the figure and the number
  // can never disagree about which feature was measured.
  const caption = page.getByTestId("measurement-label");
  await expect(caption).toContainText("홀 경계");

  await page.getByTestId("edit-annotation").click();
  await page.getByTestId("note-input").fill("경계 재확인");
  await page.getByTestId("note-save").click();

  await expect(page.getByTestId("status-banner")).toContainText(
    "측정 라벨과 메모를 수정했습니다",
  );
  await expect(saved).toContainText("경계 재확인");
  // Editing the annotation does not touch the measured value.
  await expect(saved.locator("strong")).toHaveText(valueBefore!);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("context-export-button").click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const archive = Buffer.concat(chunks);

  // The ZIP is a real archive whose data.json carries the annotated measurement.
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

  expect(data.schema_version).toBe("3.1");
  expect(data.measurements).toHaveLength(1);
  expect(data.measurements[0].label).toBe("홀 경계");
  expect(data.measurements[0].note).toBe("경계 재확인");
  // The step describes the image once, rather than every figure on it.
  expect(data.image.process_step).toBe("Gate Etch");
});
