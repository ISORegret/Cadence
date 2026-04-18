import { useEffect, useState } from 'react'
import type { CashflowStanding } from '../lib/cashflowStanding'

const badgeClass: Record<CashflowStanding['kind'], string> = {
  unknown:
    'border-slate-200/90 bg-slate-100/90 text-slate-700 dark:border-white/10 dark:bg-zinc-800/80 dark:text-slate-300',
  behind:
    'border-rose-300/90 bg-rose-50 text-rose-950 dark:border-rose-800/60 dark:bg-rose-950/45 dark:text-rose-50',
  watch:
    'border-amber-300/90 bg-amber-50 text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-50',
  good:
    'border-emerald-300/90 bg-emerald-50 text-emerald-950 dark:border-emerald-800/50 dark:bg-emerald-950/35 dark:text-emerald-50',
}

export type StandingExplainerDetail = {
  formatMoney: (n: number) => string
  hasAnchor: boolean
  projectedEndOfPayPeriod: number | null
  minBalProjected: number | null
  safeToSpend: number | null
  lowBalanceAlertEnabled: boolean
  lowBalanceThreshold: number | null
}

export function CashflowStandingBadge({
  standing,
  detail,
  className = '',
}: {
  standing: CashflowStanding
  detail?: StandingExplainerDetail
  className?: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open || !detail) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, detail])

  const inner = (
    <>
      <span className="sr-only">Cashflow status: </span>
      {standing.label}
      {detail ? (
        <span className="ml-1 text-[10px] font-normal opacity-80" aria-hidden>
          · i
        </span>
      ) : null}
    </>
  )

  const chipClass = [
    'inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-tight transition',
    badgeClass[standing.kind],
    detail
      ? 'cursor-pointer hover:brightness-[0.97] dark:hover:brightness-110'
      : '',
    className,
  ].join(' ')

  if (!detail) {
    return (
      <span role="status" className={chipClass}>
        {inner}
      </span>
    )
  }

  const why = (() => {
    if (!detail.hasAnchor) {
      return 'Add a starting balance and date in Settings so projections can show whether you stay above zero through the pay period.'
    }
    if (standing.kind === 'behind') {
      return (
        <>
          Projections show either the{' '}
          <strong className="font-medium text-slate-800 dark:text-slate-100">
            lowest balance before payday
          </strong>{' '}
          or your{' '}
          <strong className="font-medium text-slate-800 dark:text-slate-100">
            balance at the end of this pay period
          </strong>{' '}
          dipping below zero (
          {detail.minBalProjected !== null ? (
            <>
              low: {detail.formatMoney(detail.minBalProjected)}, end:{' '}
              {detail.projectedEndOfPayPeriod !== null
                ? detail.formatMoney(detail.projectedEndOfPayPeriod)
                : '—'}
            </>
          ) : (
            <>
              end of period:{' '}
              {detail.projectedEndOfPayPeriod !== null
                ? detail.formatMoney(detail.projectedEndOfPayPeriod)
                : '—'}
            </>
          )}
          ).
        </>
      )
    }
    if (standing.kind === 'watch') {
      return (
        <>
          No negative balance in the projection, but your{' '}
          <strong className="font-medium text-slate-800 dark:text-slate-100">
            lowest point
          </strong>{' '}
          ({detail.minBalProjected !== null ? detail.formatMoney(detail.minBalProjected) : '—'})
          is below your alert threshold (
          {detail.lowBalanceThreshold !== null
            ? detail.formatMoney(detail.lowBalanceThreshold)
            : '—'}
          ).{' '}
          {detail.lowBalanceAlertEnabled ? '' : '(Alerts are off in Settings.)'}
        </>
      )
    }
    if (standing.kind === 'good') {
      return (
        <>
          Projected balance stays at or above zero through this pay period; end of period looks like{' '}
          {detail.projectedEndOfPayPeriod !== null
            ? detail.formatMoney(detail.projectedEndOfPayPeriod)
            : '—'}
          . Safe-to-spend (after cushion):{' '}
          {detail.safeToSpend !== null ? detail.formatMoney(detail.safeToSpend) : '—'}.
        </>
      )
    }
    return 'Finish setup in Settings to see a full projection-based status.'
  })()

  return (
    <div className="relative inline-block max-w-full text-left">
      <button
        type="button"
        className={chipClass}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {inner}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[140] cursor-default bg-transparent"
            aria-label="Close status details"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-[calc(100%+0.35rem)] z-[141] w-[min(calc(100vw-2rem),20rem)] rounded-xl border border-slate-200/95 bg-white p-3 text-xs leading-relaxed text-slate-700 shadow-xl dark:border-white/10 dark:bg-zinc-900 dark:text-slate-300">
            <p className="font-semibold text-slate-900 dark:text-white">Why this status</p>
            <p className="mt-2">{why}</p>
          </div>
        </>
      ) : null}
    </div>
  )
}
