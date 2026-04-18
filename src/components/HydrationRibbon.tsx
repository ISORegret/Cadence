import { useEffect, useState } from 'react'
import { useFinanceStore } from '../store/financeStore'

/** Thin top bar while persisted state loads from disk (first paint). */
export function HydrationRibbon() {
  const [done, setDone] = useState(() => useFinanceStore.persist.hasHydrated())

  useEffect(() => {
    if (done) return undefined
    return useFinanceStore.persist.onFinishHydration(() => setDone(true))
  }, [done])

  if (done) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[400] h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 opacity-95 print:hidden"
      role="progressbar"
      aria-label="Loading saved data"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-busy="true"
    />
  )
}
