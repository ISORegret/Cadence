import {
  addDays,
  eachDayOfInterval,
  parseISO,
  startOfDay,
} from 'date-fns'
import type {
  Bill,
  ExpenseEntry,
  IncomeLine,
  OneOffItem,
  PaySettings,
  SavingsAccountTransfer,
} from '../types'
import { savingsTransferCheckingEffectForDay } from './savingsAccount'
import {
  estimatedTakeHomeInRange,
  listExpenseOutflowsInRange,
  listOneOffOutflowsInRange,
  listOutflowsInRange,
  mergeAllOutflowLists,
  toISODate,
  totalAmount,
} from './payPeriod'

/** Bills included in checking projections — full scheduled amounts on their due dates. */
export function billsForCheckingProjection(bills: Bill[]): Bill[] {
  return bills.filter((b) => (b.payFrom ?? 'checking') !== 'savings')
}

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
 * by day adding paychecks and subtracting scheduled outflows (bills, one-offs, expenses).
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
  savingsAccountTransfers: SavingsAccountTransfer[] = [],
): number {
  if (targetDate < anchorDate) {
    return anchorBalanceEndOfDay
  }
  if (targetDate === anchorDate) {
    return anchorBalanceEndOfDay
  }
  let balance = anchorBalanceEndOfDay
  const checkingBills = billsForCheckingProjection(bills)
  const intervalStart = addDays(startOfDay(parseISO(anchorDate)), 1)
  const intervalEnd = startOfDay(parseISO(targetDate))
  for (const d of eachDayOfInterval({
    start: intervalStart,
    end: intervalEnd,
  })) {
    const dayStart = startOfDay(d)
    const dayEnd = addDays(dayStart, 1)
    const flows = mergedDayOutflows(d, checkingBills, oneOffItems, expenseEntries)
    const out = totalAmount(flows)
    const th = estimatedTakeHomeInRange(
      dayStart,
      dayEnd,
      paySettings,
      incomeLines,
    )
    const inc = th ? th.total : 0
    const { toSavings, fromSavings } = savingsTransferCheckingEffectForDay(
      toISODate(d),
      savingsAccountTransfers,
    )
    balance += inc - out - toSavings + fromSavings
  }
  return balance
}

/** Sums used by {@link projectedBalanceEndOfDay} over inclusive calendar days — explains “Change this period”. */
export type ProjectedFlowBreakdown = {
  income: number
  /** Bills, one-offs, expense log — same as projection scheduled outflows. */
  checkingScheduledOut: number
  /** Cash moved checking → savings in range (reduces checking). */
  toSavings: number
  /** Cash moved savings → checking in range (adds to checking). */
  fromSavings: number
}

/** Inclusive yyyy-mm-dd range — must be non-empty (`start <= end`). */
export function projectedFlowTotalsInclusiveRange(
  rangeStartInclusiveIso: string,
  rangeEndInclusiveIso: string,
  paySettings: PaySettings,
  bills: Bill[],
  oneOffItems: OneOffItem[],
  expenseEntries: ExpenseEntry[],
  incomeLines: IncomeLine[],
  savingsAccountTransfers: SavingsAccountTransfer[] = [],
): ProjectedFlowBreakdown {
  let incomeCents = 0
  let outCents = 0
  let toSavCents = 0
  let fromSavCents = 0
  const checkingBills = billsForCheckingProjection(bills)
  const startDay = startOfDay(parseISO(rangeStartInclusiveIso))
  const endDay = startOfDay(parseISO(rangeEndInclusiveIso))
  for (const d of eachDayOfInterval({ start: startDay, end: endDay })) {
    const dayStart = startOfDay(d)
    const dayEnd = addDays(dayStart, 1)
    const flows = mergedDayOutflows(d, checkingBills, oneOffItems, expenseEntries)
    outCents += Math.round(totalAmount(flows) * 100)
    const th = estimatedTakeHomeInRange(
      dayStart,
      dayEnd,
      paySettings,
      incomeLines,
    )
    incomeCents += Math.round(((th ? th.total : 0) * 100))
    const { toSavings, fromSavings } = savingsTransferCheckingEffectForDay(
      toISODate(d),
      savingsAccountTransfers,
    )
    toSavCents += Math.round(toSavings * 100)
    fromSavCents += Math.round(fromSavings * 100)
  }
  return {
    income: incomeCents / 100,
    checkingScheduledOut: outCents / 100,
    toSavings: toSavCents / 100,
    fromSavings: fromSavCents / 100,
  }
}

/** Last day of the Sunday–Saturday week (Saturday). */
export function saturdayOfWeek(weekStart: Date): string {
  return toISODate(addDays(weekStart, 6))
}

/** Saturday immediately before this week’s Sunday (prior week’s Saturday). */
export function saturdayBeforeWeek(weekStart: Date): string {
  return toISODate(addDays(weekStart, -1))
}
