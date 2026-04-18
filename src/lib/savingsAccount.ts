import {
  addDays,
  eachDayOfInterval,
  parseISO,
  startOfDay,
} from 'date-fns'
import type { Outflow, PaySettings, SavingsAccountTransfer } from '../types'
import type { CurrentPayPeriod } from './payPeriod'
import { toISODate } from './payPeriod'

export function hasSavingsAnchor(paySettings: PaySettings | null): boolean {
  if (!paySettings) return false
  const d = paySettings.savingsBalanceDate
  const a = paySettings.savingsBalanceAmount
  return (
    typeof d === 'string' &&
    d.trim().length > 0 &&
    typeof a === 'number' &&
    !Number.isNaN(a)
  )
}

/** Net effect on checking for one calendar day (ISO date). */
export function savingsTransferCheckingEffectForDay(
  dayIso: string,
  transfers: SavingsAccountTransfer[],
): { toSavings: number; fromSavings: number } {
  let toSavings = 0
  let fromSavings = 0
  for (const t of transfers) {
    if (t.date !== dayIso) continue
    if (t.direction === 'to_savings') toSavings += t.amount
    else fromSavings += t.amount
  }
  return { toSavings, fromSavings }
}

/**
 * Projected savings balance at end of `targetDate`, from an anchor balance at
 * end of `anchorDate`. Only transfers with date **after** `anchorDate` apply
 * (same boundary rule as checking starting funds).
 */
export function projectedSavingsBalanceEndOfDay(
  anchorDate: string,
  anchorBalanceEndOfDay: number,
  targetDate: string,
  transfers: SavingsAccountTransfer[],
): number {
  if (targetDate < anchorDate) return anchorBalanceEndOfDay
  if (targetDate === anchorDate) return anchorBalanceEndOfDay
  let balance = anchorBalanceEndOfDay
  const intervalStart = addDays(startOfDay(parseISO(anchorDate)), 1)
  const intervalEnd = startOfDay(parseISO(targetDate))
  for (const d of eachDayOfInterval({
    start: intervalStart,
    end: intervalEnd,
  })) {
    const dayIso = toISODate(d)
    const { toSavings, fromSavings } =
      savingsTransferCheckingEffectForDay(dayIso, transfers)
    balance += toSavings - fromSavings
  }
  return balance
}

export function savingsTransfersToOutflows(
  transfers: SavingsAccountTransfer[],
): Outflow[] {
  return transfers.map((t) => ({
    billId: `savings-transfer:${t.id}`,
    name:
      t.direction === 'to_savings'
        ? '→ Savings account'
        : '← From savings account',
    amount: t.direction === 'to_savings' ? t.amount : -t.amount,
    date: t.date,
    source: 'savings_transfer' as const,
    note: t.note,
  }))
}

export function savingsTransfersInPayPeriod(
  transfers: SavingsAccountTransfer[],
  period: CurrentPayPeriod,
  checkingAnchorDate: string,
): SavingsAccountTransfer[] {
  const startIso = toISODate(period.intervalStart)
  const endEx = toISODate(period.intervalEndExclusive)
  return transfers.filter(
    (t) =>
      t.date > checkingAnchorDate &&
      t.date >= startIso &&
      t.date < endEx,
  )
}
