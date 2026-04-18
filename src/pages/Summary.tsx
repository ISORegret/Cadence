import { Capacitor } from '@capacitor/core'
import type { CadenceNotificationPermissionUi } from '../lib/localNotifs'
import {
  getCadenceNotificationPermissionUi,
  requestLocalNotificationPermission,
  requestWebNotificationPermission,
  syncBillDueAlertsToDevice,
  syncCalendarRemindersToDevice,
} from '../lib/localNotifs'
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatMoney } from '../lib/money'
import { sumByCategory } from '../lib/budgetMath'
import {
  estimatedTakeHomeInRange,
  getPayPeriodAtOffset,
  payPeriodInclusiveLastDay,
  listExpenseOutflowsInRange,
  listOneOffOutflowsInRange,
  listOutflowsInRange,
  mergeAllOutflowLists,
  outflowRowDomId,
  paidKeyForOutflow,
  toISODate,
  totalAmount,
} from '../lib/payPeriod'
import { calendarMonthTimeline, payPeriodTimeline } from '../lib/periodTimeline'
import { buildWithdrawalsIcs, downloadIcs } from '../lib/icsExport'
import type { Outflow } from '../types'
import { CategorySpendDonut } from '../components/CategorySpendDonut'
import { PageUndo } from '../components/PageUndo'
import { categoryDotClass } from '../lib/categoryColors'
import {
  hasStartingFunds,
  periodRunningRowsFromStartingFunds,
} from '../lib/startingFunds'
import { useUndoToast } from '../contexts/UndoToastContext'
import { hasSavingsAnchor } from '../lib/savingsAccount'
import { useCadenceHealth } from '../hooks/useCadenceHealth'
import { CashflowStandingBadge } from '../components/CashflowStandingBadge'
import { PeriodTimelineBar } from '../components/PeriodTimelineBar'
import { useFinanceStore } from '../store/financeStore'
import { CashflowStrip } from '../components/CashflowStrip'
import { WhatIfStressPresets } from '../components/WhatIfStressPresets'

const SUGGESTED = [
  'Housing',
  'Utilities',
  'Debt',
  'Insurance',
  'Subscriptions',
  'Food',
  'Other',
]

function uniqSorted(xs: string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  )
}

