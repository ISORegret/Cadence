import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isEqual,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns'
import type {
  Bill,
  BillRecurrence,
  ExpenseEntry,
  IncomeLine,
  OneOffItem,
  Outflow,
  PaySettings,
} from '../types'

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function clampDayOfMonth(year: number, monthIndex: number, day: number): Date {
  const end = endOfMonth(new Date(year, monthIndex, 1))
  const safe = Math.min(day, end.getDate())
  return new Date(year, monthIndex, safe)
}

/** First payday on or after `from` (start of day). */
export function getNextPayday(from: Date, settings: PaySettings): Date {
  const f = startOfDay(from)
  const anchor = startOfDay(parseISO(settings.anchorPayDate))

  switch (settings.frequency) {
    case 'weekly': {
      const diff = differenceInCalendarDays(f, anchor)
      if (diff <= 0) return anchor
      const n = Math.floor(diff / 7)
      let p = addDays(anchor, n * 7)
      if (isBefore(p, f)) p = addDays(p, 7)
      return p
    }
    case 'biweekly': {
      const diff = differenceInCalendarDays(f, anchor)
      if (diff <= 0) return anchor
      const n = Math.floor(diff / 14)
      let p = addDays(anchor, n * 14)
      if (isBefore(p, f)) p = addDays(p, 14)
      return p
    }
    case 'monthly': {
      const dom = settings.monthlyPayDay ?? anchor.getDate()
      let y = f.getFullYear()
      let m = f.getMonth()
      for (let i = 0; i < 36; i++) {
        const cand = startOfDay(clampDayOfMonth(y, m, dom))
        if (!isBefore(cand, f)) return cand
        m += 1
        if (m > 11) {
          m = 0
          y += 1
        }
      }
      return f
    }
    case 'twice_monthly': {
      const [a, b] = settings.twiceMonthlyDays ?? [1, 15]
      const d1 = Math.min(a, b)
      const d2 = Math.max(a, b)
      let y = f.getFullYear()
      let m = f.getMonth()
      for (let guard = 0; guard < 48; guard++) {
        for (const day of [d1, d2]) {
          const cand = startOfDay(clampDayOfMonth(y, m, day))
          if (!isBefore(cand, f)) return cand
        }
        m += 1
        if (m > 11) {
          m = 0
          y += 1
        }
      }
      return f
    }
    default:
      return f
  }
}

function subtractOnePayPeriod(payday: Date, settings: PaySettings): Date {
  const anchor = startOfDay(parseISO(settings.anchorPayDate))
  const p = startOfDay(payday)

  switch (settings.frequency) {
    case 'weekly':
      return addDays(p, -7)
    case 'biweekly':
      return addDays(p, -14)
    case 'monthly': {
      const dom = settings.monthlyPayDay ?? anchor.getDate()
      const prev = addMonths(p, -1)
      return startOfDay(
        clampDayOfMonth(prev.getFullYear(), prev.getMonth(), dom),
      )
    }
    case 'twice_monthly': {
      const [rawA, rawB] = settings.twiceMonthlyDays ?? [1, 15]
      const d1 = Math.min(rawA, rawB)
      const d2 = Math.max(rawA, rawB)
      const y = p.getFullYear()
      const mo = p.getMonth()
      const first = startOfDay(clampDayOfMonth(y, mo, d1))
      const second = startOfDay(clampDayOfMonth(y, mo, d2))
      if (isEqual(p, second)) {
        return first
      }
      if (isEqual(p, first)) {
        const prevM = addMonths(startOfMonth(p), -1)
        return startOfDay(
          clampDayOfMonth(
            prevM.getFullYear(),
            prevM.getMonth(),
            d2,
          ),
        )
      }
      return addDays(p, -14)
    }
    default:
      return addDays(p, -14)
  }
}

/** Most recent payday strictly before `before`, or same-length period anchor if needed. */
export function getPreviousPayday(before: Date, settings: PaySettings): Date {
  const next = getNextPayday(before, settings)
  return subtractOnePayPeriod(next, settings)
}

export interface CurrentPayPeriod {
  /** Payday that opens this pay period (deposit day); same as {@link intervalStart}. */
  lastPayday: Date
  /** Next deposit date; exclusive end of `[intervalStart, intervalEndExclusive)`. */
  nextPayday: Date
  /** First calendar day in this pay period (payday — money from this deposit). */
  intervalStart: Date
  /** First calendar day *not* in this pay period (= next payday). Spending covers through the prior day only. */
  intervalEndExclusive: Date
}

