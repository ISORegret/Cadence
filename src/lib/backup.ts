import type {
  AppPreferences,
  Bill,
  Envelope,
  EnvelopeTransfer,
  ExpenseEntry,
  IncomeLine,
  OneOffItem,
  PayFrequency,
  PaySettings,
  PeriodBudgetRow,
  CalendarReminder,
  PeriodNote,
  QuickExpenseTemplate,
  SavingsAccountTransfer,
  SavingsGoal,
} from '../types'
import { Capacitor } from '@capacitor/core'
import { downloadBlob, exportJsonBackupNative } from './downloadBlob'

export const BACKUP_VERSION = 6 as const
export const BACKUP_VERSION_V5 = 5 as const
export const BACKUP_VERSION_V4 = 4 as const
export const BACKUP_VERSION_V3 = 3 as const
export const BACKUP_VERSION_LEGACY = 1 as const
export const BACKUP_VERSION_V2 = 2 as const

export interface BackupPayload {
  version: typeof BACKUP_VERSION
  exportedAt: string
  paySettings: PaySettings | null
  bills: Bill[]
  envelopes: Envelope[]
  oneOffItems: OneOffItem[]
  expenseEntries: ExpenseEntry[]
  paidOutflowKeys: string[]
  preferences: AppPreferences
  periodBudgets: PeriodBudgetRow[]
  savingsGoals: SavingsGoal[]
  incomeLines: IncomeLine[]
  envelopeTransfers: EnvelopeTransfer[]
  periodNotes: PeriodNote[]
  quickExpenseTemplates: QuickExpenseTemplate[]
  savingsAccountTransfers: SavingsAccountTransfer[]
}

export interface ParsedBackup {
  paySettings: PaySettings | null
  bills: Bill[]
  envelopes: Envelope[]
  oneOffItems: OneOffItem[]
  expenseEntries: ExpenseEntry[]
  paidOutflowKeys: string[]
  preferences: AppPreferences
  periodBudgets: PeriodBudgetRow[]
  savingsGoals: SavingsGoal[]
  incomeLines: IncomeLine[]
  envelopeTransfers: EnvelopeTransfer[]
  periodNotes: PeriodNote[]
  quickExpenseTemplates: QuickExpenseTemplate[]
  savingsAccountTransfers: SavingsAccountTransfer[]
}

function defaultPrefs(): AppPreferences {
  return {
    theme: 'system',
    lastExportAt: null,
    calendarReminders: [],
    lowBalanceAlertEnabled: false,
    lowBalanceThreshold: null,
    lastLowBalanceAlertDay: null,
    billDueAlertsEnabled: false,
    billDueAlertDaysBefore: 1,
  }
}

function isCalendarReminder(x: unknown): x is CalendarReminder {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.title === 'string' &&
    typeof r.body === 'string' &&
    typeof r.remindAt === 'string' &&
    (r.snoozedUntil === null ||
      r.snoozedUntil === undefined ||
      typeof r.snoozedUntil === 'string')
  )
}

function isPayFrequency(x: unknown): x is PayFrequency {
  return (
    x === 'weekly' ||
    x === 'biweekly' ||
    x === 'monthly' ||
    x === 'twice_monthly'
  )
}

function isBillSchedule(x: unknown): boolean {
  if (!x || typeof x !== 'object' || !('kind' in x)) return false
  const o = x as Record<string, unknown>
  const k = o.kind
  if (k === 'once') return typeof o.date === 'string'
  if (k === 'monthly') return typeof o.dayOfMonth === 'number'
  if (k === 'weekly') return typeof o.dayOfWeek === 'number'
  if (k === 'biweekly') return typeof o.anchorDate === 'string'
  return false
}

function isBillRecurrence(x: unknown): boolean {
  if (x === undefined || x === null) return true
  if (!x || typeof x !== 'object' || !('kind' in x)) return false
  const o = x as Record<string, unknown>
  if (o.kind === 'continuous') return true
  if (o.kind === 'endsAfterPayments') {
    return (
      typeof o.count === 'number' &&
      o.count >= 1 &&
      Number.isFinite(o.count) &&
      typeof o.seriesStart === 'string'
    )
  }
  if (o.kind === 'endsOn') return typeof o.lastPaymentDate === 'string'
  return false
}

