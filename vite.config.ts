import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {
  version: string
}

// https://vite.dev/config/
// Default `./` for Capacitor Android. For GitHub Pages, CI sets `VITE_BASE`
// e.g. `/repo-name/app/` so the PWA lives at `user.github.io/repo/app/`.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
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