/**
 * Current pay period: starts on the deposit that funds it and runs through the day **before**
 * the next deposit. If `today` is payday, that day starts the new pay period (today’s pay counts here).
 */
export function getCurrentPayPeriod(
  today: Date,
  settings: PaySettings,
): CurrentPayPeriod {
  const t = startOfDay(today)
  const nextOnOrAfter = getNextPayday(t, settings)

  if (isEqual(t, startOfDay(nextOnOrAfter))) {
    const followingNext = getNextPayday(addDays(t, 1), settings)
    return {
      lastPayday: t,
      nextPayday: startOfDay(followingNext),
      intervalStart: t,
      intervalEndExclusive: startOfDay(followingNext),
    }
  }

  const lastPayday = subtractOnePayPeriod(nextOnOrAfter, settings)
  return {
    lastPayday: startOfDay(lastPayday),
    nextPayday: startOfDay(nextOnOrAfter),
    intervalStart: startOfDay(lastPayday),
    intervalEndExclusive: startOfDay(nextOnOrAfter),
  }
}

/** Last calendar day included in `[intervalStart, intervalEndExclusive)`. */
export function payPeriodInclusiveLastDay(
  period: Pick<CurrentPayPeriod, 'intervalEndExclusive'>,
): Date {
  return startOfDay(addDays(period.intervalEndExclusive, -1))
}

/**
 * Pay period relative to “today”, same definition as {@link getCurrentPayPeriod}.
 * `offset` 0 = current period; +1 = following period; −1 = previous.
 */
export function getPayPeriodAtOffset(
  today: Date,
  settings: PaySettings,
  offset: number,
): CurrentPayPeriod {
  let p = getCurrentPayPeriod(today, settings)
  if (offset > 0) {
    for (let i = 0; i < offset; i++) {
      const last = startOfDay(p.intervalEndExclusive)
      const next = getNextPayday(addDays(last, 1), settings)
      p = {
        lastPayday: last,
        nextPayday: next,
        intervalStart: last,
        intervalEndExclusive: next,
      }
    }
    return p
  }
  if (offset < 0) {
    for (let i = 0; i < -offset; i++) {
      const intervalEndExclusive = startOfDay(p.intervalStart)
      const lastPayday = subtractOnePayPeriod(intervalEndExclusive, settings)
      p = {
        lastPayday: startOfDay(lastPayday),
        nextPayday: intervalEndExclusive,
        intervalStart: startOfDay(lastPayday),
        intervalEndExclusive,
      }
    }
    return p
  }
  return p
}

/**
 * Paydays (deposit dates) that fall in `[rangeStart, rangeEndExclusive)` as
 * `yyyy-MM-dd` strings. Used by the calendar grid.
 */
export function listPaydayDatesInOpenRange(
  rangeStart: Date,
  rangeEndExclusive: Date,
  settings: PaySettings,
): Set<string> {
  const start = startOfDay(rangeStart)
  const end = startOfDay(rangeEndExclusive)
  const out = new Set<string>()
  let cursor = start
  for (let i = 0; i < 48; i++) {
    const pd = getNextPayday(cursor, settings)
    if (!isBefore(pd, end)) break
    out.add(toISODate(pd))
    cursor = addDays(pd, 1)
  }
  return out
}

function parseISODate(s: string): Date {
  return startOfDay(parseISO(s))
}

function effectiveRecurrence(bill: Bill): BillRecurrence {
  return bill.recurrence ?? { kind: 'continuous' }
}

function allowsEndOn(r: BillRecurrence, d: Date): boolean {
  if (r.kind !== 'endsOn') return true
  const last = startOfDay(parseISO(r.lastPaymentDate))
  return !isAfter(startOfDay(d), last)
}

function firstWeekdayOnOrAfter(dayOfWeek: number, from: Date): Date {
  const d0 = startOfDay(from)
  const add = (dayOfWeek - d0.getDay() + 7) % 7
  return addDays(d0, add)
}

function firstMonthlyOnOrAfter(dayOfMonth: number, seriesStart: Date): Date {
  let y = seriesStart.getFullYear()
  let m = seriesStart.getMonth()
  let cand = startOfDay(clampDayOfMonth(y, m, dayOfMonth))
  const ss = startOfDay(seriesStart)
  if (isBefore(cand, ss)) {
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
    cand = startOfDay(clampDayOfMonth(y, m, dayOfMonth))
  }
  return cand
}

