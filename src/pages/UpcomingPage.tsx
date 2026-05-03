import { addDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
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
} from '../lib/payPeriod'
import type { Bill, ExpenseEntry, OneOffItem, Outflow } from '../types'
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

function allocateSavedAmountsByOutflow(
  flows: Outflow[],
  billSavedMap: Map<string, number>,
): Map<string, number> {
  const usedByBill = new Map<string, number>()
  const savedByOutflow = new Map<string, number>()
  for (const o of flows) {
    if (o.source !== 'bill') continue
    const available = billSavedMap.get(o.billId) ?? 0
    if (available <= 0) continue
    const already = usedByBill.get(o.billId) ?? 0
    const remain = Math.max(0, available - already)
    if (remain <= 0) continue
    const applied = Math.min(remain, o.amount)
    usedByBill.set(o.billId, already + applied)
    savedByOutflow.set(paidKeyForOutflow(o), applied)
  }
  return savedByOutflow
}

export function UpcomingPage() {
  const paySettings = useFinanceStore((s) => s.paySettings)
  const bills = useFinanceStore((s) => s.bills)
  const oneOffItems = useFinanceStore((s) => s.oneOffItems)
  const expenseEntries = useFinanceStore((s) => s.expenseEntries)
  const paidOutflowKeys = useFinanceStore((s) => s.paidOutflowKeys)
  const togglePaidKey = useFinanceStore((s) => s.togglePaidKey)

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

  const checkingOutflows = useMemo(
    () => outflows.filter((o) => o.source !== 'bill' || (o.payFrom ?? 'checking') !== 'savings'),
    [outflows],
  )
  const byDate = useMemo(() => groupOutflowsByDate(checkingOutflows), [checkingOutflows])
  const savedAppliedByOutflow = useMemo(
    () => allocateSavedAmountsByOutflow(checkingOutflows, billSavedMap),
    [checkingOutflows, billSavedMap],
  )
  const periodScheduledTotal = useMemo(
    () =>
      checkingOutflows.reduce((sum, o) => {
        const saved = savedAppliedByOutflow.get(paidKeyForOutflow(o)) ?? 0
        return sum + Math.max(0, o.amount - saved)
      }, 0),
    [checkingOutflows, savedAppliedByOutflow],
  )
  const periodPaidTotal = useMemo(
    () =>
      checkingOutflows.reduce((sum, o) => {
        const pk = paidKeyForOutflow(o)
        if (!paidOutflowKeys.includes(pk)) return sum
        const saved = savedAppliedByOutflow.get(pk) ?? 0
        return sum + Math.max(0, o.amount - saved)
      }, 0),
    [checkingOutflows, paidOutflowKeys, savedAppliedByOutflow],
  )
  const periodSavedApplied = useMemo(() => {
    return checkingOutflows.reduce((sum, o) => {
      const pk = paidKeyForOutflow(o)
      if (paidOutflowKeys.includes(pk)) return sum
      return sum + (savedAppliedByOutflow.get(pk) ?? 0)
    }, 0)
  }, [checkingOutflows, paidOutflowKeys, savedAppliedByOutflow])
  const periodDueAfterSaved = Math.max(0, periodScheduledTotal - periodPaidTotal)

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
      const checkingFlows = flows.filter(
        (o) => o.source !== 'bill' || (o.payFrom ?? 'checking') !== 'savings',
      )
      const savedByOutflow = allocateSavedAmountsByOutflow(
        checkingFlows,
        billSavedMap,
      )
      const paid = checkingFlows.reduce((sum, o) => {
        const pk = paidKeyForOutflow(o)
        if (!paidOutflowKeys.includes(pk)) return sum
        const saved = savedByOutflow.get(pk) ?? 0
        return sum + Math.max(0, o.amount - saved)
      }, 0)
      const payCount = [
        ...listPaydayDatesInOpenRange(
          p.intervalStart,
          p.intervalEndExclusive,
          paySettings,
        ),
      ].length
      total += payCount * primaryPayAmount - paid
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
    paidOutflowKeys,
  ])

  const availableThisPeriod = rolloverBalance + periodIncome
  const endingRollover = availableThisPeriod - periodPaidTotal

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
  const periodTitle = period
    ? `${format(period.intervalStart, 'MMM d')} - ${format(payPeriodInclusiveLastDay(period), 'MMM d')}`
    : ''

  const daysWithFlows = useMemo(() => {
    const list: { iso: string; day: Date; flows: Outflow[] }[] = []
    for (const d of calendarDays) {
      const iso = toISODate(d)
      const flows = byDate.get(iso)
      if (!flows?.length) continue
      list.push({ iso, day: d, flows })
    }
    return list
  }, [calendarDays, byDate])

  const [openDayIsos, setOpenDayIsos] = useState<string[]>([])

  // Initialize the open state whenever the period changes.
  // We keep the UI compact by default: open the first 1–2 active days only.
  useEffect(() => {
    setOpenDayIsos(daysWithFlows.slice(0, 2).map((d) => d.iso))
  }, [periodOffset, daysWithFlows])

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
      <div className="card space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">Upcoming</p>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">
              {periodTitle}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Payday-to-payday due view.
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
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {labelRange}
          </p>
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

      <div className="card space-y-4">
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

        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Still due (unpaid)</p>
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
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Based on {money(periodPaidTotal)} marked paid this period
            </p>
          </div>
        </div>

        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Scheduled outflows
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          By day, in this pay period.
        </p>
        {checkingOutflows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Nothing scheduled this period. Add or edit bills on the{' '}
            <Link to="/bills" className="font-medium text-emerald-700 underline dark:text-emerald-400">
              Bills
            </Link>{' '}
            page (e.g. $550 monthly on day 2).
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {daysWithFlows.length} active day{daysWithFlows.length === 1 ? '' : 's'} ·{' '}
                {checkingOutflows.length} outflow{checkingOutflows.length === 1 ? '' : 's'} ·{' '}
                <span className="font-semibold">{money(periodDueAfterSaved)}</span> currently due
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setOpenDayIsos(daysWithFlows.map((d) => d.iso))}
                  className="btn-secondary !px-2.5 !py-1.5 text-xs"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={() => setOpenDayIsos([])}
                  className="btn-secondary !px-2.5 !py-1.5 text-xs"
                >
                  Collapse all
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-200/70 overflow-hidden rounded-lg border border-slate-200/80 bg-white/60 dark:divide-white/10 dark:border-white/10 dark:bg-zinc-900/30">
              {daysWithFlows.map(({ iso, day, flows }) => {
                const daySum = flows.reduce((sum, o) => {
                  const pk = paidKeyForOutflow(o)
                  if (paidOutflowKeys.includes(pk)) return sum
                  const saved = savedAppliedByOutflow.get(pk) ?? 0
                  return sum + Math.max(0, o.amount - saved)
                }, 0)
                const isOpen = openDayIsos.includes(iso)
                return (
                  <details
                    key={iso}
                    open={isOpen}
                    onToggle={(e) => {
                      const nextOpen = (e.currentTarget as HTMLDetailsElement).open
                      setOpenDayIsos((prev) => {
                        if (nextOpen) return prev.includes(iso) ? prev : [...prev, iso]
                        return prev.filter((x) => x !== iso)
                      })
                    }}
                    className="group"
                  >
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm hover:bg-slate-50/70 dark:hover:bg-white/5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {format(day, 'EEE, MMM d')}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {flows.length} item{flows.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <p className="shrink-0 tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {money(daySum)}
                        </p>
                      </div>
                    </summary>

                    <ul className="px-3 pb-2">
                      {flows.map((o) => {
                        const pk = paidKeyForOutflow(o)
                        const paid = paidOutflowKeys.includes(pk)
                        const saved = savedAppliedByOutflow.get(pk) ?? 0
                        const net = Math.max(0, o.amount - saved)
                        return (
                          <li
                            key={pk}
                            className="flex items-start justify-between gap-3 border-t border-slate-200/70 py-1.5 text-sm first:border-t-0 dark:border-white/10"
                          >
                            <label className="flex min-w-0 cursor-pointer items-start gap-2">
                              <input
                                type="checkbox"
                                checked={paid}
                                onChange={() => togglePaidKey(pk)}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 dark:border-slate-600"
                                aria-label={paid ? `Paid: ${o.name}` : `Mark paid: ${o.name}`}
                              />
                              <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span
                                    className={[
                                      'min-w-0 truncate font-medium',
                                      paid
                                        ? 'text-slate-500 line-through dark:text-slate-500'
                                        : 'text-slate-900 dark:text-slate-100',
                                    ].join(' ')}
                                  >
                                    {o.name}
                                  </span>
                                  {o.category?.trim() ? (
                                    <span
                                      className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] ${categoryChipClasses(o.category)}`}
                                    >
                                      <span
                                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${categoryDotClass(o.category)}`}
                                        aria-hidden
                                      />
                                      {o.category}
                                    </span>
                                  ) : null}
                                </div>
                                {saved > 0 ? (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {money(saved)} covered by saved amount
                                  </p>
                                ) : null}
                              </div>
                            </label>
                            <p
                              className={[
                                'shrink-0 tabular-nums',
                                paid
                                  ? 'text-slate-400 line-through'
                                  : 'text-slate-900 dark:text-slate-100',
                              ].join(' ')}
                            >
                              {money(net)}
                            </p>
                          </li>
                        )
                      })}
                    </ul>
                  </details>
                )
              })}
            </div>
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
