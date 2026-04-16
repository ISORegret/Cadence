import type { Bill, ExpenseEntry, IncomeLine, OneOffItem, PaySettings } from '../types'
import type { CurrentPayPeriod } from './payPeriod'
import {
  minProjectedBalanceAfterFromStartingFunds,
  type StartingFundsLegacyPrefs,
} from './startingFunds'

/** Minimum projected balance in the period (same basis as Summary running table). */
export function minProjectedBalanceAfter(options: {
  paySettings: PaySettings
  period: CurrentPayPeriod
  bills: Bill[]
  oneOffItems: OneOffItem[]
  expenseEntries: ExpenseEntry[]
  incomeLines: IncomeLine[]
  legacyPreferences?: StartingFundsLegacyPrefs
}): number | null {
  return minProjectedBalanceAfterFromStartingFunds(options)
}
