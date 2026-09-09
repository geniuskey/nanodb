// Evidence Site 시연 스크린샷 캡처 (US-08, 완성도·사용성 증거).
//
// native로 기동된 Core 앱을 Playwright chromium으로 순회하며 실제 화면을
// screenshots/ 에 저장한다. 승인된 demo 데이터와 sample fixture만 사용하고
// 비밀정보·비공개 자료를 포함하지 않는다. 앱 런타임에 자동 연결되는 도구가 아니라
// 로컬 실행 화면을 한 번 캡처하는 오프라인 보조 script다.
//
// 현재 제품은 자동 분석(세그멘테이션·특징 추출)만 제공한다(수동 두 점 측정은
// MANUAL_MEASUREMENT_ENABLED=false로 꺼져 있다). 그래서 측정 화면 캡처는 자동
// 분석 흐름을 따라간다: 이미지 열기 → 세그멘테이션 실행 → 자동 특징 추출.
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

// Pick the demo image the measurement screenshots run on. The DRAM sample has
// the widest field and the richest auto features (CD, height, sidewall angle),
// so it reads best; fall back to the first image if it is not present. Demo
// image ids shift on every reseed, so this is resolved at run time.
async function pickMeasurementImageId() {
  const response = await fetch(`${BASE_URL}/api/images`);
  const images = await response.json();
  const dram = images.find((image) => (image.product_id ?? "").includes("DRAM"));
  return (dram ?? images[0]).id;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(SITE_DIR, { recursive: true });
  const imageId = await pickMeasurementImageId();
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
  await page.getByTestId("registration-image-type").fill("TEM");
  await page.getByTestId("registration-product").fill("DEMO-PRODUCT");
  await page.getByTestId("registration-lot").fill("LOT-1");
  await page.getByTestId("registration-wafer").fill("WAFER-1");
  await page.getByTestId("registration-process-step").fill("Gate Etch");
  await page.locator('input[name="calibration_nm_per_pixel"]').fill("0.5");
  // Typing into the comboboxes leaves their suggestion lists open. Click a
  // neutral spot so the outside-mousedown handler closes them all before the
  // shot, leaving a clean filled form rather than stacked dropdowns.
  await page.getByRole("heading", { name: "이미지 등록" }).click();
  await shot("03-register.png");

  // 자동 분석 흐름을 보여줄 demo 이미지 상세로 이동
  await page.goto(`/images/${imageId}`);
  await page.getByTestId("measurement-image").waitFor();

  // 4) 자동 분석: 세그멘테이션 실행 결과(클래스 맵·경계 오버레이·클래스 통계)
  await page.getByTestId("run-segmentation").click();
  await page.getByTestId("segmentation-result").waitFor();
  await page.getByTestId("segmentation-map").waitFor();
  await shot("04-segmentation.png");

  // 5) 자동 특징 추출: 자동 측정이 이미지 위에 overlay되고 '자동(미검증)'으로 목록에 남음
  await page.getByTestId("run-features").click();
  await page.getByTestId("feature-summary").waitFor();
  await page.getByTestId("saved-measurement-item").first().waitFor();
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
