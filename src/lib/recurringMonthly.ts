import type { BillSchedule, IncomeLine, PayFrequency, PaySettings } from '../types'

/** Rough normalized monthly outflow for comparison (subscriptions-style audit). One-time bills excluded. */
export function estimatedMonthlyBillOutflow(
  schedule: BillSchedule,
  amount: number,
): number | null {
  switch (schedule.kind) {
    case 'once':
      return null
    case 'monthly':
      return amount
    case 'weekly':
      return amount * (52 / 12)
    case 'biweekly':
      return amount * (26 / 12)
    default:
      return null
  }
}

export function paydaysPerMonthApprox(freq: PayFrequency): number {
  switch (freq) {
    case 'weekly':
      return 52 / 12
    case 'biweekly':
      return 26 / 12
    case 'monthly':
      return 1
    case 'twice_monthly':
      return 2
    default:
      return 1
  }
}

/**
 * Extra income lines are applied on every payday in Summary; approximate monthly
 * equivalent using pay frequency (same multiplier as paycheck cadence).
 */
export function estimatedMonthlyIncomeLinesTotal(
  settings: PaySettings,
  incomeLines: IncomeLine[],
): number {
  if (incomeLines.length === 0) return 0
  const perPayday = incomeLines.reduce((s, x) => s + x.amount, 0)
  return perPayday * paydaysPerMonthApprox(settings.frequency)
}
