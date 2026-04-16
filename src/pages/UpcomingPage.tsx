import { addDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { categoryChipClasses, categoryDotClass } from '../lib/categoryColors'
import { formatMoney } from '../lib/money'
import {
  estimatedTakeHomeInRange,
  getPayPeriodAtOffset,
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
import { projectedBalanceEndOfDay } from '../lib/cashProjection'
import { computeBillSetAside } from '../lib/setAside'
import { getStartingFunds, hasStartingFunds } from '../lib/startingFunds'
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
  const incomeLines = useFinanceStore((s) => s.incomeLines)
  const preferences = useFinanceStore((s) => s.preferences)

  const [periodOffset, setPeriodOffset] = useState(0)

  const period = useMemo(() => {
    if (!paySettings) return null
    return getPayPeriodAtOffset(new Date(), paySettings, periodOffset)
  }, [paySettings, periodOffset])

  const periodLastDayIso = useMemo(() => {
    if (!period) return ''
    return toISODate(addDays(period.intervalEndExclusive, -1))
  }, [period])

  const dayBeforePeriodStartIso = useMemo(() => {
    if (!period) return ''
    return toISODate(addDays(period.intervalStart, -1))
  }, [period])

  const labelRange = useMemo(() => {
    if (!period) return ''
    return `${format(period.lastPayday, 'EEE, MMM d')} → ${format(period.nextPayday, 'EEE, MMM d')}`
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

  const paydaysInPeriod = useMemo(() => {
    if (!paySettings || !period) return [] as string[]
    return [
      ...listPaydayDatesInOpenRange(
        period.intervalStart,
        period.intervalEndExclusive,
        paySettings,
      ),
    ].sort((a, b) => a.localeCompare(b))
  }, [paySettings, period])

  const takeHome = useMemo(() => {
    if (!paySettings || !period) return null
    return estimatedTakeHomeInRange(
      period.intervalStart,
      period.intervalEndExclusive,
      paySettings,
      incomeLines,
    )
  }, [paySettings, incomeLines, period])

  const periodIncome = takeHome?.total ?? 0
  const periodNet = periodIncome - periodTotal

  const { date: anchorDateSaved, amount: anchorAmountSaved } = getStartingFunds(
    paySettings,
    preferences,
  )

  const projectedEndOfPeriod = useMemo(() => {
    if (
      !paySettings ||
      !period ||
      !periodLastDayIso ||
      anchorDateSaved == null ||
      anchorAmountSaved == null ||
      Number.isNaN(anchorAmountSaved)
    ) {
      return null
    }
    if (anchorDateSaved > periodLastDayIso) {
      return { kind: 'anchor_after_period' as const }
    }
    const balance = projectedBalanceEndOfDay(
      anchorDateSaved,
      anchorAmountSaved,
      periodLastDayIso,
      paySettings,
      bills,
      oneOffItems,
      expenseEntries,
      incomeLines,
    )
    return { kind: 'ok' as const, balance }
  }, [
    paySettings,
    period,
    periodLastDayIso,
    anchorDateSaved,
    anchorAmountSaved,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
  ])

  const projectedStartOfPeriod = useMemo(() => {
    if (
      !paySettings ||
      !period ||
      !dayBeforePeriodStartIso ||
      anchorDateSaved == null ||
      anchorAmountSaved == null ||
      Number.isNaN(anchorAmountSaved)
    ) {
      return null
    }
    if (anchorDateSaved > dayBeforePeriodStartIso) {
      return null
    }
    const balance = projectedBalanceEndOfDay(
      anchorDateSaved,
      anchorAmountSaved,
      dayBeforePeriodStartIso,
      paySettings,
      bills,
      oneOffItems,
      expenseEntries,
      incomeLines,
    )
    return { balance, dayBeforeIso: dayBeforePeriodStartIso }
  }, [
    paySettings,
    period,
    dayBeforePeriodStartIso,
    anchorDateSaved,
    anchorAmountSaved,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
  ])

  const projectedPeriodChange = useMemo(() => {
    if (!paySettings || projectedEndOfPeriod?.kind !== 'ok') return null
    if (!hasStartingFunds(paySettings, preferences)) return null
    const { date: ad, amount: am } = getStartingFunds(paySettings, preferences)
    if (!ad || am == null || Number.isNaN(am)) return null
    if (projectedStartOfPeriod) {
      return projectedEndOfPeriod.balance - projectedStartOfPeriod.balance
    }
    const balanceEndOfAnchorDay = projectedBalanceEndOfDay(
      ad,
      am,
      ad,
      paySettings,
      bills,
      oneOffItems,
      expenseEntries,
      incomeLines,
    )
    return projectedEndOfPeriod.balance - balanceEndOfAnchorDay
  }, [
    paySettings,
    preferences,
    projectedEndOfPeriod,
    projectedStartOfPeriod,
    anchorDateSaved,
    anchorAmountSaved,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
  ])

  const calendarDays = useMemo(() => {
    if (!period) return []
    return eachDayOfInterval({
      start: period.intervalStart,
      end: addDays(period.intervalEndExclusive, -1),
    })
  }, [period])

  const billSetAsideRows = useMemo(() => {
    if (!paySettings) return []
    const out: { bill: Bill; dueIso: string; perPayPeriod: number }[] = []
    for (const bill of bills) {
      if (bill.trackSetAside !== true) continue
      const sa = computeBillSetAside(bill, paySettings)
      if (sa.kind !== 'ok') continue
      out.push({ bill, dueIso: sa.dueIso, perPayPeriod: sa.perPayPeriod })
    }
    return out
  }, [bills, paySettings])

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
          Upcoming shows each pay period from deposit to deposit, with bills and expenses in
          that window.
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
            Same pay window as Summary: last deposit through the day before your next deposit.
            Bills, one-offs, and expense log entries are grouped by day.
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-none sm:gap-1.5">
          <button
            type="button"
            onClick={() => setPeriodOffset((w) => w - 1)}
            className="btn-secondary min-h-11 !px-2 !py-2.5 text-sm sm:!px-3"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPeriodOffset(0)}
            className="btn-secondary min-h-11 !px-2 !py-2.5 text-sm sm:!px-3"
          >
            This period
          </button>
          <button
            type="button"
            onClick={() => setPeriodOffset((w) => w + 1)}
            className="btn-secondary min-h-11 !px-2 !py-2.5 text-sm sm:!px-3"
          >
            Next
          </button>
        </div>
      </div>

      {paydaysInPeriod.length > 0 && takeHome ? (
        <div className="card-tight border border-emerald-200/80 bg-emerald-50/80 text-sm text-emerald-950 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          <p className="font-semibold">Paycheck{takeHome.paydayCount > 1 ? 's' : ''} this period</p>
          <p className="mt-1 text-xs opacity-90">
            {paydaysInPeriod.map((iso) => format(parseISO(iso), 'EEE MMM d')).join(' · ')} —{' '}
            estimated take-home {money(takeHome.total)}
          </p>
        </div>
      ) : null}

      <div className="card">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          This pay period at a glance
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          <span className="font-medium text-slate-800 dark:text-slate-200">Scheduled</span> is
          simple math: deposits and bills dated in this period only. It does{' '}
          <span className="font-medium">not</span> know how much money you already had in the bank.
          <span className="mt-1 block">
            <span className="font-medium text-slate-800 dark:text-slate-200">Projected balance</span>{' '}
            uses the balance you set in Settings and moves it forward day by day with the same
            bills and paychecks, so{' '}
            <span className="font-medium">start + change = end</span> (your “real” story in the app).
          </span>
        </p>
        {periodOffset !== 0 ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            You’re viewing a different pay period than “today.” Everything below is for the dates
            in the title only.
          </p>
        ) : null}
        {takeHome === null && periodTotal > 0 ? (
          <p className="mt-2 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/35 dark:text-amber-100">
            No paycheck dates fell in this pay window for your schedule, so income shows $0
            while bills may still appear. Check your anchor pay date in{' '}
            <Link to="/settings" className="font-semibold underline">
              Settings
            </Link>
            . Use projected balances below for dated cash flow.
          </p>
        ) : null}

        <div className="mt-5 space-y-5">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Scheduled this period
            </h4>
            <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              Ignores money you had before this period — same as deposits minus bills on the
              calendar.
            </p>
            <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-zinc-900/50">
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Estimated deposits
                </dt>
                <dd className="mt-1 tabular-nums text-base font-semibold text-slate-900 dark:text-slate-50">
                  {money(periodIncome)}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-zinc-900/50">
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Scheduled bills &amp; expenses
                </dt>
                <dd className="mt-1 tabular-nums text-base font-semibold text-slate-900 dark:text-slate-50">
                  {money(periodTotal)}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-zinc-900/50 sm:col-span-2">
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Scheduled surplus (deposits − bills)
                </dt>
                <dd className={`mt-1 tabular-nums text-base font-semibold ${netClass(periodNet)}`}>
                  {money(periodNet)}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
              Projected balance (Settings)
            </h4>
            <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              Starts from your starting balance, then applies this period’s paychecks and bills on
              each day. Read left to right: start → change → end.
            </p>
            <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-zinc-900/50">
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  At start of period
                </dt>
                <dd className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                  {projectedStartOfPeriod ? (
                    <>
                      <span className="tabular-nums text-base font-semibold">
                        {money(projectedStartOfPeriod.balance)}
                      </span>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        End of {format(parseISO(projectedStartOfPeriod.dayBeforeIso), 'EEE MMM d')}
                      </p>
                    </>
                  ) : anchorDateSaved != null && anchorAmountSaved != null ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Set anchor on or before{' '}
                      {format(parseISO(dayBeforePeriodStartIso), 'MMM d')}{' '}
                      <span className="block pt-1 text-[11px]">
                        End balance still calculates through {format(parseISO(periodLastDayIso), 'MMM d')}.
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Add balance in{' '}
                      <Link to="/settings" className="font-medium text-emerald-700 underline dark:text-emerald-400">
                        Settings
                      </Link>
                      .
                    </span>
                  )}
                </dd>
              </div>
              <div className="rounded-lg border border-emerald-200/90 bg-emerald-50/80 px-3 py-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/35">
                <dt className="text-xs font-medium text-emerald-900 dark:text-emerald-200">
                  Change this period
                </dt>
                <dd className="mt-1 text-slate-800 dark:text-slate-100">
                  {projectedPeriodChange !== null ? (
                    <>
                      <span
                        className={`tabular-nums text-base font-semibold ${netClass(projectedPeriodChange)}`}
                      >
                        {money(projectedPeriodChange)}
                      </span>
                      <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                        {projectedStartOfPeriod
                          ? `Through ${format(parseISO(periodLastDayIso), 'EEE MMM d')}.`
                          : anchorDateSaved
                            ? `From anchor ${format(parseISO(anchorDateSaved), 'MMM d')} through ${format(parseISO(periodLastDayIso), 'MMM d')}.`
                            : null}
                      </p>
                    </>
                  ) : projectedEndOfPeriod?.kind === 'anchor_after_period' ? (
                    <span className="text-xs text-slate-600 dark:text-slate-400">—</span>
                  ) : (
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Needs starting balance in{' '}
                      <Link to="/settings" className="font-medium text-emerald-700 underline dark:text-emerald-400">
                        Settings
                      </Link>
                      .
                    </span>
                  )}
                </dd>
              </div>
              <div className="rounded-lg border border-violet-200/90 bg-violet-50/90 px-3 py-2.5 dark:border-violet-800/50 dark:bg-violet-950/40">
                <dt className="text-xs font-medium text-violet-900 dark:text-violet-200">
                  At end of period ({format(parseISO(periodLastDayIso), 'MMM d')})
                </dt>
                <dd className="mt-1">
                  {projectedEndOfPeriod?.kind === 'ok' ? (
                    <span
                      className={`tabular-nums text-lg font-bold ${netClass(projectedEndOfPeriod.balance)}`}
                    >
                      {money(projectedEndOfPeriod.balance)}
                    </span>
                  ) : projectedEndOfPeriod?.kind === 'anchor_after_period' ? (
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Anchor is after this period — try a later period or an earlier anchor.
                    </span>
                  ) : (
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Add balance in{' '}
                      <Link to="/settings" className="font-medium text-emerald-700 underline dark:text-emerald-400">
                        Settings
                      </Link>
                      .
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {billSetAsideRows.length > 0 ? (
          <div className="mt-6 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-4 dark:border-emerald-800/40 dark:bg-emerald-950/25">
            <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
              Set aside toward bills (rough guide)
            </h3>
            <p className="mt-1 text-xs leading-snug text-emerald-900/90 dark:text-emerald-200/90">
              Bills you marked “Track set-aside” on the Bills page. Split across pay periods until
              the due date — not a bank balance; use projected balances above for that.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {billSetAsideRows.map(({ bill, dueIso, perPayPeriod }) => (
                <li
                  key={bill.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/50 pb-2 last:border-0 dark:border-emerald-800/30"
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {bill.name}
                    {bill.confidence === 'estimate' ? (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-800 dark:text-amber-300">
                        Est.
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-emerald-800 dark:text-emerald-200">
                    {money(perPayPeriod)} / pay period → due {format(parseISO(dueIso), 'MMM d')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <h3 className="mt-6 text-base font-semibold text-slate-900 dark:text-slate-50">
          Scheduled outflows
        </h3>
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
                    {format(d, 'EEEE, MMM d')} · {money(daySum)}
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
          Pay schedule & balance
        </Link>
        <Link to="/bills" className="btn-secondary text-sm">
          Manage bills
        </Link>
        <Link to="/calendar" className="btn-secondary text-sm">
          Month calendar
        </Link>
        <PageUndo />
      </div>
    </div>
  )
}
