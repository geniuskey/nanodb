// 활용(/usage) 페이지에 들어가는 화면 캡처를 만든다.
//
// native로 기동된 Core 앱을 Playwright chromium으로 돌며 assets/usage/ 에 PNG를 쓴다.
// 승인된 demo 데이터(scripts/prepare_demo_samples.py --load)만 쓰고 비공개 자료는 담지 않는다.
// 앱 런타임에 붙는 도구가 아니라 자산을 한 번 만들어 두는 오프라인 보조 script다.
//
// 사용법: BASE_URL 기동 + demo 데이터 적재 후
//   node scripts/capture_usage_assets.mjs
// 환경변수 BASE_URL (기본 http://127.0.0.1:8000), IMAGE_ID (기본 자동 선택),
// CHROMIUM_PATH로 이미 설치된 Chromium 실행 파일을 지정할 수 있다.

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:8000";
const OUT_DIR = fileURLToPath(new URL("../assets/usage", import.meta.url));

// 캡처에 쓸 이미지를 고른다. 자동 측정이 가장 많이 나온 demo 이미지를 쓴다.
// 네 인자(폭·높이·측벽각·곡률)가 모두 나오는 그림이라야 3번 캡처가 의미를 갖는다.
async function pickImage() {
  if (process.env.IMAGE_ID) return Number(process.env.IMAGE_ID);
  const res = await fetch(`${BASE_URL}/api/images?limit=50`);
  const body = await res.json();
  const list = Array.isArray(body) ? body : body.items;
  let best = null;
  for (const im of list) {
    const seg = await (
      await fetch(`${BASE_URL}/api/images/${im.id}/segmentation`, { method: "POST" })
    ).json();
    const fx = await (
      await fetch(`${BASE_URL}/api/images/${im.id}/features`, { method: "POST" })
    ).json();
    const count = (fx.measurements ?? []).length;
    if (!best || count > best.count) best = { id: im.id, count, seg, image: im };
  }
  if (!best) throw new Error("등록된 이미지가 없습니다. demo 데이터를 먼저 적재하세요.");
  return best;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const picked = await pickImage();
  const imageId = typeof picked === "number" ? picked : picked.id;

  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  // sticky 헤더가 요소 캡처 위로 겹치므로 숨긴다.
  const hideHeader = { content: ".app-header{display:none !important}" };

  // 1) 등록: 데모 시연 화면에서 고를 수 있는 이미지들
  await page.goto("/demo");
  await page.waitForTimeout(2500);
  await page.addStyleTag(hideHeader);
  // 카드는 세로로 긴 편이라 화면 전체를 담으면 좌우가 잘려 글자만 남는다.
  // 고를 수 있는 그림이 여러 장이라는 것만 보이면 되므로 썸네일 줄만 잘라낸다.
  await page.screenshot({
    path: `${OUT_DIR}/01-collect.png`,
    clip: { x: 245, y: 258, width: 820, height: 470 },
  });
  console.log("captured 01-collect.png");

  await page.goto(`/images/${imageId}`);
  await page.waitForTimeout(2500);
  await page.addStyleTag(hideHeader);

  // 2) 구획: 자동 분석 영역의 클래스 맵 하나만
  const auto = page.locator("section").filter({ hasText: "자동 분석" }).last();
  const maps = auto.locator("img");
  await maps.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await maps.first().screenshot({ path: `${OUT_DIR}/02-segment.png` });
  console.log("captured 02-segment.png");

  // 3) 계측: 자동 측정 라벨이 그려진 원본.
  //    `.image-stage`가 원본 이미지와 측정 오버레이를 정확히 감싸는 상자다.
  //    바깥의 `.image-viewport`는 스크롤 컨테이너라 좌우 여백이 함께 찍힌다.
  const stage = page.locator(".image-stage").first();
  await stage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await stage.screenshot({ path: `${OUT_DIR}/03-measure.png` });
  console.log("captured 03-measure.png");

  // 캡처에 쓴 이미지와 수치의 출처를 남긴다. 나중에 숫자를 검증할 수 있어야 한다.
  const detail = await (await fetch(`${BASE_URL}/api/images/${imageId}`)).json();
  const seg = await (await fetch(`${BASE_URL}/api/images/${imageId}/segmentation`)).json();
  const readme = [
    "# 활용 페이지 캡처",
    "",
    "`scripts/capture_usage_assets.mjs`가 만든 파일입니다. 손으로 고치지 마세요.",
    "다시 만들려면 demo 데이터를 적재한 앱을 띄우고 그 script를 실행하세요.",
    "",
    `- 캡처에 쓴 이미지: id ${imageId} · ${detail.original_filename}`,
    `- Product: ${detail.product_id ?? "-"} · 보정값 ${detail.calibration_nm_per_pixel} nm/pixel`,
    `- 원본 크기: ${detail.pixel_width} x ${detail.pixel_height} px`,
    `- 세그멘테이션: ${seg.method} k=${seg.classes} · ${seg.duration_ms} ms · 임계값 ${seg.thresholds.join(" · ")}`,
    "",
    "UsagePage.tsx에 적힌 수치는 위 값과 일치해야 합니다.",
    "샘플을 바꾸면 페이지의 숫자도 함께 바꾸세요.",
    "",
  ].join("\n");
  await writeFile(`${OUT_DIR}/README.md`, readme, "utf8");
  console.log("wrote README.md");

  await browser.close();
}

await main();
