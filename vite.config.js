import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Activate the new SW immediately instead of waiting for all tabs to close
      injectRegister: 'auto',
      workbox: {
        // Cache every built asset on install
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff2}'],

        // Serve index.html from SW cache for all navigation requests.
        // This makes the SPA load instantly on return visits and work fully
        // offline (the service worker intercepts / and serves cached index.html
        // rather than going to the network and failing).
        navigateFallback: 'index.html',

        // Only apply navigateFallback for our own origin, not external fetches
        navigateFallbackAllowlist: [/^(?!\/__).*/],

        // Remove SW caches from old versions automatically
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          {
            // Supabase API — network first so sync always gets fresh data,
            // falls back to cache so the app keeps working offline
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts / any CDN asset — cache first
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      includeAssets: ['logo.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'PortionSpot POS',
        short_name: 'PortionSpot',
        description: 'Point of Sale System',
        theme_color: '#DC2626',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: { host: true, port: 5173 },
})
