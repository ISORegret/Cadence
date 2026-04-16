import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// Default `./` for Capacitor Android. For GitHub Pages, CI sets `VITE_BASE`
// e.g. `/repo-name/app/` so the PWA lives at `user.github.io/repo/app/`.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Cadence — budget between paychecks',
        short_name: 'Cadence',
        description:
          'Cadence: manual pay-period budgeting. Nothing connects to your bank; data stays on this device.',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: './',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
})
