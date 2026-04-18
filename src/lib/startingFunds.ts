import { addDays } from 'date-fns'
import type {
  Bill,
  ExpenseEntry,
  IncomeLine,
  OneOffItem,
  Outflow,
  PaySettings,
  SavingsAccountTransfer,
} from '../types'
import type { CurrentPayPeriod } from './payPeriod'
import {
  listExpenseOutflowsInRange,
  listOneOffOutflowsInRange,
  listOutflowsInRange,
  mergeAllOutflowLists,
  toISODate,
} from './payPeriod'
import { projectedBalanceEndOfDay } from './cashProjection'
import {
  savingsTransfersInPayPeriod,
  savingsTransfersToOutflows,
} from './savingsAccount'

export type StartingFundsLegacyPrefs = {
  bankBalanceAnchorDate?: string | null
  bankBalanceAnchorAmount?: number | null
} | null

/** Unified starting funds (Settings). Reads new fields and legacy pay settings / prefs. */
export function getStartingFunds(
  paySettings: PaySettings | null,
  legacyPreferences?: StartingFundsLegacyPrefs,
): { date: string | null; amount: number | null } {
  if (!paySettings) return { date: null, amount: null }
  const p = paySettings as PaySettings & {
    bankBalanceAnchorDate?: string | null
    bankBalanceAnchorAmount?: number | null
    startingBalance?: number | null
  }
  const date =
    p.startingFundsDate ??
    p.bankBalanceAnchorDate ??
    legacyPreferences?.bankBalanceAnchorDate ??
    null
  let amount: number | null =
    typeof p.startingFundsAmount === 'number' && !Number.isNaN(p.startingFundsAmount)
      ? p.startingFundsAmount
      : typeof p.bankBalanceAnchorAmount === 'number' &&
          !Number.isNaN(p.bankBalanceAnchorAmount)
        ? p.bankBalanceAnchorAmount
        : typeof legacyPreferences?.bankBalanceAnchorAmount === 'number' &&
            !Number.isNaN(legacyPreferences.bankBalanceAnchorAmount)
          ? legacyPreferences.bankBalanceAnchorAmount
          : typeof p.startingBalance === 'number' && !Number.isNaN(p.startingBalance)
            ? p.startingBalance
            : null
  return { date, amount }
}

export function hasStartingFunds(
  paySettings: PaySettings | null,
  legacyPreferences?: StartingFundsLegacyPrefs,
): boolean {
  const { date, amount } = getStartingFunds(paySettings, legacyPreferences)
  return (
    date !== null &&
    amount !== null &&
    typeof amount === 'number' &&
    !Number.isNaN(amount)
  )
}

/**
 * Running balance after each scheduled withdrawal **after** the starting-funds
 * date (balance is at end of that day). Income and outflows between the anchor
 * and each row are included via day-by-day projection.
 */
export function periodRunningRowsFromStartingFunds(options: {
  paySettings: PaySettings
  period: CurrentPayPeriod
  bills: Bill[]
  oneOffItems: OneOffItem[]
  expenseEntries: ExpenseEntry[]
  incomeLines: IncomeLine[]
  legacyPreferences?: StartingFundsLegacyPrefs
  savingsAccountTransfers?: SavingsAccountTransfer[]
}): { o: Outflow; balanceAfter: number }[] | null {
  const {
    paySettings,
    period,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
    legacyPreferences,
    savingsAccountTransfers = [],
  } = options
  const { date: anchorDate, amount: anchorAmount } = getStartingFunds(
    paySettings,
    legacyPreferences,
  )
  if (anchorDate == null || anchorAmount == null || Number.isNaN(anchorAmount)) {
    return null
  }

  const billFlows = listOutflowsInRange(
    bills,
    period.intervalStart,
    period.intervalEndExclusive,
  )
  const oneOffFlows = listOneOffOutflowsInRange(
    oneOffItems,
    period.intervalStart,
    period.intervalEndExclusive,
  )
  const expenseFlows = listExpenseOutflowsInRange(
    expenseEntries,
    period.intervalStart,
    period.intervalEndExclusive,
  )
  const allOutflows = mergeAllOutflowLists([
    billFlows,
    oneOffFlows,
    expenseFlows,
  ])

  const sorted = [...allOutflows]
    .filter((o) => o.date > anchorDate)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
    )

  const txOutflows = savingsTransfersToOutflows(
    savingsTransfersInPayPeriod(
      savingsAccountTransfers,
      period,
      anchorDate,
    ),
  )

  const merged = [...sorted, ...txOutflows].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
  )

  if (merged.length === 0) return []

  return merged.map((o) => ({
    o,
    balanceAfter: projectedBalanceEndOfDay(
      anchorDate,
      anchorAmount,
      o.date,
      paySettings,
      bills,
      oneOffItems,
      expenseEntries,
      incomeLines,
      savingsAccountTransfers,
    ),
  }))
}

/** Lowest projected balance in the period (after starting funds), for alerts. */
export function minProjectedBalanceAfterFromStartingFunds(options: {
  paySettings: PaySettings
  period: CurrentPayPeriod
  bills: Bill[]
  oneOffItems: OneOffItem[]
  expenseEntries: ExpenseEntry[]
  incomeLines: IncomeLine[]
  legacyPreferences?: StartingFundsLegacyPrefs
  savingsAccountTransfers?: SavingsAccountTransfer[]
}): number | null {
  const {
    paySettings,
    period,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
    legacyPreferences,
    savingsAccountTransfers = [],
  } = options
  if (!hasStartingFunds(paySettings, legacyPreferences)) return null
  const { date: ad, amount: am } = getStartingFunds(paySettings, legacyPreferences)
  if (ad == null || am == null) return null

  const lastDayInPeriod = toISODate(
    addDays(period.intervalEndExclusive, -1),
  )
  const endBal = projectedBalanceEndOfDay(
    ad,
    am,
    lastDayInPeriod,
    paySettings,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
    savingsAccountTransfers,
  )

  const periodStartIso = toISODate(period.intervalStart)
  const periodEndExIso = toISODate(period.intervalEndExclusive)

  const checkpointDates = new Set<string>()
  checkpointDates.add(lastDayInPeriod)

  for (const o of mergeAllOutflowLists([
    listOutflowsInRange(
      bills,
      period.intervalStart,
      period.intervalEndExclusive,
    ),
    listOneOffOutflowsInRange(
      oneOffItems,
      period.intervalStart,
      period.intervalEndExclusive,
    ),
    listExpenseOutflowsInRange(
      expenseEntries,
      period.intervalStart,
      period.intervalEndExclusive,
    ),
  ])) {
    if (o.date > ad && o.date >= periodStartIso && o.date < periodEndExIso) {
      checkpointDates.add(o.date)
    }
  }
  for (const t of savingsAccountTransfers) {
    if (t.date > ad && t.date >= periodStartIso && t.date < periodEndExIso) {
      checkpointDates.add(t.date)
    }
  }

  let min = endBal
  for (const iso of checkpointDates) {
    const b = projectedBalanceEndOfDay(
      ad,
      am,
      iso,
      paySettings,
      bills,
      oneOffItems,
      expenseEntries,
      incomeLines,
      savingsAccountTransfers,
    )
    if (b < min) min = b
  }
  return min
}