function monthlyPaymentK(F0: Date, dayOfMonth: number, k: number): Date {
  const t = addMonths(F0, k)
  return startOfDay(
    clampDayOfMonth(t.getFullYear(), t.getMonth(), dayOfMonth),
  )
}

function pushOutflow(
  bill: Bill,
  d: Date,
  rs: Date,
  re: Date,
  r: BillRecurrence,
  out: Outflow[],
): void {
  if (isBefore(d, rs) || !isBefore(d, re)) return
  if (!allowsEndOn(r, d)) return
  out.push({
    billId: bill.id,
    name: bill.name,
    amount: bill.amount,
    date: toISODate(d),
    source: 'bill',
    category: bill.category,
    envelopeId: bill.envelopeId,
    note: bill.note,
  })
}

function addOutflowsForBill(
  bill: Bill,
  rangeStart: Date,
  rangeEndExclusive: Date,
  out: Outflow[],
): void {
  const schedule = bill.schedule
  const rs = startOfDay(rangeStart)
  const re = startOfDay(rangeEndExclusive)
  const r = effectiveRecurrence(bill)

  if (schedule.kind === 'once') {
    const d = parseISODate(schedule.date)
    pushOutflow(bill, d, rs, re, r, out)
    return
  }

  if (schedule.kind === 'monthly') {
    const dom = schedule.dayOfMonth
    if (r.kind === 'endsAfterPayments') {
      const F0 = firstMonthlyOnOrAfter(dom, parseISODate(r.seriesStart))
      for (let k = 0; k < r.count; k++) {
        const cand = monthlyPaymentK(F0, dom, k)
        pushOutflow(bill, cand, rs, re, r, out)
      }
      return
    }
    let y = rs.getFullYear()
    let m = rs.getMonth()
    for (let i = 0; i < 48; i++) {
      const cand = startOfDay(clampDayOfMonth(y, m, dom))
      pushOutflow(bill, cand, rs, re, r, out)
      if (isBefore(re, cand)) break
      m += 1
      if (m > 11) {
        m = 0
        y += 1
      }
    }
    return
  }

  if (schedule.kind === 'weekly') {
    const dow = schedule.dayOfWeek
    if (r.kind === 'endsAfterPayments') {
      const first = firstWeekdayOnOrAfter(dow, parseISODate(r.seriesStart))
      for (let k = 0; k < r.count; k++) {
        const cand = addDays(first, 7 * k)
        pushOutflow(bill, cand, rs, re, r, out)
      }
      return
    }
    let d = rs
    const endGuard = addDays(re, 7)
    while (isBefore(d, re)) {
      if (d.getDay() === dow) {
        pushOutflow(bill, d, rs, re, r, out)
      }
      d = addDays(d, 1)
      if (isBefore(endGuard, d)) break
    }
    return
  }

  if (schedule.kind === 'biweekly') {
    const anchor = startOfDay(parseISO(schedule.anchorDate))

    if (r.kind === 'endsAfterPayments') {
      for (let k = 0; k < r.count; k++) {
        const cand = addDays(anchor, 14 * k)
        pushOutflow(bill, cand, rs, re, r, out)
      }
      return
    }

    let d = anchor
    if (isBefore(d, rs)) {
      const diff = differenceInCalendarDays(rs, anchor)
      const n = Math.floor(diff / 14)
      d = addDays(anchor, n * 14)
      if (isBefore(d, rs)) d = addDays(d, 14)
    }
    while (isBefore(d, re)) {
      pushOutflow(bill, d, rs, re, r, out)
      d = addDays(d, 14)
    }
  }
}

