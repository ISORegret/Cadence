import { Capacitor } from '@capacitor/core'
import { format } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  buildBackup,
  downloadJson,
  parseBackupJson,
  type BackupPayload,
} from '../lib/backup'
import { buildFinanceCsv, downloadCsv } from '../lib/csvExport'
import { PageUndo } from '../components/PageUndo'
import { APP_VERSION, BUILD_TIME_ISO } from '../lib/appMeta'
import type { CadenceNotificationPermissionUi } from '../lib/localNotifs'
import {
  getCadenceNotificationPermissionUi,
  requestLocalNotificationPermission,
  syncBillDueAlertsToDevice,
  syncCalendarRemindersToDevice,
} from '../lib/localNotifs'
import { formatMoney } from '../lib/money'
import type { PayFrequency, PaySettings } from '../types'
import { useFinanceStore } from '../store/financeStore'

const frequencies: { value: PayFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly (one day)' },
  { value: 'twice_monthly', label: 'Twice per month (two days)' },
]

export function SettingsPage() {
  const location = useLocation()
  const paySettings = useFinanceStore((s) => s.paySettings)
  const bills = useFinanceStore((s) => s.bills)
  const envelopes = useFinanceStore((s) => s.envelopes)
  const setPaySettings = useFinanceStore((s) => s.setPaySettings)
  const replaceFromBackup = useFinanceStore((s) => s.replaceFromBackup)
  const setLastExportAt = useFinanceStore((s) => s.setLastExportAt)
  const addEnvelope = useFinanceStore((s) => s.addEnvelope)
  const removeEnvelope = useFinanceStore((s) => s.removeEnvelope)
  const renameEnvelope = useFinanceStore((s) => s.renameEnvelope)
  const incomeLines = useFinanceStore((s) => s.incomeLines)
  const addIncomeLine = useFinanceStore((s) => s.addIncomeLine)
  const updateIncomeLine = useFinanceStore((s) => s.updateIncomeLine)
  const removeIncomeLine = useFinanceStore((s) => s.removeIncomeLine)
  const savingsGoals = useFinanceStore((s) => s.savingsGoals)
  const addSavingsGoal = useFinanceStore((s) => s.addSavingsGoal)
  const updateSavingsGoal = useFinanceStore((s) => s.updateSavingsGoal)
  const removeSavingsGoal = useFinanceStore((s) => s.removeSavingsGoal)
  const envelopeTransfers = useFinanceStore((s) => s.envelopeTransfers)
  const addEnvelopeTransfer = useFinanceStore((s) => s.addEnvelopeTransfer)
  const removeEnvelopeTransfer = useFinanceStore((s) => s.removeEnvelopeTransfer)
  const preferences = useFinanceStore((s) => s.preferences)
  const setPreferences = useFinanceStore((s) => s.setPreferences)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const exportBusyRef = useRef(false)

  const [nativeNotifUi, setNativeNotifUi] = useState<
    'pending' | CadenceNotificationPermissionUi
  >('pending')
  const [exportBusy, setExportBusy] = useState<'json' | 'csv' | null>(null)
  const [exportBanner, setExportBanner] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)
  const exportBannerClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const savingsAccountTransfers = useFinanceStore((s) => s.savingsAccountTransfers)
  const addSavingsAccountTransfer = useFinanceStore((s) => s.addSavingsAccountTransfer)
  const removeSavingsAccountTransfer = useFinanceStore(
    (s) => s.removeSavingsAccountTransfer,
  )

  const [txDate, setTxDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [txAmount, setTxAmount] = useState('')
  const [txDir, setTxDir] = useState<'to_savings' | 'from_savings'>('to_savings')
  const [txNote, setTxNote] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(() => location.hash === '#alerts')

  const showExportBanner = (kind: 'success' | 'error', message: string) => {
    if (exportBannerClearTimer.current) {
      window.clearTimeout(exportBannerClearTimer.current)
      exportBannerClearTimer.current = null
    }
    setExportBanner({ kind, message })
    exportBannerClearTimer.current = window.setTimeout(() => {
      setExportBanner(null)
      exportBannerClearTimer.current = null
    }, 14_000)
  }

  useEffect(
    () => () => {
      if (exportBannerClearTimer.current) {
        window.clearTimeout(exportBannerClearTimer.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (location.hash !== '#alerts') return
    setAdvancedOpen(true)
    const t = window.setTimeout(() => {
      document.getElementById('alerts')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 100)
    return () => window.clearTimeout(t)
  }, [location.hash, location.pathname])

  useEffect(() => {
    if (location.hash !== '#savings-account') return
    setAdvancedOpen(true)
    const timer = window.setTimeout(() => {
      document.getElementById('savings-account')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 100)
    return () => window.clearTimeout(timer)
  }, [location.hash, location.pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    const refresh = () => {
      void getCadenceNotificationPermissionUi()
        .then((ui) => {
          if (!cancelled) setNativeNotifUi(ui)
        })
        .catch(() => {
          if (!cancelled) setNativeNotifUi('prompt')
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

  const [envName, setEnvName] = useState('')

  const defaultAnchor = paySettings?.anchorPayDate ?? new Date().toISOString().slice(0, 10)

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const frequency = fd.get('frequency') as PayFrequency
    const anchorPayDate = String(fd.get('anchorPayDate') || defaultAnchor)
    const monthlyPayDay = fd.get('monthlyPayDay')
      ? Number(fd.get('monthlyPayDay'))
      : undefined
    const d1 = fd.get('twiceFirst') ? Number(fd.get('twiceFirst')) : 1
    const d2 = fd.get('twiceSecond') ? Number(fd.get('twiceSecond')) : 15

    const parseOptNum = (name: string): number | null => {
      const raw = fd.get(name)
      if (raw === null || String(raw).trim() === '') return null
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    }

    const fundsDateRaw = fd.get('startingFundsDate')
    const startingFundsDate =
      fundsDateRaw !== null && String(fundsDateRaw).trim() !== ''
        ? String(fundsDateRaw).trim()
        : null

    const savDateRaw = fd.get('savingsBalanceDate')
    const savingsBalanceDate =
      savDateRaw !== null && String(savDateRaw).trim() !== ''
        ? String(savDateRaw).trim()
        : null

    const next: PaySettings = {
      frequency,
      anchorPayDate,
      monthlyPayDay:
        frequency === 'monthly'
          ? Math.min(31, Math.max(1, monthlyPayDay ?? 1))
          : undefined,
      twiceMonthlyDays:
        frequency === 'twice_monthly'
          ? ([
              Math.min(31, Math.max(1, Math.min(d1, d2))),
              Math.min(31, Math.max(1, Math.max(d1, d2))),
            ] as [number, number])
          : undefined,
      incomePerPaycheck: parseOptNum('incomePerPaycheck'),
      incomeSecondPaycheck: parseOptNum('incomeSecondPaycheck'),
      startingFundsDate,
      startingFundsAmount: parseOptNum('startingFundsAmount'),
      savingsBalanceDate,
      savingsBalanceAmount: parseOptNum('savingsBalanceAmount'),
      currencyCode: String(fd.get('currencyCode') || 'USD').trim() || 'USD',
      locale: String(fd.get('locale') || '').trim() || undefined,
    }
    setPaySettings(next)
    setPreferences({
      bankBalanceAnchorDate: null,
      bankBalanceAnchorAmount: null,
    })
  }

  const onExport = () => {
    void (async () => {
      if (exportBusyRef.current) return
      exportBusyRef.current = true
      setExportBusy('json')
      try {
        const s = useFinanceStore.getState()
        const exportedAt = new Date().toISOString()
        const payload: BackupPayload = buildBackup({
          paySettings: s.paySettings,
          bills: s.bills,
          envelopes: s.envelopes,
          oneOffItems: s.oneOffItems,
          expenseEntries: s.expenseEntries,
          paidOutflowKeys: s.paidOutflowKeys,
          preferences: { ...s.preferences, lastExportAt: exportedAt },
          periodBudgets: s.periodBudgets,
          savingsGoals: s.savingsGoals,
          incomeLines: s.incomeLines,
          envelopeTransfers: s.envelopeTransfers,
          periodNotes: s.periodNotes,
          quickExpenseTemplates: s.quickExpenseTemplates,
          savingsAccountTransfers: s.savingsAccountTransfers,
        })
        const name = `finance-backup-${format(new Date(), 'yyyy-MM-dd')}.json`
        await downloadJson(name, payload)
        setLastExportAt(payload.exportedAt)
        showExportBanner(
          'success',
          Capacitor.getPlatform() === 'android'
            ? `Saved as ${name} where you chose (e.g. Downloads). Copy it to your PC with USB, Google Drive, or email.`
            : Capacitor.isNativePlatform()
              ? `Saved as ${name} on this device.`
              : `Saved as ${name} to your Downloads folder (or your browser’s download location).`,
        )
      } catch (e) {
        console.error(e)
        const detail =
          e instanceof Error ? e.message : String(e)
        showExportBanner('error', detail)
        if (!Capacitor.isNativePlatform()) {
          window.alert(`Could not export backup.\n\n${detail}`)
        }
      } finally {
        exportBusyRef.current = false
        setExportBusy(null)
      }
    })()
  }

  const onExportCsv = () => {
    void (async () => {
      if (exportBusyRef.current) return
      exportBusyRef.current = true
      setExportBusy('csv')
      try {
        const s = useFinanceStore.getState()
        const exportedAt = new Date().toISOString()
        const preset = s.preferences.csvExportPreset ?? 'full'
        const csv = buildFinanceCsv(
          {
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
          },
          preset,
        )
        const name = `finance-export-${format(new Date(), 'yyyy-MM-dd')}.csv`
        await downloadCsv(name, csv)
        setLastExportAt(exportedAt)
        showExportBanner(
          'success',
          Capacitor.getPlatform() === 'android'
            ? `Saved as ${name} where you chose. Same ways to get it to your PC as your JSON backup.`
            : Capacitor.isNativePlatform()
              ? `Saved as ${name} on this device.`
              : `Saved as ${name} to your Downloads folder (or your browser’s download location).`,
        )
      } catch (e) {
        console.error(e)
        const detail =
          e instanceof Error ? e.message : String(e)
        showExportBanner('error', detail)
        if (!Capacitor.isNativePlatform()) {
          window.alert(`Could not export CSV.\n\n${detail}`)
        }
      } finally {
        exportBusyRef.current = false
        setExportBusy(null)
      }
    })()
  }

  const onPickImport = () => fileInputRef.current?.click()

  const onImportFile: React.ChangeEventHandler<HTMLInputElement> = (ev) => {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseBackupJson(text)
      if (!parsed) {
        window.alert(
          'Could not read this file. Use a backup JSON exported from this app.',
        )
        return
      }
      const ok = window.confirm(
        'Replace all data on this device with the backup? This cannot be undone.',
      )
      if (!ok) return
      replaceFromBackup(parsed)
    }
    reader.readAsText(file)
  }

  const incomeDefault =
    typeof paySettings?.incomePerPaycheck === 'number'
      ? String(paySettings.incomePerPaycheck)
      : ''
  const income2Default =
    typeof paySettings?.incomeSecondPaycheck === 'number'
      ? String(paySettings.incomeSecondPaycheck)
      : ''
  const psLegacy = paySettings as (PaySettings & {
    bankBalanceAnchorDate?: string | null
    bankBalanceAnchorAmount?: number | null
    startingBalance?: number | null
  }) | null
  const startingFundsDateDefault =
    paySettings?.startingFundsDate ??
    psLegacy?.bankBalanceAnchorDate ??
    preferences.bankBalanceAnchorDate ??
    ''
  const startingFundsAmountDefault = (() => {
    if (typeof paySettings?.startingFundsAmount === 'number') {
      return String(paySettings.startingFundsAmount)
    }
    if (typeof psLegacy?.bankBalanceAnchorAmount === 'number') {
      return String(psLegacy.bankBalanceAnchorAmount)
    }
    if (typeof preferences.bankBalanceAnchorAmount === 'number') {
      return String(preferences.bankBalanceAnchorAmount)
    }
    if (typeof psLegacy?.startingBalance === 'number') {
      return String(psLegacy.startingBalance)
    }
    return ''
  })()

  const savingsBalanceDateDefault = paySettings?.savingsBalanceDate ?? ''
  const savingsBalanceAmountDefault =
    typeof paySettings?.savingsBalanceAmount === 'number'
      ? String(paySettings.savingsBalanceAmount)
      : ''

  const tw = paySettings?.frequency === 'twice_monthly'

  return (
    <div className="space-y-10 text-left">
      <div>
        <p className="section-label">Settings</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
          Pay schedule & money
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Payday rhythm, take-home, and display. Currency is used everywhere
          amounts appear.
        </p>
      </div>

      <form
        key={[
          paySettings?.anchorPayDate,
          paySettings?.frequency,
          String(paySettings?.incomePerPaycheck ?? ''),
          paySettings?.startingFundsDate ?? '',
          String(paySettings?.startingFundsAmount ?? ''),
          paySettings?.savingsBalanceDate ?? '',
          String(paySettings?.savingsBalanceAmount ?? ''),
          bills.map((b) => b.id).join(','),
        ].join('|')}
        onSubmit={onSubmit}
        className="card space-y-5"
      >
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 pb-3 dark:border-white/10">
          <PageUndo />
        </div>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            How often are you paid?
          </span>
          <select
            name="frequency"
            defaultValue={paySettings?.frequency ?? 'biweekly'}
            className="select-field mt-1 w-full"
          >
            {frequencies.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Anchor payday (yyyy-mm-dd)
          </span>
          <input
            type="date"
            name="anchorPayDate"
            required
            defaultValue={defaultAnchor}
            className="input-field mt-1 w-full"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Take-home (primary payday)
            </span>
            <input
              type="number"
              name="incomePerPaycheck"
              min={0}
              step="0.01"
              placeholder="Optional"
              defaultValue={incomeDefault}
              className="input-field mt-1 w-full"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Take-home (second payday)
            </span>
            <input
              type="number"
              name="incomeSecondPaycheck"
              min={0}
              step="0.01"
              placeholder={tw ? 'If different from primary' : 'Twice monthly only'}
              defaultValue={income2Default}
              disabled={!tw}
              className="input-field mt-1 w-full disabled:opacity-50"
            />
          </label>
        </div>

        <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/25">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Starting funds (optional)
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            The date is usually today; the amount is what is actually in your checking account at the{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">end of that day</span>. Summary
            and Upcoming both use this as the baseline, then apply paychecks and scheduled withdrawals after
            that date — not a separate “period start” balance.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                As-of date
              </span>
              <input
                type="date"
                name="startingFundsDate"
                defaultValue={startingFundsDateDefault}
                className="input-field mt-1 w-full"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Amount in account
              </span>
              <input
                type="number"
                name="startingFundsAmount"
                step="0.01"
                placeholder="e.g. 62.83"
                defaultValue={startingFundsAmountDefault}
                className="input-field mt-1 w-full"
              />
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Currency (ISO 4217)
            </span>
            <input
              name="currencyCode"
              defaultValue={paySettings?.currencyCode ?? 'USD'}
              placeholder="USD"
              className="input-field mt-1 w-full"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Locale (optional)
            </span>
            <input
              name="locale"
              defaultValue={paySettings?.locale ?? ''}
              placeholder="e.g. en-US — blank = browser"
              className="input-field mt-1 w-full"
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Preview: {formatMoney(1234.56, paySettings)}
        </p>

        <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/5 dark:bg-white/[0.04]">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Monthly options
          </p>
          <label className="mt-2 block">
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Day of month you are paid (monthly only)
            </span>
            <input
              type="number"
              name="monthlyPayDay"
              min={1}
              max={31}
              defaultValue={paySettings?.monthlyPayDay ?? 1}
              className="input-field mt-1 w-full"
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Twice / 1st day
              </span>
              <input
                type="number"
                name="twiceFirst"
                min={1}
                max={31}
                defaultValue={paySettings?.twiceMonthlyDays?.[0] ?? 1}
                className="input-field mt-1 w-full"
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Twice / 2nd day
              </span>
              <input
                type="number"
                name="twiceSecond"
                min={1}
                max={31}
                defaultValue={paySettings?.twiceMonthlyDays?.[1] ?? 15}
                className="input-field mt-1 w-full"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-violet-200/70 bg-violet-50/50 p-4 dark:border-violet-900/40 dark:bg-violet-950/25">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Savings account (optional)
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Balance at the <span className="font-medium">end of the as-of day</span>. Log transfers in the
            next card — money moved to savings reduces your projected checking balance.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Savings — as-of date
              </span>
              <input
                type="date"
                name="savingsBalanceDate"
                defaultValue={savingsBalanceDateDefault}
                className="input-field mt-1 w-full"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Savings — balance
              </span>
              <input
                type="number"
                name="savingsBalanceAmount"
                step="0.01"
                placeholder="Optional"
                defaultValue={savingsBalanceAmountDefault}
                className="input-field mt-1 w-full"
              />
            </label>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full sm:w-auto">
          Save
        </button>
      </form>

      <details className="card" open={advancedOpen}>
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                Advanced setup
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Optional tools for envelopes, transfers, goals, and extra income.
              </p>
            </div>
            <button
              type="button"
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              onClick={(e) => {
                e.preventDefault()
                setAdvancedOpen((v) => !v)
              }}
            >
              {advancedOpen ? 'Hide' : 'Show'}
            </button>
          </div>
        </summary>

        <div className="mt-4 space-y-10">
          <div id="savings-account" className="card scroll-mt-20">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Checking ↔ savings transfers
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">To savings</span> moves cash out
              of checking; <span className="font-medium text-slate-700 dark:text-slate-300">From savings</span>{' '}
              moves it back. Set your savings baseline in the pay schedule form above.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Date
                <input
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className="input-field !py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Amount
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="0"
                  className="input-field w-28 !py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Direction
                <select
                  value={txDir}
                  onChange={(e) =>
                    setTxDir(e.target.value as 'to_savings' | 'from_savings')
                  }
                  className="select-field !py-2 text-sm"
                >
                  <option value="to_savings">To savings</option>
                  <option value="from_savings">From savings</option>
                </select>
              </label>
              <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Note (optional)
                <input
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                  className="input-field !py-2 text-sm"
                />
              </label>
              <button
                type="button"
                className="btn-solid self-end"
                onClick={() => {
                  const amt = Number(txAmount)
                  if (!txDate.trim() || !Number.isFinite(amt) || amt <= 0) return
                  addSavingsAccountTransfer({
                    date: txDate.trim(),
                    amount: amt,
                    direction: txDir,
                    note: txNote.trim() || undefined,
                  })
                  setTxAmount('')
                  setTxNote('')
                }}
              >
                Add transfer
              </button>
            </div>
            {savingsAccountTransfers.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No transfers yet.</p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {[...savingsAccountTransfers]
                  .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
                  .map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                    >
                      <span className="text-slate-700 dark:text-slate-300">
                        {t.date}{' '}
                        <span className="font-medium">
                          {t.direction === 'to_savings' ? '→ Savings' : '← From savings'}
                        </span>
                        {t.note ? (
                          <span className="text-slate-500"> — {t.note}</span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        {formatMoney(t.amount, paySettings)}
                        <button
                          type="button"
                          className="text-xs text-red-600 dark:text-red-400"
                          onClick={() => removeSavingsAccountTransfer(t.id)}
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Envelopes
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Optional groups for bills (e.g. “Fixed”, “Fun”). Filter on Summary.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={envName}
                onChange={(e) => setEnvName(e.target.value)}
                placeholder="New envelope name"
                className="input-field min-w-[12rem] flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  if (!envName.trim()) return
                  addEnvelope(envName)
                  setEnvName('')
                }}
                className="btn-solid"
              >
                Add
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {envelopes.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                >
                  <input
                    defaultValue={e.name}
                    onBlur={(ev) => renameEnvelope(e.id, ev.target.value)}
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-slate-300 dark:hover:border-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => removeEnvelope(e.id)}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Extra income (side gigs)
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Added to take-home on Summary for this pay period (all lines summed).
            </p>
            <form
              className="mt-4 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const label = String(fd.get('ilLabel') || '').trim()
                const amount = Number(fd.get('ilAmount'))
                if (!label || Number.isNaN(amount) || amount < 0) return
                addIncomeLine({ label, amount })
                e.currentTarget.reset()
              }}
            >
              <input
                name="ilLabel"
                placeholder="Label"
                className="input-field min-w-[8rem] flex-1"
              />
              <input
                name="ilAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder="Amount"
                className="input-field w-28"
              />
              <button
                type="submit"
                className="btn-solid !py-1.5 text-sm"
              >
                Add
              </button>
            </form>
            <ul className="mt-4 space-y-2">
              {incomeLines.map((line) => (
                <li
                  key={line.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                >
                  <input
                    defaultValue={line.label}
                    onBlur={(ev) =>
                      updateIncomeLine(line.id, { label: ev.target.value.trim() })
                    }
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-slate-300 dark:hover:border-slate-600"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={line.amount}
                    onBlur={(ev) => {
                      const n = Number(ev.target.value)
                      if (!Number.isNaN(n) && n >= 0)
                        updateIncomeLine(line.id, { amount: n })
                    }}
                    className="w-28 rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => removeIncomeLine(line.id)}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Savings goals
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Track progress manually — not linked to envelopes or bills.
            </p>
            <form
              className="mt-4 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const name = String(fd.get('sgName') || '').trim()
                const targetAmount = Number(fd.get('sgTarget'))
                const savedAmount = Number(fd.get('sgSaved') || '0')
                if (!name || Number.isNaN(targetAmount) || targetAmount < 0) return
                addSavingsGoal({
                  name,
                  targetAmount,
                  savedAmount: Number.isNaN(savedAmount) ? 0 : Math.max(0, savedAmount),
                })
                e.currentTarget.reset()
              }}
            >
              <input
                name="sgName"
                placeholder="Goal name"
                className="input-field min-w-[8rem] flex-1"
              />
              <input
                name="sgTarget"
                type="number"
                step="0.01"
                min="0"
                placeholder="Target"
                className="input-field w-24"
              />
              <input
                name="sgSaved"
                type="number"
                step="0.01"
                min="0"
                placeholder="Saved"
                className="input-field w-24"
              />
              <button
                type="submit"
                className="btn-solid !py-1.5 text-sm"
              >
                Add
              </button>
            </form>
            <ul className="mt-4 space-y-3">
              {savingsGoals.map((g) => {
                const pct =
                  g.targetAmount > 0
                    ? Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100))
                    : 0
                return (
                  <li
                    key={g.id}
                    className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        defaultValue={g.name}
                        onBlur={(ev) =>
                          updateSavingsGoal(g.id, { name: ev.target.value.trim() })
                        }
                        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium hover:border-slate-300 dark:hover:border-slate-600"
                      />
                      <button
                        type="button"
                        onClick={() => removeSavingsGoal(g.id)}
                        className="text-xs text-red-600 dark:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-slate-500">
                        Target
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={g.targetAmount}
                          onBlur={(ev) => {
                            const n = Number(ev.target.value)
                            if (!Number.isNaN(n) && n >= 0)
                              updateSavingsGoal(g.id, { targetAmount: n })
                          }}
                          className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        Saved
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={g.savedAmount}
                          onBlur={(ev) => {
                            const n = Number(ev.target.value)
                            if (!Number.isNaN(n) && n >= 0)
                              updateSavingsGoal(g.id, { savedAmount: n })
                          }}
                          className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-950"
                        />
                      </label>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{pct}% of target</p>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="card">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Envelope transfers (record-only)
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Log moves between envelopes — does not change bill or expense math.
            </p>
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const date = String(fd.get('etDate') || '')
                const amount = Number(fd.get('etAmount'))
                const fromEnvelopeId = String(fd.get('etFrom') || '')
                const toEnvelopeId = String(fd.get('etTo') || '')
                const note = String(fd.get('etNote') || '').trim()
                if (
                  !date ||
                  Number.isNaN(amount) ||
                  amount <= 0 ||
                  !fromEnvelopeId ||
                  !toEnvelopeId ||
                  fromEnvelopeId === toEnvelopeId
                )
                  return
                addEnvelopeTransfer({
                  date,
                  amount,
                  fromEnvelopeId,
                  toEnvelopeId,
                  note: note || undefined,
                })
                e.currentTarget.reset()
              }}
            >
              <input
                name="etDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="input-field"
              />
              <input
                name="etAmount"
                type="number"
                step="0.01"
                min="0"
                placeholder="Amount"
                className="input-field w-28"
              />
              <select
                name="etFrom"
                className="select-field min-w-[8rem] !py-1.5 text-sm"
              >
                <option value="">From envelope</option>
                {envelopes.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
              <select
                name="etTo"
                className="select-field min-w-[8rem] !py-1.5 text-sm"
              >
                <option value="">To envelope</option>
                {envelopes.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
              <input
                name="etNote"
                placeholder="Note (optional)"
                className="input-field min-w-[8rem] flex-1"
              />
              <button
                type="submit"
                className="btn-solid !py-1.5 text-sm"
              >
                Record
              </button>
            </form>
            <ul className="mt-4 space-y-2 text-sm">
              {envelopeTransfers
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((t) => {
                  const fromN = envelopes.find((e) => e.id === t.fromEnvelopeId)?.name
                  const toN = envelopes.find((e) => e.id === t.toEnvelopeId)?.name
                  return (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800"
                    >
                      <span className="text-slate-600 dark:text-slate-400">
                        {t.date}: {fromN ?? '?'} → {toN ?? '?'}
                        {t.note ? ` — ${t.note}` : ''}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{formatMoney(t.amount, paySettings)}</span>
                        <button
                          type="button"
                          onClick={() => removeEnvelopeTransfer(t.id)}
                          className="text-xs text-red-600 dark:text-red-400"
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  )
                })}
            </ul>
          </div>
        </div>
      </details>

      <div className="card">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Planning &amp; Summary
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          “Safe to spend” on Summary subtracts this cushion from your projected balance at the
          end of the current pay period (after scheduled items).
        </p>
        <label className="mt-4 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Safe-to-spend cushion (same currency as above)
          <input
            type="number"
            step="0.01"
            min="0"
            value={
              preferences.safeSpendBufferAmount === null ||
              preferences.safeSpendBufferAmount === undefined
                ? ''
                : preferences.safeSpendBufferAmount
            }
            onChange={(e) => {
              const raw = e.target.value.trim()
              setPreferences({
                safeSpendBufferAmount: raw === '' ? null : Number(raw) || null,
              })
            }}
            className="input-field mt-1 max-w-xs"
            placeholder="0 = no cushion"
          />
        </label>
        <label className="mt-4 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Default Summary view
          <select
            value={preferences.summaryViewMode ?? 'pay_period'}
            onChange={(e) =>
              setPreferences({
                summaryViewMode: e.target.value as 'pay_period' | 'calendar_month',
              })
            }
            className="select-field mt-1 max-w-xs"
          >
            <option value="pay_period">Pay period (paycheck to paycheck)</option>
            <option value="calendar_month">Calendar month</option>
          </select>
        </label>
      </div>

      <div id="alerts" className="card scroll-mt-28">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Alerts & reminders
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Low-balance alerts use the same projected running balance as the Summary
          table (starting balance + this period&apos;s income, then each withdrawal
          in date order). Bill-due alerts use your bill schedules for the next few
          months. Custom date-time reminders are on the{' '}
          <Link to="/calendar" className="link-accent">
            Calendar
          </Link>{' '}
          page.
        </p>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={preferences.billDueAlertsEnabled === true}
            onChange={(e) =>
              setPreferences({ billDueAlertsEnabled: e.target.checked })
            }
            className="rounded border-slate-300 dark:border-slate-600"
          />
          Notify before scheduled bills (phone app — same permission as other alerts)
        </label>
        <label className="mt-3 block text-xs font-medium text-slate-500 dark:text-slate-400">
          How many days before each due date (9:00 local)
          <select
            value={
              typeof preferences.billDueAlertDaysBefore === 'number'
                ? preferences.billDueAlertDaysBefore
                : 1
            }
            onChange={(e) =>
              setPreferences({
                billDueAlertDaysBefore: Number(e.target.value),
              })
            }
            disabled={preferences.billDueAlertsEnabled !== true}
            className="input-field mt-1 max-w-xs disabled:opacity-50"
          >
            <option value={0}>Same day as due date</option>
            <option value={1}>1 day before</option>
            <option value={2}>2 days before</option>
            <option value={3}>3 days before</option>
            <option value={7}>1 week before</option>
          </select>
        </label>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={preferences.lowBalanceAlertEnabled === true}
            onChange={(e) =>
              setPreferences({ lowBalanceAlertEnabled: e.target.checked })
            }
            className="rounded border-slate-300 dark:border-slate-600"
          />
          Notify when projected balance goes below a threshold (in-app dialog; also
          a daily system notification on the web or phone app if permission is
          granted)
        </label>
        <label className="mt-3 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Threshold (account currency)
          <input
            type="number"
            step="0.01"
            value={
              preferences.lowBalanceThreshold === null ||
              preferences.lowBalanceThreshold === undefined
                ? ''
                : preferences.lowBalanceThreshold
            }
            onChange={(e) => {
              const raw = e.target.value.trim()
              setPreferences({
                lowBalanceThreshold:
                  raw === '' ? null : Number(raw) || null,
              })
            }}
            className="input-field mt-1 max-w-xs"
            placeholder="e.g. 100"
          />
        </label>
        {Capacitor.isNativePlatform() &&
        nativeNotifUi !== 'pending' &&
        nativeNotifUi !== 'granted' ? (
          <button
            type="button"
            className="btn-secondary mt-4 text-sm"
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
                  setNativeNotifUi(await getCadenceNotificationPermissionUi())
                }
              })()
            }}
          >
            Allow system notifications (bills + reminders + low balance)
          </button>
        ) : null}
      </div>

      <div className="card">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
          Backup & restore
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Your budget data already saves on this device as you use the app. Export
          downloads a file you keep (Google Drive, email, computer). There is no
          separate cloud backup until you export. JSON includes everything (restore
          with Import). CSV is for spreadsheets only.
        </p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          On Android, export opens a system screen so you can save the file to Downloads,
          Drive, or another folder — then copy it to your PC. In a desktop browser, export
          downloads normally.
        </p>
        {exportBanner ? (
          <div
            role="status"
            className={
              exportBanner.kind === 'success'
                ? 'mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left text-sm text-emerald-950 dark:border-emerald-800/80 dark:bg-emerald-950/50 dark:text-emerald-50'
                : 'mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-left text-sm text-red-950 dark:border-red-900/70 dark:bg-red-950/45 dark:text-red-50'
            }
          >
            <p className="font-semibold">
              {exportBanner.kind === 'success' ? 'Export finished' : 'Export failed'}
            </p>
            <p className="mt-1 text-xs leading-relaxed opacity-95">
              {exportBanner.message}
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-slate-600 underline dark:text-slate-300"
              onClick={() => {
                if (exportBannerClearTimer.current) {
                  window.clearTimeout(exportBannerClearTimer.current)
                  exportBannerClearTimer.current = null
                }
                setExportBanner(null)
              }}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <label className="mt-4 block max-w-md text-xs font-medium text-slate-600 dark:text-slate-400">
          CSV spreadsheet columns
          <select
            value={preferences.csvExportPreset ?? 'full'}
            onChange={(e) =>
              setPreferences({
                csvExportPreset: e.target.value as 'full' | 'minimal',
              })
            }
            className="select-field mt-1 w-full max-w-xs text-sm"
          >
            <option value="full">Full — budgets, goals, transfers, notes, templates</option>
            <option value="minimal">
              Minimal — pay settings, bills, one-offs, expenses, income, envelopes
            </option>
          </select>
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onExport}
            disabled={exportBusy !== null}
            className="btn-secondary px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {exportBusy === 'json' ? 'Exporting…' : 'Export backup'}
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={exportBusy !== null}
            className="btn-secondary px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {exportBusy === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            type="button"
            onClick={onPickImport}
            className="btn-secondary px-4 py-2 text-sm font-semibold"
          >
            Import backup…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onImportFile}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {bills.length} bill{bills.length === 1 ? '' : 's'} — export often.
        </p>
      </div>

      <p className="text-center text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
        App v{APP_VERSION} · Built{' '}
        {new Date(BUILD_TIME_ISO).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </p>
    </div>
  )
}
