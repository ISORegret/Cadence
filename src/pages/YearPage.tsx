import { addYears } from 'date-fns'
import { useMemo, useState } from 'react'
import { formatMoney } from '../lib/money'
import { sumByCategory } from '../lib/budgetMath'
import {
  estimatedTakeHomeInRange,
  listExpenseOutflowsInRange,
  listOneOffOutflowsInRange,
  listOutflowsInRange,
  mergeAllOutflowLists,
  totalAmount,
} from '../lib/payPeriod'
import { useFinanceStore } from '../store/financeStore'

export function YearPage() {
  const paySettings = useFinanceStore((s) => s.paySettings)
  const bills = useFinanceStore((s) => s.bills)
  const oneOffItems = useFinanceStore((s) => s.oneOffItems)
  const expenseEntries = useFinanceStore((s) => s.expenseEntries)
  const incomeLines = useFinanceStore((s) => s.incomeLines)

  const [year, setYear] = useState(() => new Date().getFullYear())
  const money = (n: number) => formatMoney(n, paySettings)

  const { outflows, byCategory, totalOut, incomeEst } = useMemo(() => {
      const ys = new Date(year, 0, 1)
      const ye = addYears(ys, 1)
      const billPart = listOutflowsInRange(bills, ys, ye)
      const onePart = listOneOffOutflowsInRange(oneOffItems, ys, ye)
      const expPart = listExpenseOutflowsInRange(expenseEntries, ys, ye)
      const merged = mergeAllOutflowLists([billPart, onePart, expPart])
      const income =
        paySettings != null
          ? estimatedTakeHomeInRange(ys, ye, paySettings, incomeLines)
          : null
      return {
        outflows: merged,
        byCategory: sumByCategory(merged),
        totalOut: totalAmount(merged),
        incomeEst: income,
      }
    }, [bills, oneOffItems, expenseEntries, incomeLines, paySettings, year])

  const netEst =
    incomeEst != null ? incomeEst.total - totalOut : null

  const categoryMax = Math.max(...byCategory.values(), 1)

  return (
    <div className="space-y-5 text-left">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-label">Overview</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
            Year at a glance
          </h2>
          <p className="mt-1 max-w-lg text-sm text-slate-600 dark:text-slate-400">
            Outflows are withdrawals dated in {year} (bills, one-offs, quick
            expenses). When you have a pay schedule, estimated take-home adds each
            payday’s deposit (same logic as Summary) plus extra income lines every
            payday.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Year
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value)
              if (Number.isFinite(y)) setYear(Math.min(2100, Math.max(2000, y)))
            }}
            className="input-field w-28"
          />
        </label>
      </div>

      <div className="card-hero relative z-0">
        <div className="relative z-10 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="section-label">Outflows</p>
              <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                {money(totalOut)}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Scheduled spending in {year}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
                {outflows.length} withdrawal line{outflows.length === 1 ? '' : 's'}
              </p>
            </div>
            <div>
              <p className="section-label">Estimated take-home</p>
              {incomeEst != null ? (
                <>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {money(incomeEst.total)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {incomeEst.paydayCount} pay deposit
                    {incomeEst.paydayCount === 1 ? '' : 's'} in {year} (
                    {(paySettings?.frequency ?? 'schedule').replaceAll('_', ' ')}
                    )
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Add a pay schedule and take-home amounts under Settings to
                  estimate how much would land across paydays in {year}.
                </p>
              )}
            </div>
          </div>
          <div className="border-t border-emerald-200/50 pt-5 dark:border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Estimated net ({year})
            </p>
            {netEst != null ? (
              <p
                className={[
                  'mt-1 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl',
                  netEst > 0
                    ? 'text-emerald-800 dark:text-emerald-200'
                    : netEst < 0
                      ? 'text-red-800 dark:text-red-200'
                      : 'text-slate-800 dark:text-slate-200',
                ].join(' ')}
              >
                {netEst > 0 ? '+' : netEst < 0 ? '−' : ''}
                {money(Math.abs(netEst))}
                <span className="ml-2 text-base font-semibold text-slate-500 dark:text-slate-400">
                  (in − out)
                </span>
              </p>
            ) : (
              <p className="mt-1 text-lg font-semibold text-slate-500 dark:text-slate-400">
                —
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
              Estimate only — not tax or employer advice. Irregular bonuses and
              skipped paychecks are not modeled.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          By category
        </h3>
        {byCategory.size === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Nothing dated in this year yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {[...byCategory.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amt]) => (
                <li key={cat}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{cat}</span>
                    <span className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {money(amt)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${(amt / categoryMax) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  )
}
