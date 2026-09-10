// Evidence site(VitePress)가 저장소 공용 자산을 public/ 으로 가져오는 build 전 단계.
//
// 홈(docs/index.md)의 소개 영상은 앱 홈과 같은 영상을 재생한다. 5MB대 바이너리를 docs/
// 아래에 한 번 더 커밋하면 같은 영상이 저장소에 두 벌 남으므로, 커밋 대신 build·dev 직전에
// 복사한다. 복사본(docs/public/video/)은 .gitignore 대상이고, 원본은 assets/video/ 뿐이다.
//
// 사이트가 쓰는 것은 H.264 사본(nanodb_intro_h264.mp4)이다. 원본 nanodb_intro.mp4는
// HEVC라 Safari 밖에서는 재생되지 않는 브라우저가 많다. 자세한 사정은 assets/video/README.md.
import { cp, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(docsRoot, "..");

// [저장소 원본, docs/ 기준 목적지] 쌍.
const ASSETS = [
  ["assets/video/nanodb_intro_h264.mp4", "public/video/nanodb_intro_h264.mp4"],
  ["assets/video/nanodb_intro_poster.jpg", "public/video/nanodb_intro_poster.jpg"],
];

for (const [from, to] of ASSETS) {
  const source = resolve(repoRoot, from);
  const destination = resolve(docsRoot, to);
  try {
    await stat(source);
  } catch {
    // 원본이 없으면 build를 세운다. 홈에 재생되지 않는 영상을 배포하는 것보다
    // CI가 여기서 실패하고 원인을 말하는 편이 낫다.
    console.error(`[copy-public-assets] 원본을 찾을 수 없습니다: ${from}`);
    process.exit(1);
  }
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination);
  console.log(`[copy-public-assets] ${from} -> docs/${to}`);
}
