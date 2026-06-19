import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // 플로우맵(MPT)과 동일한 PWA 구성. manifest와 service worker를 빌드 시 자동 생성·자동 등록한다.
    // registerType: 'autoUpdate' → 새 버전 배포 시 다음 접속에서 자동 갱신(거창한 설치/수동 새로고침 불필요).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-64.png', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: '나인웨어 업무 통합 대시보드',
        short_name: '나인웨어 업무',
        description: '팀별 업무를 간트차트로 한눈에 관리하는 나인웨어 사내 대시보드',
        lang: 'ko',
        theme_color: '#0c0d11',
        background_color: '#0c0d11',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // 새 SW가 즉시 인계받아 다음 새로고침에 반영되도록(옛 캐시 서빙 방지)
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: true },
    }),
  ],
})
