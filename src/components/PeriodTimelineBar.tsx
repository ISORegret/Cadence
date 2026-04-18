import type { PayPeriodTimeline } from '../lib/periodTimeline'

export function PeriodTimelineBar({
  summaryViewMode,
  monthDay,
  monthTotal,
  payTimeline,
}: {
  summaryViewMode: 'pay_period' | 'calendar_month'
  monthDay: number
  monthTotal: number
  payTimeline: PayPeriodTimeline | null
}) {
  if (summaryViewMode === 'calendar_month') {
    const pct = Math.min(100, (monthDay / monthTotal) * 100)
    return (
      <div className="mb-4 rounded-xl border border-slate-200/80 bg-white/60 px-3 py-2.5 dark:border-white/10 dark:bg-zinc-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-600 dark:text-slate-300">
            This calendar month
          </span>
          <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
            {monthDay}/{monthTotal}
          </span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/90 dark:bg-zinc-800"
          role="progressbar"
          aria-valuenow={monthDay}
          aria-valuemin={1}
          aria-valuemax={monthTotal}
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 dark:bg-emerald-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <details className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          <summary className="cursor-pointer select-none font-medium text-slate-600 dark:text-slate-300">
            How this bar works
          </summary>
          <p className="mt-1.5 leading-snug">
            The fraction is <strong className="font-medium text-slate-700 dark:text-slate-200">today’s calendar date</strong> over{' '}
            <strong className="font-medium text-slate-700 dark:text-slate-200">days in this month</strong>. The fill tracks how far
            you are through the month (not your pay schedule).
          </p>
        </details>
      </div>
    )
  }

  if (!payTimeline) return null

  if (payTimeline.kind === 'other_view') {
    return (
      <div className="mb-4 rounded-xl border border-slate-200/80 bg-white/60 px-3 py-2.5 text-xs text-slate-600 dark:border-white/10 dark:bg-zinc-900/40 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {payTimeline.totalDays}-day pay period
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug">{payTimeline.hint}</span>
      </div>
    )
  }

  const { dayOfPeriod, totalDays, daysUntilPayday } = payTimeline
  const pct = Math.min(100, (dayOfPeriod / totalDays) * 100)

  return (
    <div className="mb-4 rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-3 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/25">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-emerald-900 dark:text-emerald-200">
          This pay period
        </span>
        <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
          {dayOfPeriod}/{totalDays}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-400">
        {daysUntilPayday === 0
          ? 'Payday today — next deposit starts a new period.'
          : daysUntilPayday === 1
            ? '1 day until payday.'
            : `${daysUntilPayday} days until payday.`}
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-200/80 dark:bg-emerald-900/50"
        role="progressbar"
        aria-valuenow={dayOfPeriod}
        aria-valuemin={1}
        aria-valuemax={totalDays}
      >
        <div
          className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 dark:bg-emerald-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <details className="mt-2 text-[11px] text-emerald-900/90 dark:text-emerald-200/80">
        <summary className="cursor-pointer select-none font-medium text-emerald-950 dark:text-emerald-100">
          How this bar works
        </summary>
        <p className="mt-1.5 leading-snug text-slate-600 dark:text-slate-400">
          <strong className="font-medium text-slate-700 dark:text-slate-200">Day count</strong> is calendar days from your last
          deposit through the last day before the next deposit (inclusive).{' '}
          <strong className="font-medium text-slate-700 dark:text-slate-200">Days until payday</strong> counts down to your next
          deposit. The bar fills as you move through the period.
        </p>
      </details>
    </div>
  )
}
