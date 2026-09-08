import { defineConfig } from 'vitepress'

// GitHub Pages 프로젝트 사이트 경로. 자산과 내부 링크가 /nanodb_mvp/ 하위에서 동작한다.
// 로컬 preview도 동일 build를 사용하므로 base가 그대로 적용된다.
export default defineConfig({
  lang: 'ko-KR',
  title: 'NANoDB',
  description:
    'TEM 계측 근거를 AI 소프트웨어 개발의 명세·검증 컨텍스트로 재사용하는 해커톤 MVP의 평가 근거 사이트',
  base: '/nanodb_mvp/',
  lastUpdated: true,
  cleanUrls: false,
  ignoreDeadLinks: false,
  themeConfig: {
    nav: [
      { text: '소개', link: '/' },
      { text: '근거', link: '/evidence' },
    ],
    sidebar: [
      {
        text: '평가 자료',
        items: [
          { text: '소개', link: '/' },
          { text: '심사 근거', link: '/evidence' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/' },
    ],
    outline: { level: [2, 3], label: '이 페이지' },
    docFooter: { prev: false, next: false },
  },
})
