import { addDays } from 'date-fns'
import { useMemo } from 'react'
import { useFinanceStore } from '../store/financeStore'
import { computeCashflowStanding } from '../lib/cashflowStanding'
import { projectedBalanceEndOfDay } from '../lib/cashProjection'
import { getCurrentPayPeriod, toISODate } from '../lib/payPeriod'
import { minProjectedBalanceAfter } from '../lib/runningBalance'
import { getStartingFunds, hasStartingFunds } from '../lib/startingFunds'
import type {
  AppPreferences,
  Bill,
  ExpenseEntry,
  IncomeLine,
  OneOffItem,
  PaySettings,
  SavingsAccountTransfer,
} from '../types'
import {
  hasSavingsAnchor,
  projectedSavingsBalanceEndOfDay,
} from '../lib/savingsAccount'

function useProjectionMemos(
  paySettings: PaySettings | null,
  period: ReturnType<typeof getCurrentPayPeriod> | null,
  todayStr: string,
  bills: Bill[],
  oneOffItems: OneOffItem[],
  expenseEntries: ExpenseEntry[],
  incomeLines: IncomeLine[],
  preferences: AppPreferences,
  savingsAccountTransfers: SavingsAccountTransfer[],
) {
  const projectedBalanceEndOfToday = useMemo(() => {
    if (!paySettings) return null
    if (!hasStartingFunds(paySettings, preferences)) return null
    const { date, amount } = getStartingFunds(paySettings, preferences)
    if (date == null || amount == null) return null
    return projectedBalanceEndOfDay(
      date,
      amount,
      todayStr,
      paySettings,
      bills,
      oneOffItems,
      expenseEntries,
      incomeLines,
      savingsAccountTransfers,
    )
  }, [
    paySettings,
    todayStr,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
    preferences,
    savingsAccountTransfers,
  ])

  const projectedBalanceEndOfPayPeriod = useMemo(() => {
    if (!paySettings || !period) return null
    if (!hasStartingFunds(paySettings, preferences)) return null
    const { date, amount } = getStartingFunds(paySettings, preferences)
    if (date == null || amount == null) return null
    const lastDay = toISODate(addDays(period.intervalEndExclusive, -1))
    if (date > lastDay) return null
    return projectedBalanceEndOfDay(
      date,
      amount,
      lastDay,
      paySettings,
      bills,
      oneOffItems,
      expenseEntries,
      incomeLines,
      savingsAccountTransfers,
    )
  }, [
    paySettings,
    period,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
    preferences,
    savingsAccountTransfers,
  ])

  const projectedSavingsEndOfToday = useMemo(() => {
    if (!paySettings || !hasSavingsAnchor(paySettings)) return null
    const sd = paySettings.savingsBalanceDate
    const sa = paySettings.savingsBalanceAmount
    if (!sd || sa == null || Number.isNaN(sa)) return null
    return projectedSavingsBalanceEndOfDay(
      sd,
      sa,
      todayStr,
      savingsAccountTransfers,
    )
  }, [paySettings, todayStr, savingsAccountTransfers])

  const safeToSpend = useMemo(() => {
    if (projectedBalanceEndOfPayPeriod === null) return null
    const buf = preferences.safeSpendBufferAmount
    const cushion = typeof buf === 'number' && !Number.isNaN(buf) ? buf : 0
    return projectedBalanceEndOfPayPeriod - cushion
  }, [projectedBalanceEndOfPayPeriod, preferences.safeSpendBufferAmount])

  const minBalProjected = useMemo(() => {
    if (!paySettings || !period) return null
    return minProjectedBalanceAfter({
      paySettings,
      period,
      bills,
      oneOffItems,
      expenseEntries,
      incomeLines,
      legacyPreferences: preferences,
      savingsAccountTransfers,
    })
  }, [
    paySettings,
    period,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
    preferences,
    savingsAccountTransfers,
  ])

  const standing = useMemo(
    () =>
      computeCashflowStanding({
        hasAnchor: Boolean(paySettings && hasStartingFunds(paySettings, preferences)),
        projectedEndOfPayPeriod: projectedBalanceEndOfPayPeriod,
        minProjectedInPeriod: minBalProjected,
        lowBalanceAlertEnabled: preferences.lowBalanceAlertEnabled === true,
        lowBalanceThreshold:
          typeof preferences.lowBalanceThreshold === 'number' &&
          !Number.isNaN(preferences.lowBalanceThreshold)
            ? preferences.lowBalanceThreshold
            : null,
      }),
    [
      paySettings,
      preferences,
      projectedBalanceEndOfPayPeriod,
      minBalProjected,
      preferences.lowBalanceAlertEnabled,
      preferences.lowBalanceThreshold,
    ],
  )

  return {
    projectedBalanceEndOfToday,
    projectedBalanceEndOfPayPeriod,
    projectedSavingsEndOfToday,
    safeToSpend,
    minBalProjected,
    standing,
  }
}

/** Projected balances + standing for Summary and global chrome (sidebar / header). */
export function useCadenceHealth() {
  const paySettings = useFinanceStore((s) => s.paySettings)
  const bills = useFinanceStore((s) => s.bills)
  const oneOffItems = useFinanceStore((s) => s.oneOffItems)
  const expenseEntries = useFinanceStore((s) => s.expenseEntries)
  const incomeLines = useFinanceStore((s) => s.incomeLines)
  const preferences = useFinanceStore((s) => s.preferences)
  const savingsAccountTransfers = useFinanceStore((s) => s.savingsAccountTransfers)

  const today = new Date()
  const todayStr = toISODate(today)

  const period = useMemo(() => {
    if (!paySettings) return null
    return getCurrentPayPeriod(today, paySettings)
  }, [paySettings, todayStr])

  const proj = useProjectionMemos(
    paySettings,
    period,
    todayStr,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
    preferences,
    savingsAccountTransfers,
  )

  return {
    today,
    todayStr,
    period,
    paySettings,
    ...proj,
  }
}
