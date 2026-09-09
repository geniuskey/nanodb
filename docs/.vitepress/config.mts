import { withMermaid } from 'vitepress-plugin-mermaid'

// GitHub Pages 프로젝트 사이트 경로. 자산과 내부 링크가 /nanodb/ 하위에서 동작한다.
// 로컬 preview도 동일 build를 사용하므로 base가 그대로 적용된다.
// withMermaid로 감싸 개발자 가이드(아키텍처)의 ```mermaid 다이어그램을 렌더한다.
export default withMermaid({
  lang: 'ko-KR',
  title: 'NANoDB',
  description:
    'TEM/SEM 계측 근거를 축적하고 AI 개발 컨텍스트로 재사용하는 해커톤 MVP의 개발자 문서와 평가 근거 사이트',
  base: '/nanodb/',
  lastUpdated: true,
  cleanUrls: false,
  ignoreDeadLinks: false,
  themeConfig: {
    nav: [
      { text: '개발자 가이드', link: '/guide/' },
      { text: '평가 근거', link: '/evidence' },
      { text: '소개', link: '/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '시작하기',
          items: [
            { text: '개발자 가이드 개요', link: '/guide/' },
            { text: '개발 환경 설정', link: '/guide/getting-started' },
            { text: '아키텍처', link: '/guide/architecture' },
          ],
        },
        {
          text: '코드베이스',
          items: [
            { text: '백엔드', link: '/guide/backend' },
            { text: '프론트엔드', link: '/guide/frontend' },
            { text: '데이터 모델 & 마이그레이션', link: '/guide/data-model' },
            { text: 'API 레퍼런스', link: '/guide/api-reference' },
            { text: '컨텍스트 내보내기', link: '/guide/context-export' },
          ],
        },
        {
          text: '개발 & 운영',
          items: [
            { text: '테스트 · 빌드 · 배포', link: '/guide/testing-and-ci' },
            { text: '확장 · 기여 가이드', link: '/guide/contributing' },
            { text: '용어집', link: '/guide/glossary' },
          ],
        },
      ],
      '/': [
        {
          text: '평가 자료',
          items: [
            { text: '소개', link: '/' },
            { text: '심사 근거', link: '/evidence' },
          ],
        },
        {
          text: '개발자 문서',
          items: [{ text: '개발자 가이드', link: '/guide/' }],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/geniuskey/nanodb' },
    ],
    outline: { level: [2, 3], label: '이 페이지' },
    docFooter: { prev: true, next: true },
    lastUpdatedText: '마지막 업데이트',
  },
})
