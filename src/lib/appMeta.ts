/** Version from `package.json`, injected at build time (`vite.config.ts`). */
export const APP_VERSION: string = __APP_VERSION__

/** ISO timestamp when the web bundle was built (updates each production build). */
export const BUILD_TIME_ISO: string = __BUILD_TIME__
