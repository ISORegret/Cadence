import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

type ToastPayload = {
  message: string
  onUndo: () => void
}

const UndoToastContext = createContext<(t: ToastPayload) => void>(() => {})

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastPayload & { id: number }) | null>(
    null,
  )
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showUndoToast = useCallback((t: ToastPayload) => {
    if (clearTimer.current) {
      clearTimeout(clearTimer.current)
      clearTimer.current = null
    }
    setToast({ ...t, id: Date.now() })
    clearTimer.current = setTimeout(() => {
      setToast(null)
      clearTimer.current = null
    }, 9000)
  }, [])

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current)
    },
    [],
  )

  return (
    <UndoToastContext.Provider value={showUndoToast}>
      {children}
      {toast ? (
        <div
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[300] flex max-w-[min(100vw-2rem,24rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200/95 bg-white px-4 py-3 text-sm text-slate-900 shadow-xl shadow-slate-900/15 dark:border-white/10 dark:bg-zinc-900 dark:text-slate-100 dark:shadow-black/50 print:hidden"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
          <button
            type="button"
            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            onClick={() => {
              toast.onUndo()
              setToast(null)
              if (clearTimer.current) {
                clearTimeout(clearTimer.current)
                clearTimer.current = null
              }
            }}
          >
            Undo
          </button>
        </div>
      ) : null}
    </UndoToastContext.Provider>
  )
}

export function useUndoToast() {
  return useContext(UndoToastContext)
}
