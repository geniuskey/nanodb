// Evidence Site 시연 스크린샷 캡처 (US-08, 완성도·사용성 증거).
//
// native로 기동된 Core 앱을 Playwright chromium으로 순회하며 실제 화면을
// screenshots/ 에 저장한다. 승인된 demo 데이터와 sample fixture만 사용하고
// 비밀정보·비공개 자료를 포함하지 않는다. 앱 런타임에 자동 연결되는 도구가 아니라
// 로컬 실행 화면을 한 번 캡처하는 오프라인 보조 script다.
//
// 사용법: BASE_URL 기동 후
//   node scripts/capture_screenshots.mjs
// 환경변수 BASE_URL (기본 http://127.0.0.1:8000)로 대상 주소를,
// CHROMIUM_PATH로 이미 설치된 Chromium 실행 파일을 지정할 수 있다.

import { fileURLToPath } from "node:url";
import { copyFile, mkdir, readdir } from "node:fs/promises";

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:8000";
const OUT_DIR = fileURLToPath(new URL("../screenshots", import.meta.url));
// The evidence site serves its own copy from docs/public. Writing both here
// keeps the published images from drifting behind the repository ones.
const SITE_DIR = fileURLToPath(
  new URL("../docs/public/screenshots", import.meta.url),
);
const SAMPLE_IMAGE = fileURLToPath(
  new URL("../tests/e2e/fixtures/sample.png", import.meta.url),
);

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(SITE_DIR, { recursive: true });
  // CHROMIUM_PATH lets the script run where a browser is already installed but
  // Playwright's own download is unavailable (offline or restricted network).
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const shot = async (name) => {
    await page.screenshot({ path: `${OUT_DIR}/${name}`, fullPage: true });
    console.log(`captured ${name}`);
  };

  // 1) 홈: 실제 집계와 시작 CTA
  await page.goto("/");
  await page.getByTestId("home-summary").waitFor();
  await shot("01-home.png");

  // 2) 이미지 목록: 최신순 카드와 측정 수
  await page.goto("/images");
  await page.getByTestId("image-catalog").waitFor();
  await shot("02-catalog.png");

  // 3) 이미지 등록: 미리보기와 메타데이터 폼(제출 전)
  await page.goto("/images/new");
  await page.getByTestId("registration-file").setInputFiles(SAMPLE_IMAGE);
  await page.getByTestId("registration-product").fill("DEMO-PRODUCT");
  await page.locator('input[name="lot_id"]').fill("LOT-1");
  await page.locator('input[name="wafer_id"]').fill("WAFER-1");
  await page.locator('input[name="calibration_nm_per_pixel"]').fill("0.5");
  await page.getByTestId("registration-process-step").fill("Gate Etch");
  await shot("03-register.png");

  // 등록 제출 → 상세(측정) 페이지로 이동
  await page.getByTestId("registration-submit").click();
  await page.waitForURL(/\/images\/\d+$/);

  // 4) 측정 뷰어: 원본 좌표 두 점 draft와 preview
  const image = page.getByTestId("measurement-image");
  await image.waitFor();
  const box = await image.boundingBox();
  await image.click({ position: { x: box.width * 0.25, y: box.height * 0.3 } });
  await image.click({ position: { x: box.width * 0.75, y: box.height * 0.7 } });
  await page.getByTestId("measurement-preview").waitFor();
  await page.getByTestId("measurement-label-input").fill("Gate CD");
  await shot("04-measurement-draft.png");

  // 5) 저장 후: overlay 복원·선택 항목·context export 활성
  await page.getByTestId("measurement-save").click();
  await page.getByTestId("saved-measurement-item").first().waitFor();
  await page.getByTestId("context-export-button").waitFor();
  await shot("05-measurement-saved.png");

  await browser.close();

  for (const name of await readdir(OUT_DIR)) {
    if (name.endsWith(".png")) {
      await copyFile(`${OUT_DIR}/${name}`, `${SITE_DIR}/${name}`);
    }
  }
  console.log(`screenshots written to ${OUT_DIR} and ${SITE_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
