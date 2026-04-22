import { addDays, format, startOfDay, startOfYear } from 'date-fns'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney } from '../lib/money'
import {
  estimatedTakeHomeInRange,
  listExpenseOutflowsInRange,
  listOneOffOutflowsInRange,
  listOutflowsInRange,
  mergeAllOutflowLists,
  totalAmount,
} from '../lib/payPeriod'
import { useFinanceStore } from '../store/financeStore'

/**
 * From today through Dec 31: estimated remaining paycheck deposits vs scheduled withdrawals.
 */
export function ThisYearPage() {
  const paySettings = useFinanceStore((s) => s.paySettings)
  const bills = useFinanceStore((s) => s.bills)
  const oneOffItems = useFinanceStore((s) => s.oneOffItems)
  const expenseEntries = useFinanceStore((s) => s.expenseEntries)
  const incomeLines = useFinanceStore((s) => s.incomeLines)

  const money = (n: number) => formatMoney(n, paySettings)

  const pack = useMemo(() => {
    const fmt = (n: number) => formatMoney(n, paySettings)
    const now = new Date()
    const y = now.getFullYear()
    const todayStart = startOfDay(now)
    const nextYearJan1 = new Date(y + 1, 0, 1)
    const lastCalendarDay = addDays(nextYearJan1, -1)

    const billFlows = listOutflowsInRange(bills, todayStart, nextYearJan1)
    const oneFlows = listOneOffOutflowsInRange(oneOffItems, todayStart, nextYearJan1)
    /** Forward-only: discretionary spend you already logged with a future date (rare). */
    const expFlowsRemaining = listExpenseOutflowsInRange(expenseEntries, todayStart, nextYearJan1)
    /** Jan 1 → end of today: matches “spending I’ve already logged this year.” */
    const expFlowsYtd = listExpenseOutflowsInRange(
      expenseEntries,
      startOfYear(todayStart),
      addDays(todayStart, 1),
    )
    const merged = mergeAllOutflowLists([billFlows, oneFlows, expFlowsRemaining])

    const billsTotal = totalAmount(billFlows)
    const oneOffTotal = totalAmount(oneFlows)
    const expenseRemainingTotal = totalAmount(expFlowsRemaining)
    const expenseYtdTotal = totalAmount(expFlowsYtd)
    const totalOut = totalAmount(merged)

    const incomeEst =
      paySettings != null
        ? estimatedTakeHomeInRange(todayStart, nextYearJan1, paySettings, incomeLines)
        : null

    const gap = incomeEst !== null ? incomeEst.total - totalOut : null

    const dateSpan = `${format(todayStart, 'MMM d')} – ${format(lastCalendarDay, 'MMM d, yyyy')}`

    const tips: string[] = []
    if (!paySettings) {
      tips.push('Add a pay schedule and take-home in Settings so Cadence can estimate remaining deposits.')
    } else if (incomeEst === null || incomeEst.paydayCount === 0) {
      tips.push('No paydays fall between today and year-end in your current schedule — check anchor date and frequency.')
    }
    if (gap !== null) {
      if (gap < -50) {
        tips.push(
          `Roughly ${fmt(Math.abs(gap))} short on paper — trim recurring bills where you can, delay non-essential one-offs, or adjust amounts on the Bills page.`,
        )
      } else if (gap > 50) {
        tips.push(
          `About ${fmt(gap)} headroom if estimates hold — consider extra debt payments, savings goals, or padding low envelopes.`,
        )
      } else {
        tips.push('Income and scheduled outflows are close — small changes to bills or spending will swing this.')
      }
    }
    if (expenseYtdTotal + oneOffTotal > billsTotal * 0.25 && billsTotal > 0) {
      tips.push(
        'One-offs and quick expenses make up a notable share — review Recurring audit and Calendar for subscriptions you can cut.',
      )
    }

    return {
      billsTotal,
      oneOffTotal,
      expenseRemainingTotal,
      expenseYtdTotal,
      totalOut,
      incomeEst,
      gap,
      dateSpan,
      lineCount: merged.length,
      tips,
    }
  }, [bills, expenseEntries, incomeLines, oneOffItems, paySettings])

  return (
    <div className="space-y-5 text-left">
      <div>
        <p className="section-label">Planning</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">This year</h2>
        <p className="mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-400">
          From <span className="font-medium text-slate-800 dark:text-slate-200">{pack.dateSpan}</span>: estimated
          remaining paycheck deposits vs withdrawals already in Cadence (bills, one-offs, quick expenses). Not a bank
          balance — it’s a plan-to-plan check.
        </p>
      </div>

      {!paySettings ? (
        <div className="card border-amber-200/90 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/35">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">Pay schedule required</p>
          <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">
            Set how often you’re paid and take-home so we can count remaining deposits this year.
          </p>
          <Link to="/settings" className="btn-primary mt-3 inline-flex text-sm">
            Open Settings
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Remaining income (est.)
          </p>
          {pack.incomeEst != null ? (
            <>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {money(pack.incomeEst.total)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {pack.incomeEst.paydayCount} payday{pack.incomeEst.paydayCount === 1 ? '' : 's'} left this year · same
                logic as Summary (take-home + extra income lines each payday)
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">—</p>
          )}
        </div>

        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Remaining withdrawals
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {money(pack.totalOut)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {pack.lineCount} scheduled line{pack.lineCount === 1 ? '' : 's'} through Dec 31
          </p>
        </div>
      </div>

      <div className="card">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Bills vs other (remaining year)
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Bills</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
              {money(pack.billsTotal)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">One-offs</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
              {money(pack.oneOffTotal)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Quick expenses (YTD)
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
              {money(pack.expenseYtdTotal)}
            </p>
            {pack.expenseRemainingTotal > 0 ? (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                + {money(pack.expenseRemainingTotal)} dated from today onward (counts toward remaining withdrawals)
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Jan 1–today · forward-dated entries also roll into the total above
              </p>
            )}
          </div>
        </div>
      </div>

      <div
        className={[
          'card border',
          pack.gap !== null && pack.gap < -50
            ? 'border-rose-200/90 bg-rose-50/80 dark:border-rose-900/40 dark:bg-rose-950/30'
            : pack.gap !== null && pack.gap > 50
              ? 'border-emerald-200/90 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/25'
              : 'border-slate-200/90 dark:border-white/10',
        ].join(' ')}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Net (income − withdrawals)
        </p>
        {pack.gap !== null ? (
          <>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {pack.gap >= 0 ? '+' : '−'}
              {money(Math.abs(pack.gap))}
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Positive means scheduled deposits exceed scheduled pulls for the rest of the calendar year (before any
              spending you haven’t logged).
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Add pay settings to see net.</p>
        )}
      </div>

      {pack.tips.length > 0 ? (
        <div className="card">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">What to do next</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-300">
            {pack.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link to="/bills" className="font-semibold text-emerald-700 underline decoration-emerald-600/35 dark:text-emerald-400">
              Edit bills
            </Link>
            <Link to="/calendar" className="font-semibold text-emerald-700 underline decoration-emerald-600/35 dark:text-emerald-400">
              Calendar
            </Link>
            <Link to="/subscriptions" className="font-semibold text-emerald-700 underline decoration-emerald-600/35 dark:text-emerald-400">
              Recurring audit
            </Link>
            <Link to="/year" className="font-semibold text-slate-600 underline decoration-slate-400/40 dark:text-slate-400">
              Year overview (full {new Date().getFullYear()} totals)
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
