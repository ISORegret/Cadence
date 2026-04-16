import { addDays, format, parseISO } from 'date-fns'
import type { Outflow } from '../types'
import { toISODate, totalAmount } from '../lib/payPeriod'

type MoneyFmt = (n: number) => string

/** Compact list of days in the next `dayCount` days that have scheduled outflows. */
export function CashflowStrip({
  outflows,
  todayStr,
  dayCount,
  formatMoney,
}: {
  outflows: Outflow[]
  todayStr: string
  dayCount: 14 | 7
  formatMoney: MoneyFmt
}) {
  const endStr = toISODate(addDays(parseISO(todayStr), dayCount))
  const byDate = new Map<string, Outflow[]>()
  for (const o of outflows) {
    if (o.date < todayStr || o.date > endStr) continue
    const list = byDate.get(o.date) ?? []
    list.push(o)
    byDate.set(o.date, list)
  }
  const days = [...byDate.keys()].sort((a, b) => a.localeCompare(b))
  if (days.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Nothing scheduled in the next {dayCount} days.
      </p>
    )
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {days.map((iso) => {
        const list = byDate.get(iso) ?? []
        const sum = totalAmount(list)
        return (
          <li
            key={iso}
            className="rounded-lg border border-slate-200/90 bg-slate-50/90 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900/50"
          >
            <span className="font-medium text-slate-800 dark:text-slate-100">
              {format(parseISO(iso), 'EEE MMM d')}
            </span>
            <span className="ml-1.5 tabular-nums text-slate-600 dark:text-slate-300">
              {formatMoney(sum)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
