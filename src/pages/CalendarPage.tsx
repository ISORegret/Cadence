import { addMonths, format, startOfMonth } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { categoryChipClasses, categoryDotClass } from '../lib/categoryColors'
import { formatMoney } from '../lib/money'
import {
  eachCalendarDayInMonth,
  getCurrentPayPeriod,
  groupOutflowsByDate,
  listExpenseOutflowsInRange,
  listOneOffOutflowsInRange,
  listOutflowsInRange,
  listPaydayDatesInOpenRange,
  mergeAllOutflowLists,
  paidKeyForOutflow,
  toISODate,
} from '../lib/payPeriod'
import type { Outflow } from '../types'
import { PageUndo } from '../components/PageUndo'
import { useFinanceStore } from '../store/financeStore'

const weekdaysShort = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function openOutflowFromCalendar(o: Outflow, navigate: ReturnType<typeof useNavigate>) {
  if (o.source === 'bill') {
    navigate(`/bills?bill=${encodeURIComponent(o.billId)}`)
    return
  }
  navigate(`/?withdrawalKey=${encodeURIComponent(paidKeyForOutflow(o))}`)
}

export function CalendarPage() {
  const navigate = useNavigate()
  const paySettings = useFinanceStore((s) => s.paySettings)
  const bills = useFinanceStore((s) => s.bills)
  const oneOffItems = useFinanceStore((s) => s.oneOffItems)
  const expenseEntries = useFinanceStore((s) => s.expenseEntries)
  const periodNotes = useFinanceStore((s) => s.periodNotes)
  const upsertPeriodNote = useFinanceStore((s) => s.upsertPeriodNote)
  const preferences = useFinanceStore((s) => s.preferences)
  const addCalendarReminder = useFinanceStore((s) => s.addCalendarReminder)
  const removeCalendarReminder = useFinanceStore((s) => s.removeCalendarReminder)
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [catFilter, setCatFilter] = useState('')

  const money = (n: number) => formatMoney(n, paySettings)

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const monthStart = useMemo(() => new Date(year, month, 1), [year, month])
  const monthEnd = useMemo(() => addMonths(monthStart, 1), [monthStart])

  const outflows = useMemo(() => {
    const billPart = listOutflowsInRange(bills, monthStart, monthEnd)
    const onePart = listOneOffOutflowsInRange(oneOffItems, monthStart, monthEnd)
    const expPart = listExpenseOutflowsInRange(
      expenseEntries,
      monthStart,
      monthEnd,
    )
    const merged = mergeAllOutflowLists([billPart, onePart, expPart])
    if (!catFilter) return merged
    return merged.filter((o) => (o.category || '').trim() === catFilter)
  }, [bills, oneOffItems, expenseEntries, monthStart, monthEnd, catFilter])

  const categories = useMemo(() => {
    const xs = [
      ...bills.map((b) => b.category),
      ...oneOffItems.map((o) => o.category),
      ...expenseEntries.map((e) => e.category),
    ].filter((x): x is string => Boolean(x?.trim()))
    return [...new Set(xs)].sort((a, b) => a.localeCompare(b))
  }, [bills, oneOffItems, expenseEntries])

  const byDate = useMemo(() => groupOutflowsByDate(outflows), [outflows])

  const paydayDates = useMemo(() => {
    if (!paySettings) return new Set<string>()
    return listPaydayDatesInOpenRange(monthStart, monthEnd, paySettings)
  }, [paySettings, monthStart, monthEnd])

  const days = useMemo(() => eachCalendarDayInMonth(year, month), [year, month])
  const leadingBlanks = days[0].getDay()

  const today = new Date()
  const period = paySettings ? getCurrentPayPeriod(today, paySettings) : null
  const periodStartStr = period ? toISODate(period.intervalStart) : ''
  const periodEndExStr = period ? toISODate(period.intervalEndExclusive) : ''
  const noteThisPeriod = periodNotes.find(
    (n) =>
      n.periodStart === periodStartStr &&
      n.periodEndExclusive === periodEndExStr,
  )
  const reminders = preferences.calendarReminders ?? []

  return (
    <div className="space-y-4 text-left sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="section-label">Calendar</p>
          <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">
            {format(cursor, 'MMMM yyyy')}
          </h2>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="select-field min-h-11 w-full min-w-0 !py-2.5 text-sm sm:min-w-[10rem] sm:max-w-[14rem] sm:flex-1"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-none sm:gap-1.5">
            <button
              type="button"
              onClick={() => setCursor((c) => addMonths(c, -1))}
              className="btn-secondary min-h-11 !px-2 !py-2.5 text-sm sm:!px-3"
            >
              <span className="sm:hidden">Prev</span>
              <span className="hidden sm:inline">Previous</span>
            </button>
            <button
              type="button"
              onClick={() => setCursor(() => startOfMonth(new Date()))}
              className="btn-secondary min-h-11 !px-2 !py-2.5 text-sm sm:!px-3"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setCursor((c) => addMonths(c, 1))}
              className="btn-secondary min-h-11 !px-2 !py-2.5 text-sm sm:!px-3"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {paySettings && paydayDates.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-sm bg-amber-400 ring-1 ring-amber-600/40 dark:bg-amber-500 dark:ring-amber-300/40"
              aria-hidden
            />
            Payday
          </span>
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <span>Withdrawals use category colors in cells.</span>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 shadow-lg shadow-slate-900/[0.04] backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-900/70 dark:shadow-none">
        <div className="grid min-w-[320px] grid-cols-7 gap-px bg-slate-200/90 dark:bg-slate-800/80">
          {weekdays.map((w, i) => (
            <div
              key={`${i}-${w}`}
              className="bg-slate-100/90 px-0.5 py-2 text-center text-[0.6rem] font-bold uppercase tracking-wide text-slate-500 sm:px-2 sm:py-2.5 sm:text-[0.65rem] sm:tracking-wider dark:bg-slate-950/80 dark:text-slate-400"
            >
              <span className="sm:hidden">{weekdaysShort[i]}</span>
              <span className="hidden sm:inline">{w}</span>
            </div>
          ))}
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div
              key={`pad-${i}`}
              className="min-h-[4.75rem] bg-slate-50/80 sm:min-h-[5.5rem] dark:bg-slate-950/50"
            />
          ))}
          {days.map((d) => {
            const key = toISODate(d)
            const list = byDate.get(key) ?? []
            const isToday =
              format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
            const isPayday = paySettings && paydayDates.has(key)
            return (
              <div
                key={key}
                className={[
                  'min-h-[4.75rem] border-t border-slate-100/90 p-1 text-left sm:min-h-[5.5rem] sm:p-1.5 dark:border-white/[0.06]',
                  isPayday
                    ? 'bg-amber-50/95 dark:bg-amber-950/45'
                    : 'bg-white/90 dark:bg-zinc-900/40',
                  isToday
                    ? 'ring-2 ring-inset ring-emerald-400/90 dark:ring-emerald-500/70'
                    : isPayday
                      ? 'ring-1 ring-inset ring-amber-400/60 dark:ring-amber-500/45'
                      : '',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-0.5">
                  <span
                    className={[
                      'text-[11px] font-semibold sm:text-xs',
                      isToday
                        ? 'text-emerald-800 dark:text-emerald-200'
                        : isPayday
                          ? 'text-amber-900 dark:text-amber-100'
                          : 'text-slate-600 dark:text-slate-400',
                    ].join(' ')}
                  >
                    {d.getDate()}
                  </span>
                  {isPayday ? (
                    <span className="shrink-0 rounded bg-amber-500/90 px-0.5 py-px text-[8px] font-bold uppercase leading-none text-amber-950 dark:bg-amber-400 dark:text-amber-950">
                      Pay
                    </span>
                  ) : null}
                </div>
                {list.length > 0 && (
                  <ul className="mt-0.5 space-y-0.5 sm:mt-1">
                    {list.slice(0, 3).map((o) => (
                      <li key={paidKeyForOutflow(o)} className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openOutflowFromCalendar(o, navigate)}
                          className={[
                            'w-full truncate rounded-md px-0.5 py-0.5 text-left text-[9px] font-semibold leading-tight ring-emerald-500/30 focus:outline-none focus-visible:ring-2 sm:px-1 sm:text-[10px]',
                            categoryChipClasses(o.category),
                          ].join(' ')}
                          title={`${o.name} — ${money(o.amount)}${o.category ? ` · ${o.category}` : ''}. Open.`}
                        >
                          {o.name}
                        </button>
                      </li>
                    ))}
                    {list.length > 3 && (
                      <li className="text-[9px] font-medium text-slate-500 dark:text-slate-500 sm:text-[10px]">
                        +{list.length - 3} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {paySettings && period && (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
              <div className="min-w-0">
                <p className="section-label">Notes</p>
                <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                  Pay period note
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Current window: {format(period.lastPayday, 'MMM d')} →{' '}
                  {format(period.nextPayday, 'MMM d')}. Saved with your backup.
                </p>
              </div>
              <PageUndo />
            </div>
            <textarea
              key={`${periodStartStr}|${periodEndExStr}`}
              defaultValue={noteThisPeriod?.body ?? ''}
              onBlur={(e) =>
                upsertPeriodNote({
                  periodStart: periodStartStr,
                  periodEndExclusive: periodEndExStr,
                  body: e.target.value,
                })
              }
              rows={4}
              className="input-field mt-3 min-h-[5rem] resize-y"
              placeholder="Notes for this pay window…"
            />
          </div>
          <div className="card">
            <p className="section-label">Reminders</p>
            <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              Popup reminders
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              When the date-time passes, a dialog appears if Cadence is open. On the
              phone app, allow system notifications (Summary or Settings) to also
              get a tray alert. For automatic alerts on upcoming bills, use{' '}
              <Link to="/settings" className="link-accent">
                Settings → Alerts
              </Link>
              . Snooze or dismiss from the popup.
            </p>
            <form
              className="mt-3 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const title = String(fd.get('crTitle') || '').trim()
                const body = String(fd.get('crBody') || '').trim()
                const remindAt = String(fd.get('crWhen') || '')
                if (!title || !remindAt) return
                addCalendarReminder({ title, body, remindAt })
                e.currentTarget.reset()
              }}
            >
              <input
                name="crTitle"
                placeholder="Title"
                className="input-field"
                required
              />
              <textarea
                name="crBody"
                placeholder="Details (optional)"
                rows={2}
                className="input-field resize-y"
              />
              <input
                name="crWhen"
                type="datetime-local"
                className="input-field"
                required
              />
              <button type="submit" className="btn-primary text-sm">
                Add reminder
              </button>
            </form>
            {reminders.length > 0 ? (
              <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm dark:border-white/10">
                {reminders
                  .slice()
                  .sort((a, b) => a.remindAt.localeCompare(b.remindAt))
                  .map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-start justify-between gap-2"
                    >
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {r.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {r.remindAt.replace('T', ' ')}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                        onClick={() => removeCalendarReminder(r.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}

      <div className="card">
        {paySettings && period ? (
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            This month ({format(cursor, 'MMMM')})
          </h3>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/10">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              This month ({format(cursor, 'MMMM')})
            </h3>
            <PageUndo />
          </div>
        )}
        {outflows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            No withdrawals scheduled.
          </p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
            {[...outflows]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((o) => (
                <li
                  key={paidKeyForOutflow(o)}
                  className="border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800"
                >
                  <button
                    type="button"
                    onClick={() => openOutflowFromCalendar(o, navigate)}
                    className="flex w-full justify-between gap-2 rounded-md text-left ring-emerald-500/30 focus:outline-none focus-visible:ring-2"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-slate-600 dark:text-slate-400">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${categoryDotClass(o.category)}`}
                        title={(o.category || '').trim() || 'Uncategorized'}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">
                        {format(new Date(o.date + 'T12:00:00'), 'MMM d')} — {o.name}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {money(o.amount)}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  )
}
