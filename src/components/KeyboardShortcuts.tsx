import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function isTypingTarget(t: EventTarget | null) {
  if (!t || !(t instanceof HTMLElement)) return false
  const tag = t.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return t.isContentEditable
}

export function KeyboardShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const seqRef = useRef<{ at: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return

      if ((e.key === '?' || (e.shiftKey && e.key === '/')) && !e.ctrlKey && !e.metaKey) {
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        setOpen((o) => !o)
        return
      }

      if (e.key === 'Escape') {
        setOpen(false)
        return
      }

      if (isTypingTarget(e.target)) return

      if (e.key === '/' && location.pathname === '/') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('cadence:focusWithdrawalSearch'))
        return
      }

      const now = Date.now()
      if (e.key.toLowerCase() === 'g') {
        seqRef.current = { at: now }
        return
      }
      if (
        seqRef.current &&
        now - seqRef.current.at < 900 &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        const k = e.key.toLowerCase()
        if (['s', 'c', 'u', 'b', 'y', 'w', 'r', 'i'].includes(k)) {
          e.preventDefault()
          seqRef.current = null
          const map: Record<string, string> = {
            s: '/',
            c: '/calendar',
            u: '/upcoming',
            b: '/bills',
            y: '/year',
            w: '/this-year',
            r: '/subscriptions',
            i: '/import',
          }
          navigate(map[k]!)
        } else if (e.key.length === 1) {
          seqRef.current = null
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, location.pathname])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[280] flex items-end justify-center bg-black/40 p-4 pt-16 sm:items-center sm:p-6 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kbd-shortcuts-title"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) setOpen(false)
      }}
    >
      <div className="max-h-[min(85vh,28rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200/95 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
        <h2
          id="kbd-shortcuts-title"
          className="text-lg font-bold text-slate-900 dark:text-white"
        >
          Keyboard shortcuts
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Press <kbd className="rounded border border-slate-300 px-1 dark:border-slate-600">?</kbd>{' '}
          anytime to toggle this panel (when not typing in a field).
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-white/10">
            <dt className="text-slate-600 dark:text-slate-400">Go to Summary</dt>
            <dd>
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                g
              </kbd>{' '}
              then{' '}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                s
              </kbd>
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-white/10">
            <dt className="text-slate-600 dark:text-slate-400">Calendar</dt>
            <dd>
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                g
              </kbd>{' '}
              then{' '}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                c
              </kbd>
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-white/10">
            <dt className="text-slate-600 dark:text-slate-400">Upcoming</dt>
            <dd>
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                g
              </kbd>{' '}
              then{' '}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                u
              </kbd>
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-white/10">
            <dt className="text-slate-600 dark:text-slate-400">Bills</dt>
            <dd>
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                g
              </kbd>{' '}
              then{' '}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                b
              </kbd>
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-white/10">
            <dt className="text-slate-600 dark:text-slate-400">Year</dt>
            <dd>
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                g
              </kbd>{' '}
              then{' '}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                y
              </kbd>
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-white/10">
            <dt className="text-slate-600 dark:text-slate-400">This year (remaining)</dt>
            <dd>
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                g
              </kbd>{' '}
              then{' '}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                w
              </kbd>
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-white/10">
            <dt className="text-slate-600 dark:text-slate-400">Recurring audit</dt>
            <dd>
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                g
              </kbd>{' '}
              then{' '}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                r
              </kbd>
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-white/10">
            <dt className="text-slate-600 dark:text-slate-400">Bank import</dt>
            <dd>
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                g
              </kbd>{' '}
              then{' '}
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                i
              </kbd>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600 dark:text-slate-400">
              Focus withdrawal search (Summary)
            </dt>
            <dd>
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                /
              </kbd>
            </dd>
          </div>
        </dl>
        <button
          type="button"
          className="btn-primary mt-6 w-full"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
    </div>
  )
}