export function listOutflowsInRange(
  bills: Bill[],
  rangeStart: Date,
  rangeEndExclusive: Date,
): Outflow[] {
  const out: Outflow[] = []
  for (const bill of bills) {
    addOutflowsForBill(bill, rangeStart, rangeEndExclusive, out)
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

function oneOffToOutflow(item: OneOffItem): Outflow {
  return {
    billId: `oneoff:${item.id}`,
    name: item.name,
    amount: item.amount,
    date: item.date,
    source: 'oneoff',
    category: item.category,
    envelopeId: item.envelopeId,
    note: item.note,
  }
}

export function listOneOffOutflowsInRange(
  items: OneOffItem[],
  rangeStart: Date,
  rangeEndExclusive: Date,
): Outflow[] {
  const rs = startOfDay(rangeStart)
  const re = startOfDay(rangeEndExclusive)
  const out: Outflow[] = []
  for (const item of items) {
    const d = parseISODate(item.date)
    if (!isBefore(d, rs) && isBefore(d, re)) {
      out.push(oneOffToOutflow(item))
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

export function mergeOutflows(
  billFlows: Outflow[],
  oneOffFlows: Outflow[],
): Outflow[] {
  return mergeAllOutflowLists([billFlows, oneOffFlows])
}

export function mergeAllOutflowLists(lists: Outflow[][]): Outflow[] {
  return lists
    .flat()
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

function expenseToOutflow(e: ExpenseEntry): Outflow {
  return {
    billId: `expense:${e.id}`,
    name: e.note?.trim() ? e.note.trim() : 'Expense',
    amount: e.amount,
    date: e.date,
    source: 'expense',
    category: e.category,
    envelopeId: e.envelopeId,
    note: e.note,
  }
}

export function listExpenseOutflowsInRange(
  entries: ExpenseEntry[],
  rangeStart: Date,
  rangeEndExclusive: Date,
): Outflow[] {
  const rs = startOfDay(rangeStart)
  const re = startOfDay(rangeEndExclusive)
  const out: Outflow[] = []
  for (const e of entries) {
    const d = parseISODate(e.date)
    if (!isBefore(d, rs) && isBefore(d, re)) {
      out.push(expenseToOutflow(e))
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

/** Stable key for marking an outflow as paid in the UI. */
export function paidKeyForOutflow(o: Outflow): string {
  if (
    o.source === 'oneoff' ||
    o.source === 'expense' ||
    o.source === 'savings_transfer'
  ) {
    return o.billId
  }
  return `${o.billId}|${o.date}`
}

/** DOM id for Summary withdrawal rows (deep links from Calendar). */
export function outflowRowDomId(paidKey: string): string {
  return `outflow-${paidKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

/**
 * Income amount attributed to the deposit at `lastPayday` (for “this period” budgeting).
 */
export function incomeForPeriodStarting(
  lastPayday: Date,
  settings: PaySettings,
): number | null {
  const a =
    typeof settings.incomePerPaycheck === 'number' &&
    !Number.isNaN(settings.incomePerPaycheck)
      ? settings.incomePerPaycheck
      : null
  const b =
    typeof settings.incomeSecondPaycheck === 'number' &&
    !Number.isNaN(settings.incomeSecondPaycheck)
      ? settings.incomeSecondPaycheck
      : null

  if (settings.frequency !== 'twice_monthly' || b === null) {
    return a
  }

  const [x, y] = settings.twiceMonthlyDays ?? [1, 15]
  const daySmall = Math.min(x, y)
  const dayLarge = Math.max(x, y)
  const dom = lastPayday.getDate()
  if (dom === daySmall) return a
  if (dom === dayLarge) return b
  return a ?? b
}

/**
 * Sum of take-home + extra income lines for each payday in
 * `[rangeStart, rangeEndExclusive)`, using the same rules as Summary’s current
 * period (each deposit gets `incomeForPeriodStarting` at that date + sum of
 * `incomeLines`).
 */
export function estimatedTakeHomeInRange(
  rangeStart: Date,
  rangeEndExclusive: Date,
  settings: PaySettings,
  incomeLines: IncomeLine[],
): { total: number; paydayCount: number } | null {
  const paydays = listPaydayDatesInOpenRange(
    rangeStart,
    rangeEndExclusive,
    settings,
  )
  if (paydays.size === 0) return null
  const extra = incomeLines.reduce((s, x) => s + x.amount, 0)
  let total = 0
  for (const iso of paydays) {
    const d = startOfDay(parseISO(iso))
    const base = incomeForPeriodStarting(d, settings)
    const take =
      base !== null && typeof base === 'number' && !Number.isNaN(base)
        ? base + extra
        : extra > 0
          ? extra
          : 0
    total += take
  }
  return { total, paydayCount: paydays.size }
}

export function totalAmount(outflows: Outflow[]): number {
  return outflows.reduce((s, o) => s + o.amount, 0)
}

/** Map yyyy-mm-dd -> outflows that day (calendar / detail). */
export function groupOutflowsByDate(outflows: Outflow[]): Map<string, Outflow[]> {
  const m = new Map<string, Outflow[]>()
  for (const o of outflows) {
    const list = m.get(o.date) ?? []
    list.push(o)
    m.set(o.date, list)
  }
  for (const list of m.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }
  return m
}

export function eachCalendarDayInMonth(year: number, monthIndex: number): Date[] {
  const start = new Date(year, monthIndex, 1)
  const end = endOfMonth(start)
  return eachDayOfInterval({ start, end })
}
