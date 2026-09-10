# 소개 영상 자산

| 파일 | 코덱 | 쓰는 곳 |
| --- | --- | --- |
| `nanodb_intro.mp4` | HEVC(H.265, `hvc1`) · 1920x1080 · 35s · 무음 | 원본 녹화본. 아래 사본을 만드는 소스이며 앱·사이트 어디에도 번들되지 않음 |
| `nanodb_intro_h264.mp4` | H.264(High, `avc1`) · 같은 영상 · `+faststart` | 앱 홈(`src/frontend/src/pages/HomePage.tsx`)과 GitHub Pages 홈(`docs/index.md`) 양쪽 |
| `nanodb_intro_poster.jpg` | 영상 4초 지점 프레임 · 1280px | 양쪽 홈의 `poster`(로드 전·자동재생을 끈 동작 줄이기 환경·재생 불가 시 표시) |

## 왜 두 벌인가

원본은 HEVC입니다. HEVC는 Safari에서는 재생되지만 **Chrome·Edge는 플랫폼에 하드웨어
HEVC 디코더가 있을 때만**, Firefox는 대부분 재생하지 못합니다. 공개된 Pages 사이트도, 어느 노트북에서 열릴지
모르는 데모용 앱도 방문자의 브라우저를 고를 수 없으므로, 어디서나 재생되는 H.264 사본을 씁니다.
`+faststart`라 metadata가 파일 앞에 있어 스트리밍 재생이 바로 시작됩니다.

## 사본 다시 만들기

원본을 새로 녹화해 교체했다면 H.264 사본도 같이 갱신하세요.

```bash
ffmpeg -y -i assets/video/nanodb_intro.mp4 \
  -an -c:v libx264 -profile:v high -pix_fmt yuv420p -preset slow -crf 23 \
  -movflags +faststart assets/video/nanodb_intro_h264.mp4
```

```bash
ffmpeg -y -ss 4 -i assets/video/nanodb_intro_h264.mp4 \
  -frames:v 1 -vf scale=1280:-2 -q:v 4 assets/video/nanodb_intro_poster.jpg
```

사이트 build(`npm run docs:build`)는 `docs/scripts/copy-public-assets.mjs`로 H.264 사본을
`docs/public/video/`에 복사합니다. 복사본은 `.gitignore` 대상이며 커밋하지 않습니다.
