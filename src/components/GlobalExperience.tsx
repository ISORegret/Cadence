import { Capacitor } from '@capacitor/core'
import { format } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fireLowBalanceLocalNotification,
  syncBillDueAlertsToDevice,
  syncCalendarRemindersToDevice,
} from '../lib/localNotifs'
import { formatMoney } from '../lib/money'
import { getCurrentPayPeriod } from '../lib/payPeriod'
import { minProjectedBalanceAfter } from '../lib/runningBalance'
import { useFinanceStore } from '../store/financeStore'

function todayLocalDayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function GlobalExperience() {
  const paySettings = useFinanceStore((s) => s.paySettings)
  const bills = useFinanceStore((s) => s.bills)
  const oneOffItems = useFinanceStore((s) => s.oneOffItems)
  const expenseEntries = useFinanceStore((s) => s.expenseEntries)
  const incomeLines = useFinanceStore((s) => s.incomeLines)
  const preferences = useFinanceStore((s) => s.preferences)
  const setPreferences = useFinanceStore((s) => s.setPreferences)

  const [splashDone, setSplashDone] = useState(false)
  const [hydrated, setHydrated] = useState(
    () => useFinanceStore.persist.hasHydrated(),
  )
  const [lowBalanceOpen, setLowBalanceOpen] = useState(false)
  const [lowBalanceMin, setLowBalanceMin] = useState<number | null>(null)

  const welcomeNeeds = preferences.welcomeDismissedAt === null

  useEffect(() => {
    const t = window.setTimeout(() => setSplashDone(true), 900)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    return useFinanceStore.persist.onFinishHydration(() => setHydrated(true))
  }, [])

  useEffect(() => {
    if (!hydrated || !Capacitor.isNativePlatform()) return
    void syncCalendarRemindersToDevice(preferences.calendarReminders ?? [])
    void syncBillDueAlertsToDevice(bills, paySettings, {
      billDueAlertsEnabled: preferences.billDueAlertsEnabled,
      billDueAlertDaysBefore: preferences.billDueAlertDaysBefore,
    })
  }, [
    hydrated,
    preferences.calendarReminders,
    preferences.billDueAlertsEnabled,
    preferences.billDueAlertDaysBefore,
    bills,
    paySettings,
  ])

  const showIntro = splashDone && hydrated && welcomeNeeds

  const minBal = useMemo(() => {
    if (!paySettings) return null
    const period = getCurrentPayPeriod(new Date(), paySettings)
    return minProjectedBalanceAfter({
      paySettings,
      period,
      bills,
      oneOffItems,
      expenseEntries,
      incomeLines,
      legacyPreferences: preferences,
    })
  }, [
    paySettings,
    bills,
    oneOffItems,
    expenseEntries,
    incomeLines,
    preferences,
  ])

  const threshold = preferences.lowBalanceThreshold
  const lowEnabled = preferences.lowBalanceAlertEnabled === true
  const thresholdOk =
    typeof threshold === 'number' && !Number.isNaN(threshold)

  useEffect(() => {
    if (!splashDone || !hydrated) return
    if (!lowEnabled || !thresholdOk || minBal === null) return
    if (minBal >= threshold) return
    const day = todayLocalDayStr()
    if (preferences.lastLowBalanceAlertDay === day) return
    setPreferences({ lastLowBalanceAlertDay: day })
    queueMicrotask(() => {
      setLowBalanceMin(minBal)
      setLowBalanceOpen(true)
      const body = `Lowest balance after a scheduled item is about ${formatMoney(minBal, paySettings)} (threshold ${formatMoney(threshold, paySettings)}).`
      if (Capacitor.isNativePlatform()) {
        void fireLowBalanceLocalNotification(body)
      } else if (
        typeof globalThis.Notification !== 'undefined' &&
        globalThis.Notification.permission === 'granted'
      ) {
        try {
          new globalThis.Notification('Cadence — low projected balance', { body })
        } catch {
          /* ignore */
        }
      }
    })
  }, [
    splashDone,
    hydrated,
    lowEnabled,
    thresholdOk,
    minBal,
    threshold,
    preferences.lastLowBalanceAlertDay,
    paySettings,
    setPreferences,
  ])

  const money = (n: number) => formatMoney(n, paySettings)

  return (
    <>
      {!splashDone && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-zinc-900 to-slate-950 text-white"
          role="presentation"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-300/90">
            Cadence
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
            Budget between paychecks
          </h1>
          <div className="mt-8 h-1 w-32 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-400" />
          </div>
        </div>
      )}

      {showIntro && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
        >
          <div className="card max-h-[90vh] w-full max-w-md overflow-y-auto shadow-2xl">
            <p className="section-label">Welcome</p>
            <h2
              id="welcome-title"
              className="mt-2 text-xl font-bold text-slate-900 dark:text-white"
            >
              Cadence keeps pay periods honest
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Nothing connects to your bank — you log bills, one-offs, and quick
              expenses. Summary shows what is still due before payday; Calendar
              shows the month; you can export backups anytime.
            </p>
            <ul className="mt-4 list-inside list-disc space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
              <li>Due-date reminders from bill schedules</li>
              <li>Optional alert when projected balance drops below a limit</li>
              <li>
                On the phone app, system notifications when you allow them; on the
                web, browser notifications if supported
              </li>
            </ul>
            <button
              type="button"
              className="btn-primary mt-6 w-full"
              onClick={() =>
                setPreferences({ welcomeDismissedAt: new Date().toISOString() })
              }
            >
              Get started
            </button>
          </div>
        </div>
      )}

      {lowBalanceOpen && lowBalanceMin !== null && thresholdOk && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lowbal-title"
        >
          <div className="card w-full max-w-md shadow-2xl">
            <p className="section-label">Balance alert</p>
            <h2
              id="lowbal-title"
              className="mt-2 text-lg font-bold text-slate-900 dark:text-white"
            >
              Projected balance is low
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              After scheduled withdrawals (in date order), your balance is
              projected to dip to about{' '}
              <strong className="text-slate-900 dark:text-white">
                {money(lowBalanceMin)}
              </strong>
              , below your threshold of{' '}
              <strong className="text-slate-900 dark:text-white">
                {money(threshold!)}
              </strong>
              . This uses starting balance + this period&apos;s income minus each
              item — same as the running balance table on Summary.
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
              You will not get more than one alert per day. Change this on{' '}
              <Link to="/settings" className="link-accent">
                Settings
              </Link>
              .
            </p>
            <button
              type="button"
              className="btn-primary mt-6 w-full"
              onClick={() => setLowBalanceOpen(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  )
}
