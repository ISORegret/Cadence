import { startOfDay } from 'date-fns'
import type { Bill, PaySettings } from '../types'
import { getPayPeriodAtOffset, toISODate } from './payPeriod'
import { nextBillOccurrenceIso } from './billNextDue'

export type SetAsideResult =
  | {
      kind: 'ok'
      dueIso: string
      /** 0-based pay period index (from today) that contains the due date */
      periodIndex: number
      /** Pay periods from current through the one that contains due (inclusive) */
      payPeriodsToSaveAcross: number
      perPayPeriod: number
    }
  | { kind: 'none' }

/**
 * Rough equal amount to set aside each pay period so the next bill is covered
 * by the time it’s due (split evenly across pay periods from now through the due period).
 */
export function computeBillSetAside(
  bill: Bill,
  paySettings: PaySettings,
  today: Date = new Date(),
): SetAsideResult {
  const dueIso = nextBillOccurrenceIso(bill, startOfDay(today))
  if (!dueIso) return { kind: 'none' }

  let periodIndex = -1
  for (let k = 0; k < 240; k++) {
    const p = getPayPeriodAtOffset(today, paySettings, k)
    const start = toISODate(p.intervalStart)
    const end = toISODate(p.intervalEndExclusive)
    if (dueIso >= start && dueIso < end) {
      periodIndex = k
      break
    }
  }
  if (periodIndex < 0) return { kind: 'none' }

  const slots = periodIndex + 1
  const per = bill.amount / Math.max(1, slots)
  return {
    kind: 'ok',
    dueIso,
    periodIndex,
    payPeriodsToSaveAcross: slots,
    perPayPeriod: Math.round(per * 100) / 100,
  }
}
