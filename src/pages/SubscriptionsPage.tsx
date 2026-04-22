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

      <div className="card grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Monthly total
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white sm:text-2xl">
            {money(recurringMonthlyEqTotal)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Yearly total
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white sm:text-2xl">
            {money(recurringAnnualEqTotal)}
          </p>
        </div>
      </div>

      <div className="card">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Recurring bills
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Each line shows monthly and yearly totals.
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
          <ul className="mt-4 divide-y divide-slate-200/70 dark:divide-white/10">
            {recurringRows.map(({ bill, monthlyEq }) => (
              <li
                key={bill.id}
                className="flex items-start justify-between gap-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                    {bill.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">
                    {scheduleShort(bill.schedule)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="grid grid-cols-2 gap-x-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Monthly
                      </p>
                      <p className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {money(monthlyEq ?? 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Yearly
                      </p>
                      <p className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {money((monthlyEq ?? 0) * 12)}
                      </p>
                    </div>
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
          <ul className="mt-3 space-y-1.5 text-sm">
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
