import { Link } from 'react-router-dom'
import type { Bill, BillSchedule } from '../types'
import { estimatedMonthlyBillOutflow } from '../lib/recurringMonthly'
import { useFinanceStore } from '../store/financeStore'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function scheduleShort(s: BillSchedule): string {
  switch (s.kind) {
    case 'once':
      return `One-time · ${s.date}`
    case 'monthly':
      return `Monthly · day ${s.dayOfMonth}`
    case 'weekly':
      return `Weekly · ${weekdays[s.dayOfWeek] ?? '?'}`
    case 'biweekly':
      return `Biweekly · from ${s.anchorDate}`
    default:
      return '—'
  }
}

export function SubscriptionsPage() {
  const bills = useFinanceStore((s) => s.bills)
  const paySettings = useFinanceStore((s) => s.paySettings)

  const currency = paySettings?.currencyCode ?? 'USD'
  const money = (n: number) =>
    n.toLocaleString(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    })

  const recurringRows = bills
    .map((b: Bill) => ({
      bill: b,
      monthlyEq: estimatedMonthlyBillOutflow(b.schedule, b.amount),
    }))
    .filter((x) => x.bill.schedule.kind !== 'once')
    .sort((a, b) => (b.monthlyEq ?? 0) - (a.monthlyEq ?? 0))

  const oneTimeBills = bills.filter((b) => b.schedule.kind === 'once')
  const recurringBaseTotal = recurringRows.reduce((s, x) => s + x.bill.amount, 0)
  const recurringMonthlyEqTotal = recurringRows.reduce((s, x) => s + (x.monthlyEq ?? 0), 0)
  const recurringAnnualEqTotal = recurringMonthlyEqTotal * 12

  return (
    <div className="space-y-6 text-left print:max-w-none">
      <div>
        <p className="section-label">Planning</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
          Recurring audit
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Keep this simple: review recurring bills and their base amounts so you can clean up
          duplicates and unused subscriptions.{' '}
          <Link to="/bills" className="link-accent">
            Edit bills
          </Link>
          .
        </p>
      </div>

      <div className="card grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Recurring bill count
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {recurringRows.length}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Sum of recurring base amounts
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {money(recurringBaseTotal)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Annual total (normalized)
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {money(recurringAnnualEqTotal)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Uses schedule-based monthly equivalent × 12.
          </p>
        </div>
      </div>

      <div className="card">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Recurring bills
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Focus on what matters: the bill amount and schedule. No monthly/annual estimate math.
        </p>
        {recurringRows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No recurring schedules yet. Add bills on{' '}
            <Link to="/bills" className="link-accent">
              Bills
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {recurringRows.map(({ bill, monthlyEq }) => (
              <li
                key={bill.id}
                className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-3 dark:border-white/10 dark:bg-zinc-900/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {bill.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {scheduleShort(bill.schedule)}
                      {bill.category ? ` · ${bill.category}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {money(bill.amount)}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-1.5 dark:border-white/10 dark:bg-zinc-900/50">
                    <p className="font-medium text-slate-500 dark:text-slate-400">Monthly eq.</p>
                    <p className="mt-0.5 tabular-nums text-sm text-slate-800 dark:text-slate-200">
                      {money(monthlyEq ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-1.5 dark:border-white/10 dark:bg-zinc-900/50">
                    <p className="font-medium text-slate-500 dark:text-slate-400">Annual eq.</p>
                    <p className="mt-0.5 tabular-nums text-sm text-slate-800 dark:text-slate-200">
                      {money((monthlyEq ?? 0) * 12)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {oneTimeBills.length > 0 ? (
        <div className="card">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            One-time bills
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Excluded from recurring monthly totals.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {oneTimeBills.map((b) => (
              <li key={b.id} className="flex justify-between gap-2">
                <span className="text-slate-700 dark:text-slate-300">{b.name}</span>
                <span className="tabular-nums">
                  {money(b.amount)} ·{' '}
                  {b.schedule.kind === 'once' ? b.schedule.date : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
