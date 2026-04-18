import { addDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { categoryChipClasses, categoryDotClass } from '../lib/categoryColors'
import { formatMoney } from '../lib/money'
import {
  estimatedTakeHomeInRange,
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
import {
  projectedBalanceEndOfDay,
  projectedFlowTotalsInclusiveRange,
} from '../lib/cashProjection'
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
  const savingsAccountTransfers = useFinanceStore((s) => s.savingsAccountTransfers)
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
      savingsAccountTransfers,
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
    savingsAccountTransfers,
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
      savingsAccountTransfers,
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
    savingsAccountTransfers,
  ])

  /** Deposits − all scheduled lines + balance at end of day before this period (Settings path). */
  const scheduledNetWithStartBalance = useMemo(() => {
    if (!projectedStartOfPeriod) return null
    return (
      projectedStartOfPeriod.balance + periodIncome - periodTotal
    )
  }, [projectedStartOfPeriod, periodIncome, periodTotal])

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
      savingsAccountTransfers,
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
    savingsAccountTransfers,
  ])

  /** Same calendar days that drive **Change this period** (matches projection walk). */
  const projectedChangeFlowBreakdownRange = useMemo(() => {
    if (!period || !periodLastDayIso || anchorDateSaved == null || !paySettings) {
      return null
    }
    const ps = toISODate(period.intervalStart)
    const pe = periodLastDayIso
    if (projectedStartOfPeriod) {
      return { start: ps, end: pe }
    }
    const dayAfterAnchor = toISODate(addDays(parseISO(anchorDateSaved), 1))
    if (dayAfterAnchor > pe) return null
    const start = dayAfterAnchor > ps ? dayAfterAnchor : ps
    return { start, end: pe }
  }, [
    period,
    periodLastDayIso,
    anchorDateSaved,
    projectedStartOfPeriod,
    paySettings,
  ])

  const projectedChangeFlowBreakdown = useMemo(() => {
    if (!paySettings || !projectedChangeFlowBreakdownRange) return null
    const { start, end } = projectedChangeFlowBreakdownRange
    return projectedFlowTotalsInclusiveRange(
      start,
      end,
      paySettings,
      bills,
      oneOffItems,
      expenseEntries,
      incomeLines,
      savingsAccountTransfers,
    )
  }, [
    paySettings,
    projectedChangeFlowBreakdownRange,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
    savingsAccountTransfers,
  ])

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
          This pay period
        </h3>
        {periodOffset !== 0 ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            You’re viewing a different pay period than “today.” Everything below is for the dates
            in the title only.
          </p>
        ) : null}
        {takeHome === null && periodTotal > 0 ? (
          <p className="mt-2 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-xs leading-snug text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/35 dark:text-amber-100">
            No paycheck dates fell in this pay period for your schedule, so income shows $0
            while bills may still appear. Check your anchor pay date in{' '}
            <Link to="/settings" className="font-semibold underline">
              Settings
            </Link>
            . Use projected balances below for dated cash flow.
          </p>
        ) : null}

        <div className="mt-6 space-y-6">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
              Projected checking balance
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Uses the balance from Settings and walks forward day by day: take-home deposits minus
              bills, one-offs, and expense log on their dates (same amounts as Scheduled outflows
              below).
            </p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-zinc-900/50">
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Balance entering pay period
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
                  Pay period net (+ or −)
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
                      <p className="mt-2 text-[10px] leading-snug text-slate-500 dark:text-slate-500">
                        Equals <span className="font-medium text-slate-600 dark:text-slate-400">end
                        balance − start balance</span> for this pay period. Expand{' '}
                        <span className="font-medium">Calendar check</span> below for deposits minus
                        scheduled lines.
                      </p>
                      {projectedPeriodChange !== null && projectedChangeFlowBreakdown ? (
                        <div className="mt-3 rounded-lg border border-emerald-200/80 bg-white/90 px-2.5 py-2 text-[11px] leading-snug text-slate-700 dark:border-emerald-900/40 dark:bg-zinc-900/60 dark:text-slate-200">
                          <p className="font-semibold text-emerald-950 dark:text-emerald-100">
                            What makes up this change
                          </p>
                          <ul className="mt-1.5 grid gap-1 tabular-nums">
                            <li className="flex justify-between gap-3">
                              <span>Paychecks &amp; income lines</span>
                              <span className="text-emerald-800 dark:text-emerald-300">
                                +{money(projectedChangeFlowBreakdown.income)}
                              </span>
                            </li>
                            <li className="flex justify-between gap-3">
                              <span>Bills, one-offs &amp; expenses</span>
                              <span className="text-rose-800/90 dark:text-rose-300/90">
                                −{money(projectedChangeFlowBreakdown.checkingScheduledOut)}
                              </span>
                            </li>
                            {projectedChangeFlowBreakdown.toSavings > 0 ? (
                              <li className="flex justify-between gap-3">
                                <span>To savings</span>
                                <span className="text-rose-800/90 dark:text-rose-300/90">
                                  −{money(projectedChangeFlowBreakdown.toSavings)}
                                </span>
                              </li>
                            ) : null}
                            {projectedChangeFlowBreakdown.fromSavings > 0 ? (
                              <li className="flex justify-between gap-3">
                                <span>From savings</span>
                                <span className="text-emerald-800 dark:text-emerald-300">
                                  +{money(projectedChangeFlowBreakdown.fromSavings)}
                                </span>
                              </li>
                            ) : null}
                            <li className="mt-1 flex justify-between gap-3 border-t border-emerald-200/70 pt-1 font-medium text-slate-900 dark:text-slate-100 dark:border-emerald-800/50">
                              <span>Net (income − out − to savings + from savings)</span>
                              <span
                                className={netClass(
                                  projectedChangeFlowBreakdown.income -
                                    projectedChangeFlowBreakdown.checkingScheduledOut -
                                    projectedChangeFlowBreakdown.toSavings +
                                    projectedChangeFlowBreakdown.fromSavings,
                                )}
                              >
                                {money(
                                  projectedChangeFlowBreakdown.income -
                                    projectedChangeFlowBreakdown.checkingScheduledOut -
                                    projectedChangeFlowBreakdown.toSavings +
                                    projectedChangeFlowBreakdown.fromSavings,
                                )}
                              </span>
                            </li>
                          </ul>
                        </div>
                      ) : null}
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
              <div className="rounded-lg border border-emerald-200/90 bg-emerald-50/80 px-3 py-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/35">
                <dt className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Balance end of pay period
                </dt>
                <dd className="mt-1">
                  {projectedEndOfPeriod?.kind === 'ok' ? (
                    <>
                      <span
                        className={`tabular-nums text-lg font-bold ${
                          projectedEndOfPeriod.balance >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {money(projectedEndOfPeriod.balance)}
                      </span>
                      {period ? (
                        <p className="mt-1.5 text-[10px] leading-snug text-slate-600 dark:text-slate-400">
                          End of{' '}
                          {format(
                            payPeriodInclusiveLastDay(period),
                            'EEEE, MMMM d, yyyy',
                          )}
                          . Next payday: {format(period.nextPayday, 'EEEE, MMMM d, yyyy')}.
                        </p>
                      ) : null}
                    </>
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

          <details className="rounded-lg border border-slate-200/90 bg-slate-50/40 dark:border-white/10 dark:bg-zinc-900/30">
            <summary className="cursor-pointer select-none px-3 py-3 text-sm font-medium text-slate-800 dark:text-slate-200 marker:text-slate-500">
              Calendar check
            </summary>
            <div className="border-t border-slate-200/80 px-3 pb-3 pt-2 dark:border-white/10">
              <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Same dated amounts as projected checking above. May differ from{' '}
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  Pay period net (+ or −)
                </span>{' '}
                when deposits and paydays don&apos;t align.
              </p>
              <div className="mt-3 space-y-3 text-sm">
                <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white/90 dark:border-white/10 dark:bg-zinc-900/45">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1 px-3 pt-3 pb-2 sm:gap-x-3 sm:px-4 sm:pt-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Deposits
                      </p>
                      <p className="mt-0.5 tabular-nums text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                        {money(periodIncome)}
                      </p>
                    </div>
                    <span
                      className="select-none pb-1 text-lg font-light text-slate-300 dark:text-slate-600 sm:text-xl"
                      aria-hidden
                    >
                      −
                    </span>
                    <div className="min-w-0 text-right">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Bills &amp; expenses
                      </p>
                      <p className="mt-0.5 tabular-nums text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                        {money(periodTotal)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-slate-200/85 bg-slate-50/70 px-3 py-2.5 dark:border-white/10 dark:bg-zinc-950/55 sm:px-4">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Net from schedule{' '}
                      <span className="font-normal text-slate-500 dark:text-slate-500">
                        (no bank balance)
                      </span>
                    </p>
                    <p className={`tabular-nums text-lg font-semibold tracking-tight ${netClass(periodNet)}`}>
                      {money(periodNet)}
                    </p>
                  </div>
                </div>
                {projectedStartOfPeriod && scheduledNetWithStartBalance !== null ? (
                  <div className="rounded-xl border border-violet-200/90 bg-violet-50/90 px-3 py-3 dark:border-violet-800/50 dark:bg-violet-950/35">
                    <p className="text-xs font-medium text-violet-900 dark:text-violet-200">
                      With balance at start of pay period
                    </p>
                    <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-sm tabular-nums">
                      <span className="font-semibold text-slate-900 dark:text-slate-50">
                        {money(projectedStartOfPeriod.balance)}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500" aria-hidden>
                        {periodNet >= 0 ? '+' : '−'}
                      </span>
                      <span className={`font-semibold ${netClass(periodNet)}`}>
                        {money(Math.abs(periodNet))}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500" aria-hidden>
                        =
                      </span>
                      <span
                        className={`text-lg font-bold ${netClass(scheduledNetWithStartBalance)}`}
                      >
                        {money(scheduledNetWithStartBalance)}
                      </span>
                    </div>
                    <p className="mt-2 text-center text-[10px] leading-snug text-violet-800/85 dark:text-violet-300/80">
                      Rough sanity check vs projected checking.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </details>
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
