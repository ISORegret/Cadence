import {
  addDays,
  eachDayOfInterval,
  parseISO,
  startOfDay,
} from 'date-fns'
import type { Bill, ExpenseEntry, IncomeLine, OneOffItem, PaySettings } from '../types'
import {
  estimatedTakeHomeInRange,
  listExpenseOutflowsInRange,
  listOneOffOutflowsInRange,
  listOutflowsInRange,
  mergeAllOutflowLists,
  toISODate,
  totalAmount,
} from './payPeriod'

function mergedDayOutflows(
  day: Date,
  bills: Bill[],
  oneOffItems: OneOffItem[],
  expenseEntries: ExpenseEntry[],
) {
  const dayStart = startOfDay(day)
  const dayEnd = addDays(dayStart, 1)
  return mergeAllOutflowLists([
    listOutflowsInRange(bills, dayStart, dayEnd),
    listOneOffOutflowsInRange(oneOffItems, dayStart, dayEnd),
    listExpenseOutflowsInRange(expenseEntries, dayStart, dayEnd),
  ])
}

/**
 * Balance at end of `targetDate` (yyyy-mm-dd), assuming `anchorBalance` is the
 * balance at end of `anchorDate` (after that day’s activity). Walks forward day
 * by day adding paychecks and subtracting scheduled outflows.
 */
export function projectedBalanceEndOfDay(
  anchorDate: string,
  anchorBalanceEndOfDay: number,
  targetDate: string,
  paySettings: PaySettings,
  bills: Bill[],
  oneOffItems: OneOffItem[],
  expenseEntries: ExpenseEntry[],
  incomeLines: IncomeLine[],
): number {
  if (targetDate < anchorDate) {
    return anchorBalanceEndOfDay
  }
  if (targetDate === anchorDate) {
    return anchorBalanceEndOfDay
  }
  let balance = anchorBalanceEndOfDay
  const intervalStart = addDays(startOfDay(parseISO(anchorDate)), 1)
  const intervalEnd = startOfDay(parseISO(targetDate))
  for (const d of eachDayOfInterval({
    start: intervalStart,
    end: intervalEnd,
  })) {
    const dayStart = startOfDay(d)
    const dayEnd = addDays(dayStart, 1)
    const flows = mergedDayOutflows(d, bills, oneOffItems, expenseEntries)
    const out = totalAmount(flows)
    const th = estimatedTakeHomeInRange(
      dayStart,
      dayEnd,
      paySettings,
      incomeLines,
    )
    const inc = th ? th.total : 0
    balance += inc - out
  }
  return balance
}

/** Last day of the Sunday–Saturday week (Saturday). */
export function saturdayOfWeek(weekStart: Date): string {
  return toISODate(addDays(weekStart, 6))
}

/** Saturday immediately before this week’s Sunday (prior week’s Saturday). */
export function saturdayBeforeWeek(weekStart: Date): string {
  return toISODate(addDays(weekStart, -1))
}
