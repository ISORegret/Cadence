import { addDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { categoryChipClasses, categoryDotClass } from '../lib/categoryColors'
import { formatMoney } from '../lib/money'
import {
  getPayPeriodAtOffset,
  payPeriodInclusiveLastDay,
  groupOutflowsByDate,
  listExpenseOutflowsInRange,
  listOneOffOutflowsInRange,
  listOutflowsInRange,
  listPaydayDatesInOpenRange,
  mergeAllOutflowLists,
  paidKeyForOutflow,
  toISODate,
  totalAmount,
} from '../lib/payPeriod'
import type { Bill, ExpenseEntry, OneOffItem } from '../types'
import { PageUndo } from '../components/PageUndo'
import { useFinanceStore } from '../store/financeStore'

function mergedOutflowsForRange(
  rangeStart: Date,
  rangeEndExclusive: Date,
  bills: Bill[],
  oneOffItems: OneOffItem[],
  expenseEntries: ExpenseEntry[],
) {
  return mergeAllOutflowLists([
    listOutflowsInRange(bills, rangeStart, rangeEndExclusive),
    listOneOffOutflowsInRange(oneOffItems, rangeStart, rangeEndExclusive),
    listExpenseOutflowsInRange(expenseEntries, rangeStart, rangeEndExclusive),
  ])
}

export function UpcomingPage() {
  const paySettings = useFinanceStore((s) => s.paySettings)
  const bills = useFinanceStore((s) => s.bills)
  const oneOffItems = useFinanceStore((s) => s.oneOffItems)
  const expenseEntries = useFinanceStore((s) => s.expenseEntries)

  const billSavedMap = useMemo(
    () =>
      new Map<string, number>(
        bills.map((b) => [b.id, Math.max(0, b.savedAmount ?? 0)]),
      ),
    [bills],
  )

  const [periodOffset, setPeriodOffset] = useState(0)

  const period = useMemo(() => {
    if (!paySettings) return null
    return getPayPeriodAtOffset(new Date(), paySettings, periodOffset)
  }, [paySettings, periodOffset])

  const labelRange = useMemo(() => {
    if (!period) return ''
    const through = payPeriodInclusiveLastDay(period)
    return `${format(period.intervalStart, 'EEE, MMM d')} → ${format(through, 'EEE, MMM d')} · next payday ${format(period.nextPayday, 'EEE, MMM d')}`
  }, [period])

  const outflows = useMemo(() => {
    if (!period) return []
    return mergedOutflowsForRange(
      period.intervalStart,
      period.intervalEndExclusive,
      bills,
      oneOffItems,
      expenseEntries,
    )
  }, [bills, oneOffItems, expenseEntries, period])

  const byDate = useMemo(() => groupOutflowsByDate(outflows), [outflows])
  const periodTotal = totalAmount(outflows)
  const periodSavedApplied = useMemo(() => {
    if (!period || outflows.length === 0) return 0
    const appliedByBill = new Map<string, number>()
    for (const o of outflows) {
      if (o.source !== 'bill') continue
      const available = billSavedMap.get(o.billId) ?? 0
      if (available <= 0) continue
      const already = appliedByBill.get(o.billId) ?? 0
      const remain = Math.max(0, available - already)
      if (remain <= 0) continue
      const applied = Math.min(remain, o.amount)
      appliedByBill.set(o.billId, already + applied)
    }
    return [...appliedByBill.values()].reduce((s, v) => s + v, 0)
  }, [period, outflows, billSavedMap])
  const periodDueAfterSaved = Math.max(0, periodTotal - periodSavedApplied)

  const paydaysInPeriod = useMemo(() => {
    if (!paySettings || !period) return []
    return [
      ...listPaydayDatesInOpenRange(
        period.intervalStart,
        period.intervalEndExclusive,
        paySettings,
      ),
    ].sort((a, b) => a.localeCompare(b))
  }, [paySettings, period])

  const primaryPayAmount =
    typeof paySettings?.incomePerPaycheck === 'number' ? paySettings.incomePerPaycheck : 0
  const periodIncome = paydaysInPeriod.length * primaryPayAmount
  const rolloverBalance = useMemo(() => {
    if (!period || !paySettings) return 0
    if (periodOffset <= 0) return 0
    let total = 0
    for (let offset = 0; offset < periodOffset; offset += 1) {
      const p = getPayPeriodAtOffset(new Date(), paySettings, offset)
      const flows = mergedOutflowsForRange(
        p.intervalStart,
        p.intervalEndExclusive,
        bills,
        oneOffItems,
        expenseEntries,
      )
      const periodSavedByBill = new Map<string, number>()
      for (const o of flows) {
        if (o.source !== 'bill') continue
        const available = billSavedMap.get(o.billId) ?? 0
        if (available <= 0) continue
        const already = periodSavedByBill.get(o.billId) ?? 0
        const remain = Math.max(0, available - already)
        if (remain <= 0) continue
        const applied = Math.min(remain, o.amount)
        periodSavedByBill.set(o.billId, already + applied)
      }
      const savedApplied = [...periodSavedByBill.values()].reduce((s, v) => s + v, 0)
      const due = Math.max(0, totalAmount(flows) - savedApplied)
      const payCount = [
        ...listPaydayDatesInOpenRange(
          p.intervalStart,
          p.intervalEndExclusive,
          paySettings,
        ),
      ].length
      total += payCount * primaryPayAmount - due
    }
    return total
  }, [
    period,
    paySettings,
    periodOffset,
    bills,
    oneOffItems,
    expenseEntries,
    primaryPayAmount,
    billSavedMap,
  ])

  const availableThisPeriod = rolloverBalance + periodIncome
  const endingRollover = availableThisPeriod - periodDueAfterSaved

  const calendarDays = useMemo(() => {
    if (!period) return []
    return eachDayOfInterval({
      start: period.intervalStart,
      end: addDays(period.intervalEndExclusive, -1),
    })
  }, [period])

  const money = (n: number) => formatMoney(n, paySettings)
  const netClass = (n: number) =>
    n >= 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-rose-700 dark:text-rose-400'

  if (!paySettings) {
    return (
      <div className="card p-8 text-left">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Set your pay schedule first
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Upcoming shows each pay period from payday through the day before your next payday,
          with bills and expenses in that pay period.
        </p>
        <div className="mt-6">
          <Link to="/settings" className="btn-primary">
            Configure pay schedule
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 text-left sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="section-label">Upcoming</p>
          <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">
            {labelRange}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Same pay period as Summary: last deposit through the day before your next deposit.
            Bills, one-offs, and expense log entries are grouped by day.
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-none sm:gap-1.5">
          <button
            type="button"
            onClick={() => setPeriodOffset((w) => w - 1)}
            className="btn-secondary min-h-12 !px-2 !py-2.5 text-sm sm:!px-3"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPeriodOffset(0)}
            className="btn-secondary min-h-12 !px-2 !py-2.5 text-sm sm:!px-3"
          >
            This period
          </button>
          <button
            type="button"
            onClick={() => setPeriodOffset((w) => w + 1)}
            className="btn-secondary min-h-12 !px-2 !py-2.5 text-sm sm:!px-3"
          >
            Next
          </button>
        </div>
      </div>

      {paydaysInPeriod.length > 0 ? (
        <div className="card-tight border border-emerald-200/80 bg-emerald-50/80 text-sm text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          <p className="font-semibold">Paycheck{paydaysInPeriod.length > 1 ? 's' : ''} this period</p>
          <p className="mt-1 text-xs opacity-90">
            {paydaysInPeriod.map((iso) => format(parseISO(iso), 'EEE MMM d')).join(' · ')} —{' '}
            using {money(primaryPayAmount)} per paycheck
          </p>
        </div>
      ) : null}

      <div className="card">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          This pay period
        </h3>
        {periodOffset !== 0 ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            You’re viewing a different pay period than “today.” Everything below is for the dates
            in the title only.
          </p>
        ) : null}
        {paydaysInPeriod.length === 0 && periodDueAfterSaved > 0 ? (
          <p className="mt-2 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/35 dark:text-amber-100">
            No paycheck dates fell in this pay period for your schedule, so this period uses $0 income
            while due bills may still appear. Check your anchor pay date in{' '}
            <Link to="/settings" className="font-semibold underline">
              Settings
            </Link>
            .
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-zinc-900/50">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Roll over from prior periods</p>
            <p className={`mt-1 tabular-nums text-base font-semibold ${netClass(rolloverBalance)}`}>
              {money(rolloverBalance)}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200/90 bg-emerald-50/80 px-3 py-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/35">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Pay this period</p>
            <p className="mt-1 tabular-nums text-base font-semibold text-emerald-700 dark:text-emerald-400">
              {money(periodIncome)}
            </p>
          </div>
          <div className="rounded-lg border border-rose-200/90 bg-rose-50/80 px-3 py-2.5 dark:border-rose-800/50 dark:bg-rose-950/35">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Due this period</p>
            <p className="mt-1 tabular-nums text-base font-semibold text-rose-700 dark:text-rose-400">
              {money(periodDueAfterSaved)}
            </p>
            {periodSavedApplied > 0 ? (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                After applying {money(periodSavedApplied)} already saved for bills
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-zinc-900/50">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Roll over to next period</p>
            <p className={`mt-1 tabular-nums text-base font-bold ${netClass(endingRollover)}`}>
              {money(endingRollover)}
            </p>
          </div>
        </div>

        <h3 className="mt-6 text-base font-semibold text-slate-900 dark:text-slate-50">
          Scheduled outflows
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Every dated line in this pay period — same amounts as the projected checking walk above.
        </p>
        {outflows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Nothing scheduled this period. Add or edit bills on the{' '}
            <Link to="/bills" className="font-medium text-emerald-700 underline dark:text-emerald-400">
              Bills
            </Link>{' '}
            page (e.g. $550 monthly on day 2).
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {calendarDays.map((d) => {
              const iso = toISODate(d)
              const dayFlows = byDate.get(iso)
              if (!dayFlows?.length) return null
              const daySum = totalAmount(dayFlows)
              return (
                <div key={iso}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {format(d, 'EEEE, MMM d')} · {money(daySum)} scheduled
                  </p>
                  <ul className="mt-2 space-y-2">
                    {dayFlows.map((o) => (
                      <li
                        key={paidKeyForOutflow(o)}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900/40"
                      >
                        <span className="min-w-0 font-medium text-slate-900 dark:text-slate-100">
                          {o.name}
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-800 dark:text-slate-200">
                          {money(o.amount)}
                        </span>
                        {o.category?.trim() ? (
                          <span
                            className={`inline-flex w-full items-center gap-1.5 text-xs sm:w-auto ${categoryChipClasses(o.category)}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${categoryDotClass(o.category)}`}
                              aria-hidden
                            />
                            {o.category}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/settings" className="btn-secondary text-sm">
          Pay schedule
        </Link>
        <Link to="/calendar" className="btn-secondary text-sm">
          Month calendar
        </Link>
        <PageUndo />
      </div>
    </div>
  )
}
