import { addMonths, format, startOfMonth } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { categoryChipClasses, categoryDotClass } from '../lib/categoryColors'
import { formatMoney } from '../lib/money'
import {
  eachCalendarDayInMonth,
  estimatedTakeHomeInRange,
  getCurrentPayPeriod,
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
import type { Outflow } from '../types'
import { savingsTransfersToOutflows } from '../lib/savingsAccount'
import { PageUndo } from '../components/PageUndo'
import { useFinanceStore } from '../store/financeStore'

const weekdaysShort = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function openOutflowFromCalendar(o: Outflow, navigate: ReturnType<typeof useNavigate>) {
  if (o.source === 'bill') {
    navigate(`/bills?bill=${encodeURIComponent(o.billId)}`)
    return
  }
  if (o.source === 'savings_transfer') {
    navigate('/settings#savings-account')
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
  const savingsAccountTransfers = useFinanceStore((s) => s.savingsAccountTransfers)
  const incomeLines = useFinanceStore((s) => s.incomeLines)
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
    const monthStartIso = toISODate(monthStart)
    const monthEndIso = toISODate(monthEnd)
    const txFlows = savingsTransfersToOutflows(
      savingsAccountTransfers.filter(
        (t) => t.date >= monthStartIso && t.date < monthEndIso,
      ),
    )
    const merged = mergeAllOutflowLists([billPart, onePart, expPart, txFlows])
    if (!catFilter) return merged
    return merged.filter((o) => (o.category || '').trim() === catFilter)
  }, [
    bills,
    oneOffItems,
    expenseEntries,
    savingsAccountTransfers,
    monthStart,
    monthEnd,
    catFilter,
  ])

  const categories = useMemo(() => {
    const xs = [
      ...bills.map((b) => b.category),
      ...oneOffItems.map((o) => o.category),
      ...expenseEntries.map((e) => e.category),
    ].filter((x): x is string => Boolean(x?.trim()))
    return [...new Set(xs)].sort((a, b) => a.localeCompare(b))
  }, [bills, oneOffItems, expenseEntries])

  const byDate = useMemo(() => groupOutflowsByDate(outflows), [outflows])

  const monthTotalOut = useMemo(() => totalAmount(outflows), [outflows])

  const monthIncome = useMemo(() => {
    if (!paySettings) return null
    return estimatedTakeHomeInRange(monthStart, monthEnd, paySettings, incomeLines)
  }, [paySettings, monthStart, monthEnd, incomeLines])

  const paydayDates = useMemo(() => {
    if (!paySettings) return new Set<string>()
    return listPaydayDatesInOpenRange(monthStart, monthEnd, paySettings)
  }, [paySettings, monthStart, monthEnd])

  const days = useMemo(() => eachCalendarDayInMonth(year, month), [year, month])
  const leadingBlanks = days[0].getDay()

  const today = new Date()
  const period = paySettings ? getCurrentPayPeriod(today, paySettings) : null

  return (
    <div className="space-y-5 text-left sm:space-y-6">
      <header className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-white/[0.08] dark:bg-zinc-900">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-violet-500 dark:from-emerald-400 dark:via-teal-500 dark:to-violet-500"
          aria-hidden
        />

        <div className="relative px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0">
              <p className="section-label mb-0">Calendar</p>
              <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white sm:text-lg">
                {format(cursor, 'MMMM yyyy')}
              </h2>
            </div>

            <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="select-field min-h-9 w-full min-w-0 flex-1 !py-2 text-xs sm:min-w-[10.5rem] sm:text-sm"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setCursor((c) => addMonths(c, -1))}
                  className="btn-secondary min-h-9 flex-1 !px-2.5 !py-2 text-xs sm:flex-none sm:text-sm"
                >
                  <span className="sm:hidden">Prev</span>
                  <span className="hidden sm:inline">Previous</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCursor(() => startOfMonth(new Date()))}
                  className="btn-primary min-h-9 flex-1 !px-3 !py-2 text-xs sm:flex-none sm:text-sm"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setCursor((c) => addMonths(c, 1))}
                  className="btn-secondary min-h-9 flex-1 !px-2.5 !py-2 text-xs sm:flex-none sm:text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-2.5 sm:grid-cols-4 sm:gap-2">
            <div className="rounded-lg border border-slate-200/90 bg-slate-50/90 px-2 py-1.5 dark:border-white/[0.07] dark:bg-zinc-950/50">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Lines
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                {outflows.length}
              </p>
            </div>
            <div
              className="rounded-lg border border-slate-200/90 bg-slate-50/90 px-2 py-1.5 dark:border-white/[0.07] dark:bg-zinc-950/50"
              title="Total of withdrawal lines on this calendar (bills, one-offs, expenses, transfers). Paychecks are not included."
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Total withdraws
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                {money(monthTotalOut)}
              </p>
            </div>
            <div
              className="rounded-lg border border-emerald-200/70 bg-emerald-50/80 px-2 py-1.5 dark:border-emerald-800/40 dark:bg-emerald-950/35"
              title={
                paySettings && monthIncome !== null
                  ? 'Take-home plus extra income lines on each payday in this calendar month (same logic as Summary).'
                  : paySettings
                    ? 'No paydays fall in this calendar month.'
                    : 'Add a pay schedule in Settings to estimate income.'
              }
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800/90 dark:text-emerald-300/90">
                Est. income
              </p>
              <p className="mt-0.5 text-[9px] leading-tight text-emerald-900/55 dark:text-emerald-200/55">
                From paycheck schedule only.
              </p>
              {paySettings ? (
                monthIncome !== null ? (
                  <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-950 dark:text-emerald-100">
                    {money(monthIncome.total)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs font-medium leading-tight text-emerald-800/80 dark:text-emerald-200/80">
                    No paydays
                  </p>
                )
              ) : (
                <p className="mt-1 leading-tight">
                  <Link to="/settings" className="text-xs font-semibold text-emerald-800 underline decoration-emerald-600/30 underline-offset-2 dark:text-emerald-300">
                    Settings
                  </Link>
                </p>
              )}
            </div>
            <div
              className={`rounded-lg border px-2 py-1.5 ${
                paySettings && paydayDates.size > 0
                  ? 'border-amber-200/80 bg-amber-50/90 dark:border-amber-800/45 dark:bg-amber-950/40'
                  : 'border-slate-200/90 bg-slate-50/90 dark:border-white/[0.07] dark:bg-zinc-950/50'
              }`}
            >
              <p
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  paySettings && paydayDates.size > 0
                    ? 'text-amber-800 dark:text-amber-200/90'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Paydays
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                {paySettings ? paydayDates.size : '—'}
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-white/[0.06]">
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-900 ring-1 ring-emerald-200/70 dark:bg-emerald-950/55 dark:text-emerald-100 dark:ring-emerald-800/50">
              Today
            </span>
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-950 ring-1 ring-amber-200/80 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-800/45">
              Payday
            </span>
            <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-900 ring-1 ring-violet-200/80 dark:bg-violet-950/50 dark:text-violet-200 dark:ring-violet-800/40">
              Weekend
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              Tap a day for Bills / Summary / Settings.
            </span>
          </div>
        </div>
      </header>

      <div className="relative overflow-x-auto rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.15)] ring-1 ring-slate-900/[0.03] backdrop-blur-md dark:border-white/[0.1] dark:bg-zinc-900/85 dark:shadow-[0_12px_48px_-12px_rgba(0,0,0,0.45)] dark:ring-white/[0.06]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent dark:via-emerald-500/25" />
        <div className="grid min-w-[320px] grid-cols-7 gap-px bg-gradient-to-b from-slate-200/95 to-slate-300/80 dark:from-slate-700/90 dark:to-slate-900/90">
          {weekdays.map((w, i) => {
            const isWeekendCol = i === 0 || i === 6
            return (
              <div
                key={`${i}-${w}`}
                className={[
                  'px-0.5 py-2.5 text-center text-[0.6rem] font-bold uppercase tracking-[0.12em] sm:px-2 sm:py-3 sm:text-[0.65rem]',
                  isWeekendCol
                    ? 'bg-gradient-to-b from-violet-100/90 to-slate-100/90 text-violet-800 dark:from-violet-950/70 dark:to-slate-950/80 dark:text-violet-200'
                    : 'bg-gradient-to-b from-slate-100 to-slate-50/95 text-slate-600 dark:from-slate-900 dark:to-slate-950/90 dark:text-slate-400',
                ].join(' ')}
              >
                <span className="sm:hidden">{weekdaysShort[i]}</span>
                <span className="hidden sm:inline">{w}</span>
              </div>
            )
          })}
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div
              key={`pad-${i}`}
              className="min-h-[4.85rem] bg-gradient-to-br from-slate-50/90 to-slate-100/50 sm:min-h-[5.65rem] dark:from-zinc-950/60 dark:to-slate-950/40"
            />
          ))}
          {days.map((d, dayIdx) => {
            const key = toISODate(d)
            const list = byDate.get(key) ?? []
            const isToday =
              format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
            const isPayday = paySettings && paydayDates.has(key)
            const col = (leadingBlanks + dayIdx) % 7
            const isWeekend = col === 0 || col === 6
            const daySum = list.reduce((s, o) => s + o.amount, 0)
            return (
              <div
                key={key}
                className={[
                  'group relative min-h-[4.85rem] border-t border-slate-100/80 p-1 text-left transition-[box-shadow,transform] duration-200 sm:min-h-[5.65rem] sm:p-1.5 dark:border-white/[0.05]',
                  'hover:z-[1] hover:shadow-md motion-reduce:transform-none motion-reduce:hover:shadow-none',
                  isPayday
                    ? 'bg-gradient-to-br from-amber-50 via-amber-50/80 to-orange-50/60 dark:from-amber-950/55 dark:via-amber-950/35 dark:to-orange-950/25'
                    : isWeekend
                      ? 'bg-gradient-to-br from-violet-50/70 via-white/90 to-slate-50/80 dark:from-violet-950/25 dark:via-zinc-900/50 dark:to-zinc-950/40'
                      : 'bg-white/95 dark:bg-zinc-900/35',
                  isToday
                    ? 'z-[1] shadow-md shadow-emerald-900/10 ring-2 ring-inset ring-emerald-500/70 dark:shadow-emerald-950/30 dark:ring-emerald-400/55'
                    : isPayday
                      ? 'ring-1 ring-inset ring-amber-400/55 dark:ring-amber-500/35'
                      : '',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-0.5">
                  <span
                    className={[
                      'flex h-6 min-w-[1.35rem] items-center justify-center text-[11px] font-bold sm:h-7 sm:min-w-[1.5rem] sm:text-xs',
                      isToday
                        ? 'rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-900/25 dark:bg-emerald-500 dark:text-white'
                        : isPayday
                          ? 'text-amber-950 dark:text-amber-100'
                          : 'text-slate-700 dark:text-slate-300',
                    ].join(' ')}
                  >
                    {d.getDate()}
                  </span>
                  {isPayday ? (
                    <span className="shrink-0 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none text-amber-950 shadow-sm dark:from-amber-500 dark:to-orange-500 dark:text-amber-950">
                      Pay
                    </span>
                  ) : null}
                </div>
                {list.length > 0 && (
                  <>
                    <ul className="mt-0.5 space-y-0.5 sm:mt-1">
                      {list.slice(0, 3).map((o) => (
                        <li key={paidKeyForOutflow(o)} className="min-w-0">
                          <button
                            type="button"
                            onClick={() => openOutflowFromCalendar(o, navigate)}
                            className={[
                              'w-full truncate rounded-md px-0.5 py-0.5 text-left text-[9px] font-semibold leading-tight ring-emerald-500/30 transition hover:brightness-95 focus:outline-none focus-visible:ring-2 dark:hover:brightness-110 sm:px-1 sm:text-[10px]',
                              categoryChipClasses(o.category),
                            ].join(' ')}
                            title={`${o.name} — ${money(o.amount)}${o.category ? ` · ${o.category}` : ''}. Open.`}
                          >
                            {o.name}
                          </button>
                        </li>
                      ))}
                      {list.length > 3 && (
                        <li className="text-[9px] font-semibold text-violet-600 dark:text-violet-400 sm:text-[10px]">
                          +{list.length - 3} more
                        </li>
                      )}
                    </ul>
                    <p className="mt-0.5 truncate text-[8px] font-medium tabular-nums text-slate-400 dark:text-slate-500 sm:text-[9px]">
                      {money(daySum)}
                    </p>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

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
