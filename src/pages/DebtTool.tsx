import { useMemo, useState } from 'react'
import { estimatePayoffMonths } from '../lib/debt'
export function DebtTool() {
  const [principal, setPrincipal] = useState('')
  const [apr, setApr] = useState('')
  const [payment, setPayment] = useState('')

  const months = useMemo(() => {
    const p = Number(principal)
    const r = Number(apr)
    const m = Number(payment)
    if (!Number.isFinite(p) || !Number.isFinite(r) || !Number.isFinite(m)) {
      return null
    }
    return estimatePayoffMonths(p, r, m)
  }, [principal, apr, payment])

  return (
    <div className="space-y-5 text-left print:max-w-none">
      <div>
        <p className="section-label">Tools</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
          Debt payoff estimator
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Fixed APR, fixed monthly payment — rough estimate only (no fees or
          variable rates).
        </p>
      </div>

      <div className="card grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Principal
          </span>
          <input
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            inputMode="decimal"
            className="input-field mt-1 w-full"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            APR (% yearly)
          </span>
          <input
            value={apr}
            onChange={(e) => setApr(e.target.value)}
            inputMode="decimal"
            className="input-field mt-1 w-full"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Monthly payment
          </span>
          <input
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
            inputMode="decimal"
            className="input-field mt-1 w-full"
          />
        </label>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 backdrop-blur-sm dark:border-white/5 dark:bg-white/[0.04]">
        {months === null ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Enter numbers in all fields. If payment is too low to cover interest,
            payoff is not possible at that rate.
          </p>
        ) : (
          <p className="text-sm text-slate-800 dark:text-slate-200">
            Estimated time to payoff:{' '}
            <span className="bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text font-bold text-transparent dark:from-emerald-400 dark:to-green-400">
              {months} month{months === 1 ? '' : 's'}
            </span>{' '}
            ({Math.ceil(months / 12)} year{Math.ceil(months / 12) === 1 ? '' : 's'}
            ).
          </p>
        )}
      </div>
    </div>
  )
}
