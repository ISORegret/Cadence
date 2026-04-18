import { Link } from 'react-router-dom'
import type { Bill, BillSchedule } from '../types'
import {
  estimatedMonthlyBillOutflow,
  estimatedMonthlyIncomeLinesTotal,
} from '../lib/recurringMonthly'
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
  const incomeLines = useFinanceStore((s) => s.incomeLines)
  const quickExpenseTemplates = useFinanceStore((s) => s.quickExpenseTemplates)
  const paySettings = useFinanceStore((s) => s.paySettings)

  const currency = paySettings?.currencyCode ?? 'USD'
  const money = (n: number) =>
    n.toLocaleString(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    })

  const recurringRows = bills
    .map((b: Bill) => {
      const monthly = estimatedMonthlyBillOutflow(b.schedule, b.amount)
      return { bill: b, monthly }
    })
    .filter((r) => r.monthly !== null)
    .sort((a, b) => (b.monthly ?? 0) - (a.monthly ?? 0))

  const recurringMonthlySum = recurringRows.reduce(
    (s, r) => s + (r.monthly ?? 0),
    0,
  )
  const recurringAnnualSum = recurringMonthlySum * 12

  const oneTimeBills = bills.filter((b) => b.schedule.kind === 'once')

  const incomeMonthly =
    paySettings !== null
      ? estimatedMonthlyIncomeLinesTotal(paySettings, incomeLines)
      : incomeLines.reduce((s, x) => s + x.amount, 0)

  return (
    <div className="space-y-6 text-left print:max-w-none">
      <div>
        <p className="section-label">Planning</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
          Recurring audit
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Normalizes bills to a rough monthly cost (weekly × 52/12, biweekly × 26/12) so you can
          compare subscriptions and fixed bills.{' '}
          <Link to="/bills" className="link-accent">
            Edit bills
          </Link>{' '}
          or{' '}
          <Link to="/settings" className="link-accent">
            income lines
          </Link>
          .
        </p>
      </div>

      <div className="card grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Recurring bills (monthly eq.)
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {money(recurringMonthlySum)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Same, annualized
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {money(recurringAnnualSum)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Extra income lines (~ / month)
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
            {money(incomeMonthly)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Uses your pay frequency to scale per-paycheck extras (same rule as Summary).
          </p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Recurring bills
        </h3>
        {recurringRows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No recurring schedules yet. Add bills on{' '}
            <Link to="/bills" className="link-accent">
              Bills
            </Link>
            .
          </p>
        ) : (
          <table className="mt-4 w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Schedule</th>
                <th className="py-2 pr-3 text-right">Raw amount</th>
                <th className="py-2 pr-3 text-right">~ Monthly</th>
                <th className="py-2 text-right">~ Annual</th>
              </tr>
            </thead>
            <tbody>
              {recurringRows.map(({ bill, monthly }) => (
                <tr
                  key={bill.id}
                  className="border-b border-slate-100 dark:border-slate-800"
                >
                  <td className="py-2.5 pr-3 font-medium text-slate-800 dark:text-slate-200">
                    {bill.name}
                    {bill.category ? (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {bill.category}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-400">
                    {scheduleShort(bill.schedule)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{money(bill.amount)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums font-medium">
                    {money(monthly ?? 0)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                    {money((monthly ?? 0) * 12)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {incomeLines.length > 0 ? (
        <div className="card overflow-x-auto">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Extra income lines
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Added to every paycheck on Summary (not annual salary — side lines only).
          </p>
          <table className="mt-4 w-full min-w-[400px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="py-2 pr-3">Label</th>
                <th className="py-2 text-right">Per paycheck</th>
              </tr>
            </thead>
            <tbody>
              {incomeLines.map((line) => (
                <tr
                  key={line.id}
                  className="border-b border-slate-100 dark:border-slate-800"
                >
                  <td className="py-2.5 pr-3 text-slate-800 dark:text-slate-200">{line.label}</td>
                  <td className="py-2.5 text-right tabular-nums text-emerald-800 dark:text-emerald-200">
                    {money(line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {quickExpenseTemplates.length > 0 ? (
        <div className="card">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Quick expense templates
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            One-tap amounts on Summary — not part of monthly recurring totals above.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {quickExpenseTemplates.map((t) => (
              <li
                key={t.id}
                className="flex justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800"
              >
                <span className="text-slate-700 dark:text-slate-300">{t.label}</span>
                <span className="tabular-nums text-slate-600 dark:text-slate-400">
                  {money(t.amount)} each
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
