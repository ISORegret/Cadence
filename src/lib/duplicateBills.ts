import type { Bill, BillSchedule } from '../types'

export function findDuplicateBill(
  bills: Bill[],
  candidate: { name: string; amount: number; schedule: BillSchedule },
  excludeId?: string,
): Bill | undefined {
  const n = candidate.name.trim().toLowerCase()
  return bills.find((b) => {
    if (excludeId && b.id === excludeId) return false
    if (b.name.trim().toLowerCase() !== n) return false
    if (Math.abs(b.amount - candidate.amount) > 0.009) return false
    return JSON.stringify(b.schedule) === JSON.stringify(candidate.schedule)
  })
}
