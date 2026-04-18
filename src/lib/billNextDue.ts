import { addDays, parseISO, startOfDay } from 'date-fns'
import type { Bill } from '../types'
import { listOutflowsInRange } from './payPeriod'

/** Next scheduled withdrawal date for this bill on or after `from` (yyyy-mm-dd), if any. */
export function nextBillOccurrenceIso(bill: Bill, from: Date): string | null {
  const start = startOfDay(from)
  const flows = listOutflowsInRange([bill], start, addDays(start, 800))
  if (flows.length === 0) return null
  return [...flows].sort((a, b) => a.date.localeCompare(b.date))[0].date
}

/** Latest occurrence strictly before `beforeIso` (opens that calendar day), if any. */
export function previousBillOccurrenceIso(bill: Bill, beforeIso: string): string | null {
  const boundary = startOfDay(parseISO(beforeIso))
  const start = addDays(boundary, -800)
  const flows = listOutflowsInRange([bill], start, boundary)
  if (flows.length === 0) return null
  return [...flows].sort((a, b) => b.date.localeCompare(a.date))[0].date
}
