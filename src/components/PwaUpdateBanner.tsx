import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * When a new service worker + precached assets are ready, prompts to reload so the user
 * knows they are switching to a newly deployed build (PWA / supported browsers).
 */
export function PwaUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    function checkWhenVisible() {
      if (document.visibilityState !== 'visible') return
      void navigator.serviceWorker?.getRegistration()?.then((reg) => reg?.update())
    }
    document.addEventListener('visibilitychange', checkWhenVisible)
    return () => document.removeEventListener('visibilitychange', checkWhenVisible)
  }, [])

  if (!needRefresh) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[560] border-t border-emerald-200/90 bg-white/95 px-3 py-3 shadow-[0_-8px_32px_-8px_rgba(15,23,42,0.18)] backdrop-blur-md dark:border-emerald-900/40 dark:bg-zinc-950/95 sm:px-4 print:hidden"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 lg:max-w-5xl">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            New version ready
          </p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Update downloaded — reload to use the latest Cadence.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            className="btn-secondary min-h-9 px-3 py-2 text-xs font-semibold sm:text-sm"
            onClick={() => setNeedRefresh(false)}
          >
            Later
          </button>
          <button
            type="button"
            className="btn-primary min-h-9 px-4 py-2 text-xs font-semibold shadow-emerald-900/15 sm:text-sm"
            onClick={() => {
              void updateServiceWorker(true)
            }}
          >
            Reload now
          </button>
        </div>
      </div>
    </div>
  )
}
