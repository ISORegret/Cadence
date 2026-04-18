/** High-level cashflow posture from projected balances (same basis as Summary). */

export type CashflowStanding =
  | { kind: 'unknown'; label: string }
  | { kind: 'behind'; label: string }
  | { kind: 'watch'; label: string }
  | { kind: 'good'; label: string }

export function computeCashflowStanding(p: {
  hasAnchor: boolean
  projectedEndOfPayPeriod: number | null
  minProjectedInPeriod: number | null
  lowBalanceAlertEnabled: boolean
  lowBalanceThreshold: number | null
}): CashflowStanding {
  if (!p.hasAnchor) {
    return { kind: 'unknown', label: 'Set balance to see status' }
  }

  const min = p.minProjectedInPeriod
  const end = p.projectedEndOfPayPeriod

  if (
    (typeof min === 'number' && min < 0) ||
    (typeof end === 'number' && end < 0)
  ) {
    return { kind: 'behind', label: 'Behind' }
  }

  if (
    p.lowBalanceAlertEnabled &&
    typeof p.lowBalanceThreshold === 'number' &&
    !Number.isNaN(p.lowBalanceThreshold) &&
    typeof min === 'number' &&
    min < p.lowBalanceThreshold
  ) {
    return { kind: 'watch', label: 'Tight' }
  }

  if (typeof end === 'number' && !Number.isNaN(end) && end >= 0) {
    return { kind: 'good', label: 'In good standing' }
  }

  return { kind: 'watch', label: 'Watch' }
}