function isBill(x: unknown): x is Bill {
  if (!x || typeof x !== 'object') return false
  const b = x as Record<string, unknown>
  if (
    typeof b.id !== 'string' ||
    typeof b.name !== 'string' ||
    typeof b.amount !== 'number' ||
    !isBillSchedule(b.schedule)
  ) {
    return false
  }
  if ('recurrence' in b && b.recurrence !== undefined && !isBillRecurrence(b.recurrence)) {
    return false
  }
  if (b.note !== undefined && typeof b.note !== 'string') return false
  if (b.category !== undefined && typeof b.category !== 'string') return false
  if (b.envelopeId !== undefined && typeof b.envelopeId !== 'string') return false
  if (
    b.confidence !== undefined &&
    b.confidence !== 'estimate' &&
    b.confidence !== 'confirmed'
  ) {
    return false
  }
  return true
}

function isPaySettings(x: unknown): x is PaySettings {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  if (!isPayFrequency(p.frequency)) return false
  if (typeof p.anchorPayDate !== 'string') return false
  if (p.monthlyPayDay !== undefined && typeof p.monthlyPayDay !== 'number')
    return false
  if (p.currencyCode !== undefined && typeof p.currencyCode !== 'string')
    return false
  if (p.locale !== undefined && typeof p.locale !== 'string') return false
  if (
    p.incomePerPaycheck !== undefined &&
    p.incomePerPaycheck !== null &&
    (typeof p.incomePerPaycheck !== 'number' ||
      Number.isNaN(p.incomePerPaycheck))
  ) {
    return false
  }
  if (
    p.incomeSecondPaycheck !== undefined &&
    p.incomeSecondPaycheck !== null &&
    (typeof p.incomeSecondPaycheck !== 'number' ||
      Number.isNaN(p.incomeSecondPaycheck))
  ) {
    return false
  }
  if (
    p.startingBalance !== undefined &&
    p.startingBalance !== null &&
    (typeof p.startingBalance !== 'number' || Number.isNaN(p.startingBalance))
  ) {
    return false
  }
  if (p.twiceMonthlyDays !== undefined) {
    const t = p.twiceMonthlyDays
    if (!Array.isArray(t) || t.length !== 2) return false
    if (typeof t[0] !== 'number' || typeof t[1] !== 'number') return false
  }
  if (
    p.bankBalanceAnchorDate !== undefined &&
    p.bankBalanceAnchorDate !== null &&
    typeof p.bankBalanceAnchorDate !== 'string'
  ) {
    return false
  }
  if (
    p.bankBalanceAnchorAmount !== undefined &&
    p.bankBalanceAnchorAmount !== null &&
    (typeof p.bankBalanceAnchorAmount !== 'number' ||
      Number.isNaN(p.bankBalanceAnchorAmount))
  ) {
    return false
  }
  if (
    p.startingFundsDate !== undefined &&
    p.startingFundsDate !== null &&
    typeof p.startingFundsDate !== 'string'
  ) {
    return false
  }
  if (
    p.startingFundsAmount !== undefined &&
    p.startingFundsAmount !== null &&
    (typeof p.startingFundsAmount !== 'number' ||
      Number.isNaN(p.startingFundsAmount))
  ) {
    return false
  }
  if (
    p.savingsBalanceDate !== undefined &&
    p.savingsBalanceDate !== null &&
    typeof p.savingsBalanceDate !== 'string'
  ) {
    return false
  }
  if (
    p.savingsBalanceAmount !== undefined &&
    p.savingsBalanceAmount !== null &&
    (typeof p.savingsBalanceAmount !== 'number' ||
      Number.isNaN(p.savingsBalanceAmount))
  ) {
    return false
  }
  return true
}

function isSavingsAccountTransfer(x: unknown): x is SavingsAccountTransfer {
  if (!x || typeof x !== 'object') return false
  const t = x as Record<string, unknown>
  if (typeof t.id !== 'string') return false
  if (typeof t.date !== 'string') return false
  if (typeof t.amount !== 'number' || Number.isNaN(t.amount) || t.amount <= 0)
    return false
  if (t.direction !== 'to_savings' && t.direction !== 'from_savings') return false
  if (t.note !== undefined && typeof t.note !== 'string') return false
  return true
}