export function Summary() {
  const paySettings = useFinanceStore((s) => s.paySettings)
  const bills = useFinanceStore((s) => s.bills)
  const oneOffItems = useFinanceStore((s) => s.oneOffItems)
  const expenseEntries = useFinanceStore((s) => s.expenseEntries)
  const incomeLines = useFinanceStore((s) => s.incomeLines)
  const savingsAccountTransfers = useFinanceStore((s) => s.savingsAccountTransfers)
  const periodBudgets = useFinanceStore((s) => s.periodBudgets)
  const savingsGoals = useFinanceStore((s) => s.savingsGoals)
  const paidKeys = useFinanceStore((s) => s.paidOutflowKeys)
  const preferences = useFinanceStore((s) => s.preferences)
  const setPreferences = useFinanceStore((s) => s.setPreferences)
  const togglePaidKey = useFinanceStore((s) => s.togglePaidKey)
  const addOneOff = useFinanceStore((s) => s.addOneOff)
  const removeOneOff = useFinanceStore((s) => s.removeOneOff)
  const addExpenseEntry = useFinanceStore((s) => s.addExpenseEntry)
  const removeExpenseEntry = useFinanceStore((s) => s.removeExpenseEntry)
  const upsertPeriodBudget = useFinanceStore((s) => s.upsertPeriodBudget)
  const removePeriodBudget = useFinanceStore((s) => s.removePeriodBudget)
  const quickExpenseTemplates = useFinanceStore((s) => s.quickExpenseTemplates)
  const addQuickExpenseTemplate = useFinanceStore((s) => s.addQuickExpenseTemplate)
  const removeQuickExpenseTemplate = useFinanceStore(
    (s) => s.removeQuickExpenseTemplate,
  )
  const addSavingsAccountTransfer = useFinanceStore(
    (s) => s.addSavingsAccountTransfer,
  )
  const catFilter = preferences.summaryCategoryFilter ?? ''
  const envFilter = preferences.summaryEnvelopeFilter ?? ''
  const setCatFilter = (v: string) =>
    setPreferences({ summaryCategoryFilter: v || undefined })
  const setEnvFilter = (v: string) =>
    setPreferences({ summaryEnvelopeFilter: v || undefined })
  const [budgetKind, setBudgetKind] = useState<'category' | 'envelope'>('category')
  const [withdrawalSearch, setWithdrawalSearch] = useState('')
  const withdrawalSearchRef = useRef<HTMLInputElement>(null)
  const searchPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const withdrawalSearchHydrated = useRef(false)
  const [whatIfIncomeAdj, setWhatIfIncomeAdj] = useState(0)
  const [whatIfDueAdj, setWhatIfDueAdj] = useState(0)
  const [qeNote, setQeNote] = useState('')
  const [qeAmount, setQeAmount] = useState('')
  const [qeDate, setQeDate] = useState(() => toISODate(new Date()))
  const [qeCat, setQeCat] = useState('')
  const [qeEnv, setQeEnv] = useState('')
  const [qtAmount, setQtAmount] = useState('')
  const [qtDate, setQtDate] = useState(() => toISODate(new Date()))
  const [qtDir, setQtDir] = useState<'to_savings' | 'from_savings'>(
    'to_savings',
  )
  const [qtNote, setQtNote] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [withdrawalLinkMiss, setWithdrawalLinkMiss] = useState<string | null>(null)
  const [withdrawalPayPeriodOffset, setWithdrawalPayPeriodOffset] = useState(0)
  const withdrawalKeyParam = searchParams.get('withdrawalKey')
  const [notifPermissionUi, setNotifPermissionUi] = useState<
    'pending' | CadenceNotificationPermissionUi
  >('pending')
  const money = (n: number) => formatMoney(n, paySettings)
  const showUndoToast = useUndoToast()

  const {
    today,
    todayStr,
    period,
    projectedBalanceEndOfToday,
    projectedBalanceEndOfPayPeriod,
    projectedSavingsEndOfToday,
    safeToSpend,
    minBalProjected,
    standing,
  } = useCadenceHealth()

  const viewedPayPeriod = paySettings
    ? getPayPeriodAtOffset(today, paySettings, withdrawalPayPeriodOffset)
    : null

  const summaryViewMode = preferences.summaryViewMode ?? 'pay_period'
  const summaryDensity = preferences.summaryDensity ?? 'simple'

  const viewWindow = useMemo(() => {
    if (!paySettings) return null
    if (summaryViewMode === 'calendar_month') {
      const ms = startOfMonth(today)
      return {
        intervalStart: ms,
        intervalEndExclusive: addMonths(ms, 1),
        mode: 'calendar_month' as const,
      }
    }
    if (!viewedPayPeriod) return null
    return {
      intervalStart: viewedPayPeriod.intervalStart,
      intervalEndExclusive: viewedPayPeriod.intervalEndExclusive,
      mode: 'pay_period' as const,
    }
  }, [paySettings, summaryViewMode, today, viewedPayPeriod])

  useEffect(() => {
    if (summaryViewMode === 'calendar_month') setWithdrawalPayPeriodOffset(0)
  }, [summaryViewMode])

  const monthTimeline = useMemo(
    () => calendarMonthTimeline(today),
    [todayStr],
  )

  const payTimeline = useMemo(() => {
    if (!viewedPayPeriod) return null
    return payPeriodTimeline(
      today,
      viewedPayPeriod,
      withdrawalPayPeriodOffset === 0,
    )
  }, [today, viewedPayPeriod, withdrawalPayPeriodOffset])

  useEffect(() => {
    const hydrate = () => {
      const p = useFinanceStore.getState().preferences
      setWithdrawalSearch(p.summaryWithdrawalSearch ?? '')
      if (p.lastQuickExpenseCategory)
        setQeCat(p.lastQuickExpenseCategory)
      if (p.lastQuickExpenseEnvelopeId)
        setQeEnv(p.lastQuickExpenseEnvelopeId)
      withdrawalSearchHydrated.current = true
    }
    if (useFinanceStore.persist.hasHydrated()) hydrate()
    return useFinanceStore.persist.onFinishHydration(hydrate)
  }, [])

  useEffect(() => {
    if (!withdrawalSearchHydrated.current) return
    if (searchPersistTimer.current) clearTimeout(searchPersistTimer.current)
    searchPersistTimer.current = setTimeout(() => {
      setPreferences({
        summaryWithdrawalSearch: withdrawalSearch.trim() || undefined,
      })
    }, 450)
    return () => {
      if (searchPersistTimer.current) clearTimeout(searchPersistTimer.current)
    }
  }, [withdrawalSearch, setPreferences])

  useEffect(() => {
    const onFocusSearch = () => withdrawalSearchRef.current?.focus()
    window.addEventListener('cadence:focusWithdrawalSearch', onFocusSearch)
    return () =>
      window.removeEventListener('cadence:focusWithdrawalSearch', onFocusSearch)
  }, [])

  const exportWindowStartStr = viewWindow
    ? toISODate(viewWindow.intervalStart)
    : ''

  const allOutflows = useMemo(() => {
    if (!viewWindow) return []
    return mergeAllOutflowLists([
      listOutflowsInRange(
        bills,
        viewWindow.intervalStart,
        viewWindow.intervalEndExclusive,
      ),
      listOneOffOutflowsInRange(
        oneOffItems,
        viewWindow.intervalStart,
        viewWindow.intervalEndExclusive,
      ),
      listExpenseOutflowsInRange(
        expenseEntries,
        viewWindow.intervalStart,
        viewWindow.intervalEndExclusive,
      ),
    ])
  }, [bills, oneOffItems, expenseEntries, viewWindow])

  const categories = uniqSorted([
    ...SUGGESTED,
    ...bills.map((b) => b.category),
    ...oneOffItems.map((o) => o.category),
    ...expenseEntries.map((e) => e.category),
  ].filter((x): x is string => Boolean(x?.trim())))

  const envelopes = useFinanceStore((s) => s.envelopes)

  const filtered = allOutflows.filter((o) => {
    if (catFilter && (o.category || '').trim() !== catFilter) return false
    if (envFilter && (o.envelopeId || '') !== envFilter) return false
    return true
  })

  const withdrawalSearchNorm = withdrawalSearch.trim().toLowerCase()
  const withdrawalsList = !withdrawalSearchNorm
    ? filtered
    : filtered.filter((o) => {
        const amt = String(o.amount)
        const hay = [o.name, o.note, o.category, amt]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(withdrawalSearchNorm)
      })

  const prevComparisonWindow = useMemo(() => {
    if (!paySettings) return null
    if (summaryViewMode === 'calendar_month') {
      const ms = startOfMonth(today)
      const prevStart = addMonths(ms, -1)
      return { intervalStart: prevStart, intervalEndExclusive: ms }
    }
    if (!viewedPayPeriod) return null
    return getPayPeriodAtOffset(today, paySettings, withdrawalPayPeriodOffset - 1)
  }, [
    paySettings,
    summaryViewMode,
    today,
    viewedPayPeriod,
    withdrawalPayPeriodOffset,
  ])

  const prevAllOutflows = useMemo(() => {
    if (!prevComparisonWindow) return []
    return mergeAllOutflowLists([
      listOutflowsInRange(
        bills,
        prevComparisonWindow.intervalStart,
        prevComparisonWindow.intervalEndExclusive,
      ),
      listOneOffOutflowsInRange(
        oneOffItems,
        prevComparisonWindow.intervalStart,
        prevComparisonWindow.intervalEndExclusive,
      ),
      listExpenseOutflowsInRange(
        expenseEntries,
        prevComparisonWindow.intervalStart,
        prevComparisonWindow.intervalEndExclusive,
      ),
    ])
  }, [bills, oneOffItems, expenseEntries, prevComparisonWindow])

  const scheduledVsPriorDelta = useMemo(() => {
    if (!prevComparisonWindow) return null
    const filterList = (list: Outflow[]) => {
      let next = list.filter((o) => {
        if (catFilter && (o.category || '').trim() !== catFilter) return false
        if (envFilter && (o.envelopeId || '') !== envFilter) return false
        return true
      })
      const norm = withdrawalSearch.trim().toLowerCase()
      if (!norm) return next
      return next.filter((o) => {
        const amt = String(o.amount)
        const hay = [o.name, o.note, o.category, amt]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(norm)
      })
    }
    return (
      totalAmount(filterList(allOutflows)) -
      totalAmount(filterList(prevAllOutflows))
    )
  }, [
    prevComparisonWindow,
    prevAllOutflows,
    allOutflows,
    catFilter,
    envFilter,
    withdrawalSearch,
  ])

  const togglePaidWithUndo = (pk: string) => {
    const paid = paidKeys.includes(pk)
    togglePaidKey(pk)
    showUndoToast({
      message: paid ? 'Marked as unpaid' : 'Marked as paid',
      onUndo: () => togglePaidKey(pk),
    })
  }

  const hasActiveSummaryFilters = Boolean(
    catFilter || envFilter || withdrawalSearch.trim(),
  )

  const clearSummaryFilters = () => {
    setPreferences({
      summaryCategoryFilter: undefined,
      summaryEnvelopeFilter: undefined,
      summaryWithdrawalSearch: undefined,
    })
    setWithdrawalSearch('')
    withdrawalSearchHydrated.current = true
  }

  useEffect(() => {
    if (!withdrawalKeyParam) return
    const stripKey = () =>
      setSearchParams(
        (sp) => {
          const next = new URLSearchParams(sp)
          next.delete('withdrawalKey')
          return next
        },
        { replace: true },
      )
    if (!paySettings || !period) {
      stripKey()
      return
    }
    const pk = decodeURIComponent(withdrawalKeyParam)

    const scrollIfVisible = () => {
      document.getElementById(outflowRowDomId(pk))?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }

    const inList = (list: Outflow[]) =>
      list.some((o) => paidKeyForOutflow(o) === pk)

    if (inList(withdrawalsList)) {
      queueMicrotask(scrollIfVisible)
      stripKey()
      setWithdrawalLinkMiss(null)
      return
    }

    if (inList(filtered) && withdrawalSearchNorm) {
      setWithdrawalSearch('')
      return
    }

    if (inList(allOutflows) && !inList(filtered)) {
      setCatFilter('')
      setEnvFilter('')
      setWithdrawalSearch('')
      return
    }

    setWithdrawalLinkMiss(pk)
    stripKey()
  }, [
    withdrawalKeyParam,
    paySettings,
    period,
    withdrawalsList,
    filtered,
    allOutflows,
    withdrawalSearchNorm,
    setSearchParams,
  ])

  useEffect(() => {
    if (!paySettings) setWithdrawalLinkMiss(null)
  }, [paySettings])

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void getCadenceNotificationPermissionUi()
        .then((ui) => {
          if (!cancelled) setNotifPermissionUi(ui)
        })
        .catch(() => {
          if (!cancelled) setNotifPermissionUi('prompt')
        })
    }
    refresh()
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const isPaid = (o: Outflow) => paidKeys.includes(paidKeyForOutflow(o))

  const totalScheduled = totalAmount(filtered)
  const stillDue = totalAmount(filtered.filter((o) => !isPaid(o)))

  const takeHomeForView = useMemo(() => {
    if (!viewWindow || !paySettings) return null
    return estimatedTakeHomeInRange(
      viewWindow.intervalStart,
      viewWindow.intervalEndExclusive,
      paySettings,
      incomeLines,
    )
  }, [viewWindow, paySettings, incomeLines])

  const income =
    takeHomeForView !== null && typeof takeHomeForView.total === 'number'
      ? takeHomeForView.total
      : null
  const hasIncome = typeof income === 'number' && !Number.isNaN(income)
  const hypoIncome =
    hasIncome && income !== null ? income + whatIfIncomeAdj : null
  const hypoStillDue = stillDue + whatIfDueAdj
  const hypoRemaining =
    hypoIncome !== null && !Number.isNaN(hypoIncome)
      ? hypoIncome - hypoStillDue
      : null

  const periodStartStr = period ? toISODate(period.intervalStart) : ''
  const periodEndExStr = period ? toISODate(period.intervalEndExclusive) : ''
  const budgetsThisPeriod = periodBudgets.filter(
    (r) =>
      r.periodStart === periodStartStr && r.periodEndExclusive === periodEndExStr,
  )

  const categoryTotals = sumByCategory(allOutflows)
  const sortedCategorySpending = [...categoryTotals.entries()].sort(
    (a, b) => b[1] - a[1],
  )

  const nextWeekEndStr = toISODate(addDays(today, 7))
  const nextSevenDays = allOutflows.filter(
    (o) => o.date >= todayStr && o.date <= nextWeekEndStr,
  )

  const runningRows = useMemo(() => {
    if (!period || !paySettings) return []
    return (
      periodRunningRowsFromStartingFunds({
        paySettings,
        period,
        bills,
        oneOffItems,
        expenseEntries,
        incomeLines,
        legacyPreferences: preferences,
        savingsAccountTransfers,
      }) ?? []
    )
  }, [
    period,
    paySettings,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
    preferences,
    savingsAccountTransfers,
  ])

  const whatIfProjectedEndApprox = useMemo(() => {
    if (projectedBalanceEndOfPayPeriod === null) return null
    return projectedBalanceEndOfPayPeriod + whatIfIncomeAdj - whatIfDueAdj
  }, [projectedBalanceEndOfPayPeriod, whatIfIncomeAdj, whatIfDueAdj])

  const categoryPrevTotals = useMemo(() => {
    if (!paySettings || !period) return null
    if (summaryViewMode === 'calendar_month') {
      const ms = startOfMonth(today)
      const prevStart = addMonths(ms, -1)
      const prevEnd = ms
      const flows = mergeAllOutflowLists([
        listOutflowsInRange(bills, prevStart, prevEnd),
        listOneOffOutflowsInRange(oneOffItems, prevStart, prevEnd),
        listExpenseOutflowsInRange(expenseEntries, prevStart, prevEnd),
      ])
      return sumByCategory(flows)
    }
    const prev = getPayPeriodAtOffset(today, paySettings, -1)
    const flows = mergeAllOutflowLists([
      listOutflowsInRange(bills, prev.intervalStart, prev.intervalEndExclusive),
      listOneOffOutflowsInRange(
        oneOffItems,
        prev.intervalStart,
        prev.intervalEndExclusive,
      ),
      listExpenseOutflowsInRange(
        expenseEntries,
        prev.intervalStart,
        prev.intervalEndExclusive,
      ),
    ])
    return sumByCategory(flows)
  }, [
    bills,
    oneOffItems,
    expenseEntries,
    paySettings,
    period,
    summaryViewMode,
    today,
  ])

  const categoryMovers = useMemo(() => {
    if (!categoryPrevTotals) return []
    const keys = new Set<string>([
      ...categoryTotals.keys(),
      ...categoryPrevTotals.keys(),
    ])
    return [...keys]
      .map((cat) => {
        const cur = categoryTotals.get(cat) ?? 0
        const prev = categoryPrevTotals.get(cat) ?? 0
        return { cat, delta: cur - prev, cur, prev }
      })
      .filter((r) => r.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5)
  }, [categoryTotals, categoryPrevTotals])

  const stripOutflows = useMemo(() => {
    if (!paySettings) return []
    const t0 = startOfDay(today)
    const end = addDays(t0, 15)
    return mergeAllOutflowLists([
      listOutflowsInRange(bills, t0, end),
      listOneOffOutflowsInRange(oneOffItems, t0, end),
      listExpenseOutflowsInRange(expenseEntries, t0, end),
    ])
  }, [bills, oneOffItems, expenseEntries, today, paySettings])

  const showPaycheckCashLines = hasIncome && hypoIncome !== null
  const showCashFlowCard =
    showPaycheckCashLines || hasStartingFunds(paySettings, preferences)

  const backupDaysSince = preferences.lastExportAt
    ? differenceInCalendarDays(
        today,
        parseISO(preferences.lastExportAt),
      )
    : null
  const showBackupNudge =
    backupDaysSince === null || backupDaysSince > 30

  const downloadFullSummaryPdf = () => {
    void import('../lib/pdfSummaryReport').then(async ({ downloadCadenceSummaryPdf }) => {
      const s = useFinanceStore.getState()
      await downloadCadenceSummaryPdf({
        paySettings: s.paySettings,
        bills: s.bills,
        envelopes: s.envelopes,
        oneOffItems: s.oneOffItems,
        expenseEntries: s.expenseEntries,
        incomeLines: s.incomeLines,
        periodBudgets: s.periodBudgets,
        savingsGoals: s.savingsGoals,
        envelopeTransfers: s.envelopeTransfers,
        periodNotes: s.periodNotes,
        quickExpenseTemplates: s.quickExpenseTemplates,
        preferences: s.preferences,
        paidOutflowKeys: s.paidOutflowKeys,
      })
    })
  }

  if (!paySettings || !period) {
    return (
      <div className="card p-8 text-left">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Set your pay schedule
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Add when you get paid so this page can show your current pay period and
          what is scheduled to leave your account before the next payday.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link to="/settings" className="btn-primary">
            Configure pay schedule
          </Link>
          <button
            type="button"
            className="btn-secondary"
            onClick={downloadFullSummaryPdf}
          >
            Download summary (PDF)
          </button>
          <PageUndo />
        </div>
      </div>
    )
  }

  return (
    <div id="summary-print-root" className="space-y-5 text-left">
      {notifPermissionUi !== 'pending' && notifPermissionUi !== 'granted' ? (
        <div className="card-tight print:hidden text-sm text-slate-700 dark:text-slate-300">
          <p className="font-semibold text-slate-900 dark:text-white">
            {Capacitor.isNativePlatform()
              ? 'Notifications in the app'
              : 'Browser notifications'}
          </p>
          {Capacitor.isNativePlatform() ? (
            <>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Cadence can use{' '}
                <strong className="font-medium text-slate-600 dark:text-slate-300">
                  system local notifications
                </strong>{' '}
                for bill due dates, calendar reminders, and low-balance alerts (after
                you allow them below). In-app dialogs still appear while the app is
                open.
              </p>
              <button
                type="button"
                className="btn-secondary mt-2 !px-3 !py-1.5 text-xs"
                onClick={() => {
                  void (async () => {
                    try {
                      await requestLocalNotificationPermission()
                      const st = useFinanceStore.getState()
                      await syncCalendarRemindersToDevice(
                        st.preferences.calendarReminders ?? [],
                      )
                      await syncBillDueAlertsToDevice(st.bills, st.paySettings, {
                        billDueAlertsEnabled: st.preferences.billDueAlertsEnabled,
                        billDueAlertDaysBefore: st.preferences.billDueAlertDaysBefore,
                      })
                    } finally {
                      setNotifPermissionUi(await getCadenceNotificationPermissionUi())
                    }
                  })()
                }}
              >
                Allow system notifications
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                This app does not run in the background. Date-based reminders fire when
                this tab is open (see Calendar). Low-balance alerts can use system
                notifications once per day if you allow them below.
              </p>
              {notifPermissionUi === 'unsupported' ? (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-200/90">
                  This viewer does not expose the Notification API. In-app alerts
                  still work while Cadence is open.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      await requestWebNotificationPermission()
                      setNotifPermissionUi(await getCadenceNotificationPermissionUi())
                    })()
                  }}
                  className="btn-secondary mt-2 !px-3 !py-1.5 text-xs"
                >
                  Request notification permission
                </button>
              )}
            </>
          )}
        </div>
      ) : null}

      {showBackupNudge && (
        <div className="print:hidden rounded-2xl border border-amber-300/40 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm backdrop-blur-sm dark:border-amber-500/25 dark:bg-amber-950/35 dark:text-amber-50">
          <strong>Backup reminder:</strong>{' '}
          {!preferences.lastExportAt
            ? 'You have never exported a backup.'
            : backupDaysSince !== null
              ? `Your last backup was ${backupDaysSince} day${backupDaysSince === 1 ? '' : 's'} ago.`
              : 'Export again soon.'}{' '}
          Use{' '}
          <Link to="/settings" className="link-accent">
            Settings → Export backup
          </Link>{' '}
          so you do not lose data.
        </div>
      )}

      {withdrawalLinkMiss ? (
        <div
          className="print:hidden rounded-2xl border border-slate-200/90 bg-slate-50/95 px-4 py-3 text-sm text-slate-800 shadow-sm dark:border-white/10 dark:bg-zinc-900/80 dark:text-slate-200"
          role="status"
        >
          <p>
            Could not scroll to{' '}
            <strong>
              {withdrawalLinkMiss.startsWith('oneoff:')
                ? oneOffItems.find((x) => x.id === withdrawalLinkMiss.slice(7))
                    ?.name ?? 'that one-off'
                : withdrawalLinkMiss.startsWith('expense:')
                  ? expenseEntries.find((x) => x.id === withdrawalLinkMiss.slice(8))
                      ?.note ||
                    expenseEntries.find((x) => x.id === withdrawalLinkMiss.slice(8))
                      ?.category ||
                    'that expense'
                  : (() => {
                      const [bid, d] = withdrawalLinkMiss.split('|')
                      const bill = bills.find((b) => b.id === bid)
                      return bill
                        ? `${bill.name} (${d ?? ''})`
                        : 'that bill'
                    })()}
            </strong>{' '}
            in this pay period. It may fall in a different pay period. Check the{' '}
            <Link to="/calendar" className="link-accent">
              Calendar
            </Link>{' '}
            or Bills.
          </p>
          <button
            type="button"
            className="btn-secondary mt-3 !px-3 !py-1.5 text-xs"
            onClick={() => setWithdrawalLinkMiss(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {preferences.lowBalanceAlertEnabled === true &&
      typeof preferences.lowBalanceThreshold === 'number' &&
      !Number.isNaN(preferences.lowBalanceThreshold) &&
      minBalProjected !== null &&
      minBalProjected < preferences.lowBalanceThreshold ? (
        <div
          className="print:hidden rounded-2xl border border-rose-200/90 bg-rose-50/95 px-4 py-3 text-sm text-rose-950 shadow-sm dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-50"
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold">Low balance warning</p>
          <p className="mt-1 text-xs leading-relaxed opacity-95">
            After a scheduled withdrawal, projected balance goes as low as{' '}
            <span className="tabular-nums font-medium">{money(minBalProjected)}</span>
            — below your threshold of{' '}
            <span className="tabular-nums">{money(preferences.lowBalanceThreshold)}</span>.
            Adjust in{' '}
            <Link to="/settings#alerts" className="font-medium underline">
              Settings → Alerts
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="print:hidden space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {summaryDensity === 'simple'
              ? 'Essential numbers first. Open Detailed for the full layout.'
              : 'All sections visible — same data as Simple, more at once.'}
          </p>
          <div
            className="inline-flex shrink-0 rounded-lg border border-slate-200/90 bg-white p-0.5 dark:border-white/10 dark:bg-zinc-900"
            role="group"
            aria-label="Summary layout"
          >
            <button
              type="button"
              onClick={() => setPreferences({ summaryDensity: 'simple' })}
              className={[
                'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                summaryDensity === 'simple'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10',
              ].join(' ')}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setPreferences({ summaryDensity: 'detailed' })}
              className={[
                'rounded-md px-3 py-1.5 text-xs font-semibold transition',
                summaryDensity === 'detailed'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10',
              ].join(' ')}
            >
              Detailed
            </button>
          </div>
        </div>

        {hasActiveSummaryFilters ? (
          <div className="flex justify-end">
            <button
              type="button"
              className="text-xs font-semibold text-emerald-700 underline decoration-emerald-600/40 underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
              onClick={clearSummaryFilters}
            >
              Clear filters &amp; search
            </button>
          </div>
        ) : null}

        <div className="card-hero relative z-0">
          <div className="relative z-10">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2 print:hidden">
              <p className="section-label mb-0">This period</p>
              <CashflowStandingBadge
                standing={standing}
                detail={{
                  formatMoney: money,
                  hasAnchor: Boolean(
                    paySettings && hasStartingFunds(paySettings, preferences),
                  ),
                  projectedEndOfPayPeriod: projectedBalanceEndOfPayPeriod,
                  minBalProjected,
                  safeToSpend,
                  lowBalanceAlertEnabled: preferences.lowBalanceAlertEnabled === true,
                  lowBalanceThreshold:
                    typeof preferences.lowBalanceThreshold === 'number'
                      ? preferences.lowBalanceThreshold
                      : null,
                }}
              />
            </div>
            <PeriodTimelineBar
              summaryViewMode={summaryViewMode}
              monthDay={monthTimeline.dayOfMonth}
              monthTotal={monthTimeline.daysInMonth}
              payTimeline={payTimeline}
            />
            {viewWindow?.mode === 'calendar_month' ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {format(viewWindow.intervalStart, 'MMMM yyyy')}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-500">
                  Calendar month — items dated in this month.
                </span>
              </p>
            ) : viewedPayPeriod ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {format(viewedPayPeriod.intervalStart, 'EEEE, MMM d')} →{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {format(payPeriodInclusiveLastDay(viewedPayPeriod), 'EEEE, MMM d')}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-500">
                  Next payday {format(viewedPayPeriod.nextPayday, 'EEEE, MMM d')}
                  {withdrawalPayPeriodOffset !== 0 ? (
                    <span className="block pt-1 text-amber-700 dark:text-amber-300">
                      Viewing a different pay period — totals below match these dates.
                    </span>
                  ) : null}
                </span>
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <p
                className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white"
                aria-live="polite"
              >
                {money(totalScheduled)}
              </p>
              <button
                type="button"
                title="Copy scheduled total"
                className="btn-secondary shrink-0 !min-h-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold print:hidden"
                onClick={() =>
                  void navigator.clipboard.writeText(money(totalScheduled))
                }
              >
                Copy
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {viewWindow?.mode === 'calendar_month'
                ? 'Total scheduled in this calendar month'
                : 'Total scheduled before next payday'}
            </p>
            {scheduledVsPriorDelta !== null ? (
              <p
                className={[
                  'mt-1 text-xs tabular-nums',
                  scheduledVsPriorDelta > 0
                    ? 'text-amber-700 dark:text-amber-300'
                    : scheduledVsPriorDelta < 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400',
                ].join(' ')}
              >
                {scheduledVsPriorDelta >= 0 ? '+' : ''}
                {money(scheduledVsPriorDelta)} vs prior{' '}
                {summaryViewMode === 'calendar_month' ? 'month' : 'period'} (same filters)
              </p>
            ) : null}
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <span>
                Still unpaid:{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {money(stillDue)}
                </span>
              </span>
              <button
                type="button"
                title="Copy still unpaid total"
                className="btn-secondary shrink-0 !min-h-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold print:hidden"
                onClick={() => void navigator.clipboard.writeText(money(stillDue))}
              >
                Copy
              </button>
            </p>
            {projectedSavingsEndOfToday !== null ? (
              <p className="mt-3 rounded-lg border border-violet-200/80 bg-violet-50/70 px-3 py-2 text-sm text-violet-950 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-100">
                <span className="font-semibold">Savings (projected)</span>{' '}
                <span className="tabular-nums">{money(projectedSavingsEndOfToday)}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-violet-900/85 dark:text-violet-200/90">
                  Baseline and transfers on{' '}
                  <Link to="/settings#savings-account" className="underline decoration-violet-600/40">
                    Settings
                  </Link>
                  . Checking projection includes moves between accounts.
                </span>
              </p>
            ) : null}
            {summaryDensity === 'simple' ? (
              <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                <strong className="font-medium text-slate-600 dark:text-slate-300">
                  Scheduled
                </strong>{' '}
                is everything dated in{' '}
                {summaryViewMode === 'calendar_month'
                  ? 'this calendar month'
                  : 'this pay period'}
                .{' '}
                <strong className="font-medium text-slate-600 dark:text-slate-300">
                  Still unpaid
                </strong>{' '}
                is what you have not checked off yet below.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
            <span className="sr-only">Summary view</span>
            <select
              value={summaryViewMode}
              onChange={(e) =>
                setPreferences({
                  summaryViewMode: e.target.value as 'pay_period' | 'calendar_month',
                })
              }
              className="select-field !py-1.5 text-sm"
            >
              <option value="pay_period">Pay period</option>
              <option value="calendar_month">Calendar month</option>
            </select>
          </label>
          {summaryDensity === 'detailed' ? (
            <>
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="select-field !py-1.5 text-sm"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={envFilter}
                onChange={(e) => setEnvFilter(e.target.value)}
                className="select-field !py-1.5 text-sm"
              >
                <option value="">All envelopes</option>
                {envelopes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <input
                ref={withdrawalSearchRef}
                type="search"
                value={withdrawalSearch}
                onChange={(e) => setWithdrawalSearch(e.target.value)}
                placeholder="Search withdrawals…"
                className="input-field min-w-[10rem] max-w-xs flex-1 !py-1.5 text-sm"
              />
            </>
          ) : (
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-zinc-900 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                Filter & export
              </summary>
              <div className="absolute left-0 top-full z-40 mt-1 min-w-[min(100vw-2rem,22rem)] rounded-xl border border-slate-200/90 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-zinc-900">
                <div className="flex flex-col gap-2">
                  <select
                    value={catFilter}
                    onChange={(e) => setCatFilter(e.target.value)}
                    className="select-field !py-1.5 text-sm"
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={envFilter}
                    onChange={(e) => setEnvFilter(e.target.value)}
                    className="select-field !py-1.5 text-sm"
                  >
                    <option value="">All envelopes</option>
                    {envelopes.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  <input
                    ref={withdrawalSearchRef}
                    type="search"
                    value={withdrawalSearch}
                    onChange={(e) => setWithdrawalSearch(e.target.value)}
                    placeholder="Search withdrawals…"
                    className="input-field !py-1.5 text-sm"
                  />
                  <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        const ics = buildWithdrawalsIcs(
                          filtered,
                          `Cadence · ${exportWindowStartStr}`,
                        )
                        void downloadIcs(
                          `cadence-withdrawals-${exportWindowStartStr}.ics`,
                          ics,
                        ).catch(() => {
                          window.alert('Could not save the calendar file.')
                        })
                      }}
                      className="btn-secondary !min-h-0 w-full !py-2 text-xs"
                    >
                      Download .ics
                    </button>
                    <button
                      type="button"
                      onClick={downloadFullSummaryPdf}
                      className="btn-secondary !min-h-0 w-full !py-2 text-xs"
                    >
                      Download summary (PDF)
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="btn-secondary !min-h-0 w-full !py-2 text-xs"
                    >
                      Print / Save PDF
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !min-h-0 w-full !py-2 text-xs"
                      onClick={() => {
                        const lines = [
                          `Cadence — ${summaryViewMode === 'calendar_month' ? 'Calendar month' : 'Pay period'}`,
                          viewWindow
                            ? `Period: ${format(viewWindow.intervalStart, 'MMM d')} – ${format(
                                addDays(viewWindow.intervalEndExclusive, -1),
                                'MMM d, yyyy',
                              )}`
                            : '',
                          `Scheduled (filtered): ${money(totalScheduled)}`,
                          `Still due (unpaid): ${money(stillDue)}`,
                        ]
                        if (income !== null)
                          lines.push(`Estimated income (this period): ${money(income)}`)
                        if (projectedBalanceEndOfPayPeriod !== null) {
                          lines.push(
                            `Projected balance end of pay period: ${money(projectedBalanceEndOfPayPeriod)}`,
                          )
                        }
                        if (safeToSpend !== null) {
                          lines.push(
                            `Safe to spend (after cushion): ${money(safeToSpend)}`,
                          )
                        }
                        void navigator.clipboard.writeText(lines.filter(Boolean).join('\n'))
                      }}
                    >
                      Copy snapshot
                    </button>
                  </div>
                </div>
              </div>
            </details>
          )}
        </div>
        {summaryDensity === 'detailed' ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const ics = buildWithdrawalsIcs(
                  filtered,
                  `Cadence · ${exportWindowStartStr}`,
                )
                void downloadIcs(
                  `cadence-withdrawals-${exportWindowStartStr}.ics`,
                  ics,
                ).catch(() => {
                  window.alert('Could not save the calendar file.')
                })
              }}
              className="btn-secondary"
            >
              Download .ics
            </button>
            <button
              type="button"
              onClick={downloadFullSummaryPdf}
              className="btn-secondary"
            >
              Download summary (PDF)
            </button>
            <button type="button" onClick={() => window.print()} className="btn-secondary">
              Print / Save PDF
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                const lines = [
                  `Cadence — ${summaryViewMode === 'calendar_month' ? 'Calendar month' : 'Pay period'}`,
                  viewWindow
                    ? `Period: ${format(viewWindow.intervalStart, 'MMM d')} – ${format(
                        addDays(viewWindow.intervalEndExclusive, -1),
                        'MMM d, yyyy',
                      )}`
                    : '',
                  `Scheduled (filtered): ${money(totalScheduled)}`,
                  `Still due (unpaid): ${money(stillDue)}`,
                ]
                if (income !== null)
                  lines.push(`Estimated income (this period): ${money(income)}`)
                if (projectedBalanceEndOfPayPeriod !== null) {
                  lines.push(`Projected balance end of pay period: ${money(projectedBalanceEndOfPayPeriod)}`)
                }
                if (safeToSpend !== null) {
                  lines.push(
                    `Safe to spend (after cushion): ${money(safeToSpend)}`,
                  )
                }
                void navigator.clipboard.writeText(lines.filter(Boolean).join('\n'))
              }}
            >
              Copy snapshot
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadFullSummaryPdf} className="btn-secondary text-xs">
              PDF
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
      <div className="card scroll-mt-24" id="quick-expense-section">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
          <div className="min-w-0">
            <p className="section-label">Spend</p>
            <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              Quick expense (
              {summaryViewMode === 'calendar_month' ? 'this month' : 'this period'})
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Fast discretionary spend — appears with other withdrawals and in the
              calendar.
            </p>
          </div>
          <PageUndo />
        </div>
        {quickExpenseTemplates.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {quickExpenseTemplates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 pl-2 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <button
                  type="button"
                  className="py-1.5 pr-1 text-left text-xs font-medium text-slate-800 dark:text-slate-200"
                  onClick={() => {
                    setQeNote(t.label)
                    setQeAmount(String(t.amount))
                    setQeDate(todayStr)
                    setQeCat(t.category ?? '')
                    setQeEnv(t.envelopeId ?? '')
                  }}
                >
                  {t.label}
                  <span className="ml-1 font-normal text-slate-500">
                    {money(t.amount)}
                  </span>
                </button>
                <button
                  type="button"
                  className="px-2 py-1.5 text-xs text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                  title="Remove template"
                  onClick={() => removeQuickExpenseTemplate(t.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const amount = Number(qeAmount)
            if (!qeDate || Number.isNaN(amount) || amount < 0) return
            addExpenseEntry({
              amount,
              date: qeDate,
              note: qeNote.trim() || undefined,
              category: qeCat.trim() || undefined,
              envelopeId: qeEnv.trim() || undefined,
            })
            setPreferences({
              lastQuickExpenseCategory: qeCat.trim() || undefined,
              lastQuickExpenseEnvelopeId: qeEnv.trim() || undefined,
            })
            setQeNote('')
            setQeAmount('')
            setQeDate(todayStr)
          }}
        >
          <input
            value={qeNote}
            onChange={(e) => setQeNote(e.target.value)}
            placeholder="What (optional)"
            className="input-field min-w-[8rem] flex-1"
          />
          <input
            value={qeAmount}
            onChange={(e) => setQeAmount(e.target.value)}
            type="number"
            step="0.01"
            min="0"
            placeholder="Amount"
            className="input-field w-28"
            required
          />
          <input
            value={qeDate}
            onChange={(e) => setQeDate(e.target.value)}
            type="date"
            className="input-field"
            required
          />
          <select
            value={qeCat}
            onChange={(e) => setQeCat(e.target.value)}
            className="select-field !py-1.5 text-sm"
          >
            <option value="">Category</option>
            {categories.map((c) => (
              <option key={`qe-${c}`} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={qeEnv}
            onChange={(e) => setQeEnv(e.target.value)}
            className="select-field !py-1.5 text-sm"
          >
            <option value="">Envelope</option>
            {envelopes.map((ev) => (
              <option key={`qe-${ev.id}`} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary !py-2 text-sm">
            Add expense
          </button>
          <button
            type="button"
            className="btn-secondary !py-2 text-sm"
            onClick={() => {
              const amount = Number(qeAmount)
              if (Number.isNaN(amount) || amount < 0) return
              addQuickExpenseTemplate({
                label: qeNote.trim() || 'Expense',
                amount,
                category: qeCat.trim() || undefined,
                envelopeId: qeEnv.trim() || undefined,
              })
            }}
          >
            Save as template
          </button>
        </form>

        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/10">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            Quick transfer
          </h4>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Log money moved between checking and savings — updates projected checking (and savings
            if you set a baseline on{' '}
            <Link to="/settings#savings-account" className="link-accent">
              Settings
            </Link>
            ).
          </p>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const amount = Number(qtAmount)
              if (!qtDate.trim() || !Number.isFinite(amount) || amount <= 0) return
              addSavingsAccountTransfer({
                date: qtDate.trim(),
                amount,
                direction: qtDir,
                note: qtNote.trim() || undefined,
              })
              setQtAmount('')
              setQtNote('')
              setQtDate(todayStr)
            }}
          >
            <input
              value={qtAmount}
              onChange={(e) => setQtAmount(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              className="input-field w-28"
              required
              aria-label="Transfer amount"
            />
            <input
              value={qtDate}
              onChange={(e) => setQtDate(e.target.value)}
              type="date"
              className="input-field"
              required
              aria-label="Transfer date"
            />
            <select
              value={qtDir}
              onChange={(e) =>
                setQtDir(e.target.value as 'to_savings' | 'from_savings')
              }
              className="select-field !py-1.5 text-sm"
              aria-label="Transfer direction"
            >
              <option value="to_savings">To savings</option>
              <option value="from_savings">From savings</option>
            </select>
            <input
              value={qtNote}
              onChange={(e) => setQtNote(e.target.value)}
              placeholder="Note (optional)"
              className="input-field min-w-[8rem] flex-1"
            />
            <button type="submit" className="btn-solid !py-2 text-sm">
              Add transfer
            </button>
          </form>
          {!hasSavingsAnchor(paySettings) ? (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Transfers still affect <span className="font-medium text-slate-600 dark:text-slate-300">checking</span>{' '}
              projections. Add a savings balance on Settings to see{' '}
              <span className="font-medium text-slate-600 dark:text-slate-300">Savings (projected)</span> in the hero.
            </p>
          ) : null}
        </div>
      </div>

      {showCashFlowCard ? (
        <div className="card">
          <p className="section-label">Cash flow</p>
          <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
            {summaryViewMode === 'calendar_month' ? 'This calendar month' : 'This pay period'}
          </h3>
          {showPaycheckCashLines ? (
            <>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Estimated income (take-home + extra lines in{' '}
                    {summaryViewMode === 'calendar_month'
                      ? 'this calendar month'
                      : 'this pay period'}
                    )
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
                    {money(hypoIncome!)}
                  </p>
                  {takeHomeForView && takeHomeForView.paydayCount > 1 ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {takeHomeForView.paydayCount} paychecks in{' '}
                      {summaryViewMode === 'calendar_month'
                        ? 'this calendar month'
                        : 'this pay period'}
                      . Extra income
                      lines apply per paycheck (
                      <Link to="/settings" className="link-accent">
                        Settings
                      </Link>
                      ).
                    </p>
                  ) : takeHomeForView && takeHomeForView.paydayCount === 1 ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Includes extra income lines from{' '}
                      <Link to="/settings" className="link-accent">
                        Settings
                      </Link>
                      .
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Minus still unpaid (filtered list)
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                    − {money(hypoStillDue)}
                  </p>
                </div>
              </div>
              {summaryDensity === 'simple' && hypoRemaining !== null ? (
                <p className="mt-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 dark:text-slate-200">
                  <span className="text-slate-500 dark:text-slate-400">
                    Income minus unpaid (this period):{' '}
                  </span>
                  <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                    {money(hypoRemaining)}
                  </span>
                </p>
              ) : null}
              {summaryDensity === 'simple' ? (
                <details className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/60 dark:border-white/10 dark:bg-zinc-900/25">
                  <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
                    <span className="mr-1.5 text-slate-400" aria-hidden>
                      ▸
                    </span>
                    What-if sliders &amp; other balance estimates
                  </summary>
                  <div className="space-y-4 border-t border-slate-200/80 px-3 pb-3 pt-3 dark:border-white/10">
                    <div
                      className={[
                        'grid gap-3 sm:grid-cols-2',
                      ].join(' ')}
                    >
                      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                        What-if: extra income this period ($)
                        <input
                          type="number"
                          step="0.01"
                          value={whatIfIncomeAdj}
                          onChange={(e) => {
                            const v =
                              e.target.value === '' ? 0 : Number(e.target.value)
                            setWhatIfIncomeAdj(Number.isFinite(v) ? v : 0)
                          }}
                          className="input-field !py-1.5 text-sm"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                        What-if: extra still-due ($, positive = owe more)
                        <input
                          type="number"
                          step="0.01"
                          value={whatIfDueAdj}
                          onChange={(e) => {
                            const v =
                              e.target.value === '' ? 0 : Number(e.target.value)
                            setWhatIfDueAdj(Number.isFinite(v) ? v : 0)
                          }}
                          className="input-field !py-1.5 text-sm"
                        />
                      </label>
                    </div>
                    <WhatIfStressPresets
                      periodIncome={income}
                      setWhatIfIncomeAdj={setWhatIfIncomeAdj}
                      setWhatIfDueAdj={setWhatIfDueAdj}
                    />
                    {whatIfProjectedEndApprox !== null &&
                    (whatIfIncomeAdj !== 0 || whatIfDueAdj !== 0) ? (
                      <div className="rounded-xl border border-sky-200/80 bg-sky-50/90 px-4 py-3 dark:border-sky-800/50 dark:bg-sky-950/30">
                        <p className="text-xs font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-200">
                          Approx. projected balance (end of pay period, with what-if)
                        </p>
                        <p
                          className={[
                            'mt-1 text-xl font-bold tabular-nums',
                            whatIfProjectedEndApprox > 0
                              ? 'text-sky-900 dark:text-sky-100'
                              : 'text-rose-800 dark:text-rose-200',
                          ].join(' ')}
                        >
                          {money(whatIfProjectedEndApprox)}
                        </p>
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                          Applies your what-if adjustments to the projected balance at the end of the
                          current pay period (same day as Upcoming). For a full replay, change income or
                          bills in Settings.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : (
                <>
                  <div
                    className={[
                      'mt-4 grid gap-3 border-t border-slate-100 pt-4 dark:border-white/10 sm:grid-cols-2',
                    ].join(' ')}
                  >
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      What-if: extra income this period ($)
                      <input
                        type="number"
                        step="0.01"
                        value={whatIfIncomeAdj}
                        onChange={(e) => {
                          const v =
                            e.target.value === '' ? 0 : Number(e.target.value)
                          setWhatIfIncomeAdj(Number.isFinite(v) ? v : 0)
                        }}
                        className="input-field !py-1.5 text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      What-if: extra still-due ($, positive = owe more)
                      <input
                        type="number"
                        step="0.01"
                        value={whatIfDueAdj}
                        onChange={(e) => {
                          const v =
                            e.target.value === '' ? 0 : Number(e.target.value)
                          setWhatIfDueAdj(Number.isFinite(v) ? v : 0)
                        }}
                        className="input-field !py-1.5 text-sm"
                      />
                    </label>
                  </div>
                  <WhatIfStressPresets
                    periodIncome={income}
                    setWhatIfIncomeAdj={setWhatIfIncomeAdj}
                    setWhatIfDueAdj={setWhatIfDueAdj}
                  />
                  {whatIfProjectedEndApprox !== null &&
                  (whatIfIncomeAdj !== 0 || whatIfDueAdj !== 0) ? (
                    <div className="mt-4 rounded-xl border border-sky-200/80 bg-sky-50/90 px-4 py-3 dark:border-sky-800/50 dark:bg-sky-950/30">
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-200">
                        Approx. projected balance (end of pay period, with what-if)
                      </p>
                      <p
                        className={[
                          'mt-1 text-xl font-bold tabular-nums',
                          whatIfProjectedEndApprox > 0
                            ? 'text-sky-900 dark:text-sky-100'
                            : 'text-rose-800 dark:text-rose-200',
                        ].join(' ')}
                      >
                        {money(whatIfProjectedEndApprox)}
                      </p>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                        Applies your what-if adjustments to the projected balance at the end of the
                        current pay period (same day as Upcoming). For a full replay, change income or
                        bills in Settings.
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Add take-home on{' '}
              <Link to="/settings" className="link-accent">
                Settings
              </Link>{' '}
              to see income vs unpaid; starting funds below still drive bank
              projection.
            </p>
          )}
          {safeToSpend !== null ? (
            <div className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 dark:border-emerald-800/50 dark:bg-emerald-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
                Safe to spend (after cushion)
              </p>
              <p
                className={[
                  'mt-1 text-2xl font-bold tabular-nums',
                  safeToSpend > 0
                    ? 'text-emerald-900 dark:text-emerald-100'
                    : 'text-rose-800 dark:text-rose-200',
                ].join(' ')}
                aria-live="polite"
              >
                {money(safeToSpend)}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                Starts from the headline projected balance at the end of this pay period (scheduled
                bills and withdrawals on their dates), then subtracts your cushion from Settings.
              </p>
            </div>
          ) : null}
          {projectedBalanceEndOfToday !== null ? (
            summaryDensity === 'simple' ? (
              <details className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/60 dark:border-white/10 dark:bg-zinc-900/25">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
                  <span className="mr-1.5 text-slate-400" aria-hidden>
                    ▸
                  </span>
                  Estimated bank balance (end of today)
                </summary>
                <div
                  className={[
                    'border-t px-4 py-3 dark:border-white/10',
                    projectedBalanceEndOfToday > 0
                      ? 'border-violet-200/80 bg-violet-50/90 dark:border-violet-800/50 dark:bg-violet-950/35'
                      : projectedBalanceEndOfToday < 0
                        ? 'border-red-200/80 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/35'
                        : 'border-slate-200/80 bg-slate-50/90 dark:border-white/10 dark:bg-slate-800/40',
                  ].join(' ')}
                >
                  <p
                    className={[
                      'text-2xl font-bold tabular-nums tracking-tight',
                      projectedBalanceEndOfToday > 0
                        ? 'text-violet-900 dark:text-violet-100'
                        : projectedBalanceEndOfToday < 0
                          ? 'text-red-800 dark:text-red-200'
                          : 'text-slate-800 dark:text-slate-200',
                    ].join(' ')}
                  >
                    {money(projectedBalanceEndOfToday)}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    Uses Starting funds in Settings plus scheduled paychecks and withdrawals through today — your bank trajectory, not only this period’s income minus unpaid.
                  </p>
                </div>
              </details>
            ) : (
              <div
                className={[
                  'mt-4 rounded-xl border px-4 py-3 backdrop-blur-sm',
                  projectedBalanceEndOfToday > 0
                    ? 'border-violet-200/80 bg-violet-50/90 dark:border-violet-800/50 dark:bg-violet-950/35'
                    : projectedBalanceEndOfToday < 0
                      ? 'border-red-200/80 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/35'
                      : 'border-slate-200/80 bg-slate-50/90 dark:border-white/10 dark:bg-slate-800/40',
                ].join(' ')}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Projected bank balance (end of today)
                </p>
                <p
                  className={[
                    'mt-1 text-2xl font-bold tabular-nums tracking-tight',
                    projectedBalanceEndOfToday > 0
                      ? 'text-violet-900 dark:text-violet-100'
                      : projectedBalanceEndOfToday < 0
                        ? 'text-red-800 dark:text-red-200'
                        : 'text-slate-800 dark:text-slate-200',
                  ].join(' ')}
                >
                  {money(projectedBalanceEndOfToday)}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Uses Starting funds in Settings plus scheduled paychecks and withdrawals through today — your bank trajectory, not only this period’s income minus unpaid.
                </p>
              </div>
            )
          ) : null}
          {showPaycheckCashLines && hypoRemaining !== null && summaryDensity === 'detailed' ? (
            <div
              className={[
                'mt-4 rounded-xl border px-4 py-3 backdrop-blur-sm',
                hypoRemaining > 0
                  ? 'border-emerald-200/80 bg-emerald-50/90 dark:border-emerald-800/50 dark:bg-emerald-950/35'
                  : hypoRemaining < 0
                    ? 'border-red-200/80 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/35'
                    : 'border-slate-200/80 bg-slate-50/90 dark:border-white/10 dark:bg-slate-800/40',
              ].join(' ')}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Paycheck budget left
              </p>
              <p
                className={[
                  'mt-1 text-xl font-bold tabular-nums tracking-tight',
                  hypoRemaining > 0
                    ? 'text-emerald-800 dark:text-emerald-200'
                    : hypoRemaining < 0
                      ? 'text-red-800 dark:text-red-200'
                      : 'text-slate-800 dark:text-slate-200',
                ].join(' ')}
              >
                {money(hypoRemaining)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {projectedBalanceEndOfToday !== null
                  ? 'Only this period’s take-home minus unpaid items — it does not add cash you already had in the bank before starting funds.'
                  : 'This period’s take-home minus unpaid items. Add starting funds in Settings to see projected bank balance above.'}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="card print:hidden">
          <p className="section-label">Cash flow</p>
          <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
            This pay period
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Add take-home and optional starting funds on{' '}
            <Link to="/settings" className="link-accent">
              Settings
            </Link>{' '}
            to see paycheck math, projected bank balance, and what-if tools.
          </p>
        </div>
      )}
      </div>

      <details
        open={summaryDensity === 'detailed'}
        className={
          summaryDensity === 'detailed'
            ? 'contents'
            : 'rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-900/[0.04] dark:border-white/[0.08] dark:bg-zinc-900 dark:shadow-none'
        }
      >
        <summary
          className={
            summaryDensity === 'detailed'
              ? 'hidden'
              : 'cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 [&::-webkit-details-marker]:hidden'
          }
        >
          <span className="mr-1.5 inline-block text-slate-400" aria-hidden>
            ▸
          </span>
          Charts, budgets &amp; planning tools
        </summary>
        <div
          className={
            summaryDensity === 'detailed'
              ? 'contents'
              : 'space-y-5 border-t border-slate-100 px-2 pb-4 pt-4 dark:border-white/10 sm:px-4'
          }
        >
      <div className="card print:hidden">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Next 14 days (all schedules)
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Days with at least one withdrawal or expense — not limited to the period above.
        </p>
        <div className="mt-3">
          <CashflowStrip
            outflows={stripOutflows}
            todayStr={todayStr}
            dayCount={14}
            formatMoney={money}
          />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:items-start">
      <div className="card">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Spending by category (
          {summaryViewMode === 'calendar_month' ? 'this month' : 'this period'})
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          All scheduled withdrawals in{' '}
          {summaryViewMode === 'calendar_month' ? 'this calendar month' : 'this pay period'},
          including quick expenses. “vs prior” compares to the previous{' '}
          {summaryViewMode === 'calendar_month' ? 'month' : 'pay period'}.
        </p>
        {categoryTotals.size === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No categorized spending yet.</p>
        ) : (
          <div className="mt-4 flex flex-col items-stretch gap-6 md:flex-row md:items-start">
            <CategorySpendDonut
              sortedEntries={sortedCategorySpending}
              formatMoney={money}
            />
            <ul className="min-w-0 flex-1 space-y-2.5">
              {sortedCategorySpending.map(([cat, amt]) => {
                const prevAmt = categoryPrevTotals?.get(cat)
                const delta =
                  prevAmt !== undefined ? amt - prevAmt : null
                return (
                  <li key={cat}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-300">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${categoryDotClass(cat)}`}
                          aria-hidden
                        />
                        <span className="truncate">{cat}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 tabular-nums">
                        <span className="text-slate-900 dark:text-slate-100">{money(amt)}</span>
                        {delta !== null ? (
                          <span
                            className={
                              delta > 0
                                ? 'text-xs text-amber-700 dark:text-amber-300'
                                : delta < 0
                                  ? 'text-xs text-emerald-700 dark:text-emerald-300'
                                  : 'text-xs text-slate-500'
                            }
                          >
                            {delta > 0 ? '+' : ''}
                            {money(delta)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="card md:min-h-0">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Period budgets
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Compare what you planned vs scheduled totals for this pay period. Budgets always
          match the{' '}
          <strong className="font-medium text-slate-700 dark:text-slate-300">
            current pay period
          </strong>{' '}
          ({format(period.intervalStart, 'MMM d')} →{' '}
          {format(payPeriodInclusiveLastDay(period), 'MMM d')}, next payday {format(period.nextPayday, 'MMM d')}),
          not the
          calendar month toggle.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-2 print:hidden"
          onSubmit={(e) => {
            e.preventDefault()
            if (!period) return
            const fd = new FormData(e.currentTarget)
            const targetType = budgetKind
            const rawKey =
              targetType === 'category'
                ? String(fd.get('pbCat') || '').trim()
                : String(fd.get('pbEnv') || '').trim()
            const budgeted = Number(fd.get('pbAmount'))
            if (!rawKey || Number.isNaN(budgeted) || budgeted < 0) return
            upsertPeriodBudget({
              periodStart: periodStartStr,
              periodEndExclusive: periodEndExStr,
              targetType,
              targetKey: rawKey,
              budgeted,
            })
            e.currentTarget.reset()
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Type
            <select
              value={budgetKind}
              onChange={(e) =>
                setBudgetKind(e.target.value as 'category' | 'envelope')
              }
              className="select-field !py-1.5 text-sm"
            >
              <option value="category">Category</option>
              <option value="envelope">Envelope</option>
            </select>
          </label>
          {budgetKind === 'category' ? (
            <label className="block min-w-[10rem] flex-1 text-xs text-slate-500">
              Category
              <select
                name="pbCat"
                className="select-field mt-1 w-full !py-1.5 text-sm"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block min-w-[10rem] flex-1 text-xs text-slate-500">
              Envelope
              <select
                name="pbEnv"
                className="select-field mt-1 w-full !py-1.5 text-sm"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Select…
                </option>
                {envelopes.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs text-slate-500">
            Budget
            <input
              name="pbAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              className="input-field mt-1 w-28"
            />
          </label>
          <button type="submit" className="btn-solid self-end">
            Set budget
          </button>
        </form>
        {budgetsThisPeriod.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No budgets for this period yet.</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {budgetsThisPeriod.map((row) => {
              const actual =
                row.targetType === 'category'
                  ? allOutflows
                      .filter(
                        (o) => (o.category || '').trim() === row.targetKey.trim(),
                      )
                      .reduce((s, o) => s + o.amount, 0)
                  : allOutflows
                      .filter((o) => o.envelopeId === row.targetKey)
                      .reduce((s, o) => s + o.amount, 0)
              const label =
                row.targetType === 'envelope'
                  ? envelopes.find((e) => e.id === row.targetKey)?.name ??
                    row.targetKey
                  : row.targetKey
              const pct =
                row.budgeted > 0
                  ? Math.min(100, Math.round((actual / row.budgeted) * 100))
                  : 0
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-slate-100/90 bg-slate-50/50 px-3 py-2 dark:border-white/5 dark:bg-white/[0.03]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {label}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        ({row.targetType})
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                      onClick={() => removePeriodBudget(row.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Actual {money(actual)} / budget {money(row.budgeted)} ({pct}%)
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={[
                        'h-full rounded-full',
                        actual > row.budgeted ? 'bg-amber-500' : 'bg-emerald-500',
                      ].join(' ')}
                      style={{
                        width: `${row.budgeted > 0 ? Math.min(100, (actual / row.budgeted) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      </div>

      {categoryMovers.length > 0 ? (
        <div className="card print:hidden">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Largest category swings (vs prior{' '}
            {summaryViewMode === 'calendar_month' ? 'month' : 'pay period'})
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Sorted by absolute change — useful to spot drift at a glance.
          </p>
          <ul className="mt-4 space-y-3">
            {categoryMovers.map(({ cat, delta, cur, prev }) => (
              <li key={cat}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-300">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${categoryDotClass(cat)}`}
                      aria-hidden
                    />
                    <span className="truncate">{cat}</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-2 tabular-nums">
                    <span className="text-slate-600 dark:text-slate-400">
                      {money(prev)} → {money(cur)}
                    </span>
                    <span
                      className={
                        delta > 0
                          ? 'text-xs font-semibold text-amber-700 dark:text-amber-300'
                          : delta < 0
                            ? 'text-xs font-semibold text-emerald-700 dark:text-emerald-300'
                            : 'text-xs text-slate-500'
                      }
                    >
                      {delta > 0 ? '+' : ''}
                      {money(delta)}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {savingsGoals.length > 0 && (
        <div className="card">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Savings goals
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Tracked on{' '}
            <Link to="/settings" className="link-accent">
              Settings
            </Link>
            .
          </p>
          <ul className="mt-4 space-y-3">
            {savingsGoals.map((g) => {
              const pct =
                g.targetAmount > 0
                  ? Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100))
                  : 0
              return (
                <li key={g.id}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-slate-800 dark:text-slate-200">{g.name}</span>
                    <span className="tabular-nums text-slate-600 dark:text-slate-400">
                      {money(g.savedAmount)} / {money(g.targetAmount)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="grid gap-5 print:hidden md:grid-cols-2 md:items-start">
      <div className="card">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Next 7 days
        </h3>
        {nextSevenDays.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing scheduled.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {nextSevenDays.map((o) => (
              <li key={`${paidKeyForOutflow(o)}`} className="flex justify-between gap-2">
                <span className="text-slate-600 dark:text-slate-400">
                  {format(parseISO(o.date), 'EEE MMM d')} — {o.name}
                  {o.source === 'oneoff'
                    ? ' (one-off)'
                    : o.source === 'expense'
                      ? ' (expense)'
                      : ''}
                </span>
                <span className="tabular-nums">{money(o.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          One-off in this period
        </h3>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const name = String(fd.get('ooName') || '').trim()
            const amount = Number(fd.get('ooAmount'))
            const date = String(fd.get('ooDate') || '')
            if (!name || !date || Number.isNaN(amount) || amount < 0) return
            addOneOff({ name, amount, date })
            e.currentTarget.reset()
          }}
        >
          <input
            name="ooName"
            placeholder="Label"
            className="input-field min-w-[8rem] flex-1"
          />
          <input
            name="ooAmount"
            type="number"
            step="0.01"
            min="0"
            placeholder="Amount"
            className="input-field w-28"
          />
          <input
            name="ooDate"
            type="date"
            defaultValue={todayStr}
            className="input-field"
          />
          <button type="submit" className="btn-solid">
            Add
          </button>
        </form>
      </div>
      </div>

      {hasStartingFunds(paySettings, preferences) && (
          <div className="card">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Projected running balance
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              From your starting funds (date + amount in Settings): paychecks and
              withdrawals after that date, then each scheduled item in this pay
              period after that date (all scheduled, not only unpaid).
            </p>
            {runningRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                No scheduled withdrawals after your starting funds date in this pay
                period.
              </p>
            ) : (
            <div className="mt-3 overflow-x-auto text-sm">
              <table className="w-full min-w-[280px] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">Item</th>
                    <th className="py-1 pr-2 text-right">Out</th>
                    <th className="py-1 text-right">After</th>
                  </tr>
                </thead>
                <tbody>
                  {runningRows.map(({ o, balanceAfter }) => (
                    <tr
                      key={paidKeyForOutflow(o)}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-1.5 pr-2 whitespace-nowrap text-slate-600">
                        {format(parseISO(o.date), 'MMM d')}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-800 dark:text-slate-200">
                        {o.name}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {money(o.amount)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">
                        {money(balanceAfter)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}
        </div>
      </details>

      <div className="card">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {summaryViewMode === 'calendar_month'
                ? 'Withdrawals this month'
                : withdrawalPayPeriodOffset === 0
                  ? 'Withdrawals this period'
                  : 'Withdrawals (selected pay period)'}
            </h2>
            {summaryViewMode === 'pay_period' && viewedPayPeriod ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {format(viewedPayPeriod.intervalStart, 'MMM d')} –{' '}
                {format(payPeriodInclusiveLastDay(viewedPayPeriod), 'MMM d')}
              </p>
            ) : null}
          </div>
          {summaryViewMode === 'pay_period' && paySettings ? (
            <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-none sm:gap-1.5 print:hidden">
              <button
                type="button"
                onClick={() => setWithdrawalPayPeriodOffset((o) => o - 1)}
                className="btn-secondary min-h-12 !px-2 !py-2.5 text-sm sm:!px-3"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setWithdrawalPayPeriodOffset(0)}
                className="btn-secondary min-h-12 !px-2 !py-2.5 text-sm sm:!px-3"
              >
                This period
              </button>
              <button
                type="button"
                onClick={() => setWithdrawalPayPeriodOffset((o) => o + 1)}
                className="btn-secondary min-h-12 !px-2 !py-2.5 text-sm sm:!px-3"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
        {filtered.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Nothing in this filter. Adjust filters or add bills / one-offs.
          </p>
        ) : withdrawalsList.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No withdrawals match your search. Clear the search box to see all
            items in the current filters.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
            {withdrawalsList.map((o) => {
              const pk = paidKeyForOutflow(o)
              const paid = isPaid(o)
              return (
                <li
                  key={pk}
                  id={outflowRowDomId(pk)}
                  className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0"
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={paid}
                      onChange={() => togglePaidWithUndo(pk)}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 dark:border-slate-600"
                    />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {o.name}
                        {paid ? (
                          <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                            Paid
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {format(parseISO(o.date), 'EEE, MMM d')}
                        {o.category ? ` · ${o.category}` : ''}
                        {o.source === 'oneoff'
                          ? ' · One-off'
                          : o.source === 'expense'
                            ? ' · Expense'
                            : ''}
                      </p>
                      {o.note ? (
                        <p className="mt-0.5 text-xs text-slate-500">{o.note}</p>
                      ) : null}
                    </div>
                  </label>
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        'tabular-nums',
                        paid
                          ? 'text-slate-400 line-through'
                          : 'text-slate-800 dark:text-slate-200',
                      ].join(' ')}
                    >
                      {money(o.amount)}
                    </span>
                    {o.source === 'oneoff' ? (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                        onClick={() =>
                          removeOneOff(o.billId.replace(/^oneoff:/, ''))
                        }
                      >
                        Remove
                      </button>
                    ) : o.source === 'expense' ? (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                        onClick={() =>
                          removeExpenseEntry(o.billId.replace(/^expense:/, ''))
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-4 text-xs text-slate-500 print:hidden">
          Today ({format(today, 'MMM d')}) — data stays on this device.
        </p>
      </div>

      <button
        type="button"
        title="Scroll to quick expense"
        aria-label="Quick add expense"
        className="print:hidden fixed bottom-[max(5.25rem,env(safe-area-inset-bottom))] right-4 z-40 rounded-full border border-emerald-700/30 bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-emerald-900/25 hover:bg-emerald-700 lg:bottom-10 dark:border-emerald-400/25 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        onClick={() =>
          document.getElementById('quick-expense-section')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        }
      >
        Quick add
      </button>
    </div>
  )
}