function isEnvelope(x: unknown): x is Envelope {
  if (!x || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  return typeof e.id === 'string' && typeof e.name === 'string'
}

function isOneOffItem(x: unknown): x is OneOffItem {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (
    typeof o.id !== 'string' ||
    typeof o.name !== 'string' ||
    typeof o.amount !== 'number' ||
    typeof o.date !== 'string'
  ) {
    return false
  }
  if (o.note !== undefined && typeof o.note !== 'string') return false
  if (o.category !== undefined && typeof o.category !== 'string') return false
  if (o.envelopeId !== undefined && typeof o.envelopeId !== 'string')
    return false
  return true
}

function isExpenseEntry(x: unknown): x is ExpenseEntry {
  if (!x || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  if (
    typeof e.id !== 'string' ||
    typeof e.date !== 'string' ||
    typeof e.amount !== 'number' ||
    Number.isNaN(e.amount)
  ) {
    return false
  }
  if (e.note !== undefined && typeof e.note !== 'string') return false
  if (e.category !== undefined && typeof e.category !== 'string') return false
  if (e.envelopeId !== undefined && typeof e.envelopeId !== 'string')
    return false
  return true
}

function isIncomeLine(x: unknown): x is IncomeLine {
  if (!x || typeof x !== 'object') return false
  const i = x as Record<string, unknown>
  return (
    typeof i.id === 'string' &&
    typeof i.label === 'string' &&
    typeof i.amount === 'number' &&
    !Number.isNaN(i.amount)
  )
}

function isPeriodBudgetRow(x: unknown): x is PeriodBudgetRow {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  if (r.targetType !== 'category' && r.targetType !== 'envelope') return false
  return (
    typeof r.id === 'string' &&
    typeof r.periodStart === 'string' &&
    typeof r.periodEndExclusive === 'string' &&
    typeof r.targetKey === 'string' &&
    typeof r.budgeted === 'number' &&
    !Number.isNaN(r.budgeted)
  )
}

function isSavingsGoal(x: unknown): x is SavingsGoal {
  if (!x || typeof x !== 'object') return false
  const g = x as Record<string, unknown>
  if (
    typeof g.id !== 'string' ||
    typeof g.name !== 'string' ||
    typeof g.targetAmount !== 'number' ||
    typeof g.savedAmount !== 'number'
  ) {
    return false
  }
  if (g.targetDate !== undefined && typeof g.targetDate !== 'string')
    return false
  return true
}

function isEnvelopeTransfer(x: unknown): x is EnvelopeTransfer {
  if (!x || typeof x !== 'object') return false
  const t = x as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    typeof t.date === 'string' &&
    typeof t.amount === 'number' &&
    !Number.isNaN(t.amount) &&
    typeof t.fromEnvelopeId === 'string' &&
    typeof t.toEnvelopeId === 'string' &&
    (t.note === undefined || typeof t.note === 'string')
  )
}

function isAppPreferences(x: unknown): x is AppPreferences {
  if (!x || typeof x !== 'object') return false
  const p = x as Record<string, unknown>
  if (p.theme !== 'system' && p.theme !== 'light' && p.theme !== 'dark')
    return false
  if (
    p.lastExportAt !== undefined &&
    p.lastExportAt !== null &&
    typeof p.lastExportAt !== 'string'
  ) {
    return false
  }
  if (
    p.welcomeDismissedAt !== undefined &&
    p.welcomeDismissedAt !== null &&
    typeof p.welcomeDismissedAt !== 'string'
  ) {
    return false
  }
  if (
    p.lowBalanceAlertEnabled !== undefined &&
    typeof p.lowBalanceAlertEnabled !== 'boolean'
  ) {
    return false
  }
  if (
    p.lowBalanceThreshold !== undefined &&
    p.lowBalanceThreshold !== null &&
    (typeof p.lowBalanceThreshold !== 'number' ||
      Number.isNaN(p.lowBalanceThreshold))
  ) {
    return false
  }
  if (
    p.lastLowBalanceAlertDay !== undefined &&
    p.lastLowBalanceAlertDay !== null &&
    typeof p.lastLowBalanceAlertDay !== 'string'
  ) {
    return false
  }
  if (
    p.billDueAlertsEnabled !== undefined &&
    typeof p.billDueAlertsEnabled !== 'boolean'
  ) {
    return false
  }
  if (
    p.billDueAlertDaysBefore !== undefined &&
    p.billDueAlertDaysBefore !== null &&
    (typeof p.billDueAlertDaysBefore !== 'number' ||
      Number.isNaN(p.billDueAlertDaysBefore) ||
      !Number.isFinite(p.billDueAlertDaysBefore))
  ) {
    return false
  }
  if (p.calendarReminders !== undefined) {
    if (!Array.isArray(p.calendarReminders)) return false
    if (!p.calendarReminders.every(isCalendarReminder)) return false
  }
  if (
    p.bankBalanceAnchorDate !== undefined &&
    p.bankBalanceAnchorDate !== null &&
    typeof p.bankBalanceAnchorDate !== 'string'
  ) {
    return false
  }
  if (
    p.bankBalanceAnchorAmount !== undefined &&
    p.bankBalanceAnchorAmount !== null &&
    (typeof p.bankBalanceAnchorAmount !== 'number' ||
      Number.isNaN(p.bankBalanceAnchorAmount))
  ) {
    return false
  }
  if (
    p.safeSpendBufferAmount !== undefined &&
    p.safeSpendBufferAmount !== null &&
    (typeof p.safeSpendBufferAmount !== 'number' ||
      Number.isNaN(p.safeSpendBufferAmount))
  ) {
    return false
  }
  if (
    p.summaryViewMode !== undefined &&
    p.summaryViewMode !== 'pay_period' &&
    p.summaryViewMode !== 'calendar_month'
  ) {
    return false
  }
  return true
}

function isPeriodNote(x: unknown): x is PeriodNote {
  if (!x || typeof x !== 'object') return false
  const n = x as Record<string, unknown>
  return (
    typeof n.id === 'string' &&
    typeof n.periodStart === 'string' &&
    typeof n.periodEndExclusive === 'string' &&
    typeof n.body === 'string'
  )
}

function isQuickExpenseTemplate(x: unknown): x is QuickExpenseTemplate {
  if (!x || typeof x !== 'object') return false
  const t = x as Record<string, unknown>
  if (
    typeof t.id !== 'string' ||
    typeof t.label !== 'string' ||
    typeof t.amount !== 'number' ||
    Number.isNaN(t.amount)
  ) {
    return false
  }
  if (t.category !== undefined && typeof t.category !== 'string') return false
  if (t.envelopeId !== undefined && typeof t.envelopeId !== 'string')
    return false
  return true
}

export function parseBackupJson(text: string): ParsedBackup | null {
  let data: unknown
  try {
    data = JSON.parse(text) as unknown
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  if (typeof o.exportedAt !== 'string') return null
  if (o.paySettings !== null && !isPaySettings(o.paySettings)) return null
  if (!Array.isArray(o.bills) || !o.bills.every(isBill)) return null

  const ver = o.version

  if (ver === BACKUP_VERSION_LEGACY) {
    return {
      paySettings: o.paySettings as PaySettings | null,
      bills: o.bills as Bill[],
      envelopes: [],
      oneOffItems: [],
      expenseEntries: [],
      paidOutflowKeys: [],
      preferences: defaultPrefs(),
      periodBudgets: [],
      savingsGoals: [],
      incomeLines: [],
      envelopeTransfers: [],
      periodNotes: [],
      quickExpenseTemplates: [],
      savingsAccountTransfers: [],
    }
  }

  if (ver === BACKUP_VERSION_V2) {
    if (!Array.isArray(o.envelopes) || !o.envelopes.every(isEnvelope)) {
      return null
    }
    if (!Array.isArray(o.oneOffItems) || !o.oneOffItems.every(isOneOffItem)) {
      return null
    }
    if (!Array.isArray(o.paidOutflowKeys)) return null
    if (
      !(o.paidOutflowKeys as unknown[]).every((k) => typeof k === 'string')
    ) {
      return null
    }
    if (!isAppPreferences(o.preferences)) return null

    return {
      paySettings: o.paySettings as PaySettings | null,
      bills: o.bills as Bill[],
      envelopes: o.envelopes as Envelope[],
      oneOffItems: o.oneOffItems as OneOffItem[],
      expenseEntries: [],
      paidOutflowKeys: o.paidOutflowKeys as string[],
      preferences: o.preferences as AppPreferences,
      periodBudgets: [],
      savingsGoals: [],
      incomeLines: [],
      envelopeTransfers: [],
      periodNotes: [],
      quickExpenseTemplates: [],
      savingsAccountTransfers: [],
    }
  }

  if (
    ver === BACKUP_VERSION_V3 ||
    ver === BACKUP_VERSION_V4 ||
    ver === BACKUP_VERSION_V5 ||
    ver === BACKUP_VERSION
  ) {
    if (!Array.isArray(o.envelopes) || !o.envelopes.every(isEnvelope)) {
      return null
    }
    if (!Array.isArray(o.oneOffItems) || !o.oneOffItems.every(isOneOffItem)) {
      return null
    }
    if (!Array.isArray(o.paidOutflowKeys)) return null
    if (
      !(o.paidOutflowKeys as unknown[]).every((k) => typeof k === 'string')
    ) {
      return null
    }
    if (!isAppPreferences(o.preferences)) return null
    if (!Array.isArray(o.expenseEntries) || !o.expenseEntries.every(isExpenseEntry)) {
      return null
    }
    if (!Array.isArray(o.periodBudgets) || !o.periodBudgets.every(isPeriodBudgetRow)) {
      return null
    }
    if (!Array.isArray(o.savingsGoals) || !o.savingsGoals.every(isSavingsGoal)) {
      return null
    }
    if (!Array.isArray(o.incomeLines) || !o.incomeLines.every(isIncomeLine)) {
      return null
    }
    if (
      !Array.isArray(o.envelopeTransfers) ||
      !o.envelopeTransfers.every(isEnvelopeTransfer)
    ) {
      return null
    }

    let periodNotes: PeriodNote[]
    let quickExpenseTemplates: QuickExpenseTemplate[]
    if (
      ver === BACKUP_VERSION_V4 ||
      ver === BACKUP_VERSION_V5 ||
      ver === BACKUP_VERSION
    ) {
      if (!Array.isArray(o.periodNotes) || !o.periodNotes.every(isPeriodNote)) {
        return null
      }
      if (
        !Array.isArray(o.quickExpenseTemplates) ||
        !o.quickExpenseTemplates.every(isQuickExpenseTemplate)
      ) {
        return null
      }
      periodNotes = o.periodNotes as PeriodNote[]
      quickExpenseTemplates = o.quickExpenseTemplates as QuickExpenseTemplate[]
    } else {
      periodNotes =
        Array.isArray(o.periodNotes) && o.periodNotes.every(isPeriodNote)
          ? (o.periodNotes as PeriodNote[])
          : []
      quickExpenseTemplates =
        Array.isArray(o.quickExpenseTemplates) &&
        o.quickExpenseTemplates.every(isQuickExpenseTemplate)
          ? (o.quickExpenseTemplates as QuickExpenseTemplate[])
          : []
    }

    const savingsAccountTransfers =
      Array.isArray(o.savingsAccountTransfers) &&
      o.savingsAccountTransfers.every(isSavingsAccountTransfer)
        ? (o.savingsAccountTransfers as SavingsAccountTransfer[])
        : []

    return {
      paySettings: o.paySettings as PaySettings | null,
      bills: o.bills as Bill[],
      envelopes: o.envelopes as Envelope[],
      oneOffItems: o.oneOffItems as OneOffItem[],
      expenseEntries: o.expenseEntries as ExpenseEntry[],
      paidOutflowKeys: o.paidOutflowKeys as string[],
      preferences: o.preferences as AppPreferences,
      periodBudgets: o.periodBudgets as PeriodBudgetRow[],
      savingsGoals: o.savingsGoals as SavingsGoal[],
      incomeLines: o.incomeLines as IncomeLine[],
      envelopeTransfers: o.envelopeTransfers as EnvelopeTransfer[],
      periodNotes,
      quickExpenseTemplates,
      savingsAccountTransfers,
    }
  }

  return null
}

export function buildBackup(
  payload: Omit<BackupPayload, 'version' | 'exportedAt'>,
): BackupPayload {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    ...payload,
  }
}

export async function downloadJson(
  filename: string,
  payload: BackupPayload,
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await exportJsonBackupNative(filename, payload)
    return
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  await downloadBlob(filename, blob)
}
