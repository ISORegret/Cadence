export type PayFrequency = 'weekly' | 'biweekly' | 'monthly' | 'twice_monthly'

export interface PaySettings {
  frequency: PayFrequency
  anchorPayDate: string
  monthlyPayDay?: number
  twiceMonthlyDays?: [number, number]
  incomePerPaycheck?: number | null
  incomeSecondPaycheck?: number | null
  /**
   * Actual checking balance at end of this day — seeds Summary “running balance”
   * and Upcoming projections (paychecks and withdrawals apply after this date).
   */
  startingFundsDate?: string | null
  startingFundsAmount?: number | null
  currencyCode?: string
  locale?: string
}

export type BillSchedule =
  | { kind: 'once'; date: string }
  | { kind: 'monthly'; dayOfMonth: number }
  | { kind: 'weekly'; dayOfWeek: number }
  | { kind: 'biweekly'; anchorDate: string }

export type BillRecurrence =
  | { kind: 'continuous' }
  | { kind: 'endsAfterPayments'; count: number; seriesStart: string }
  | { kind: 'endsOn'; lastPaymentDate: string }

export interface Envelope {
  id: string
  name: string
}

export interface Bill {
  id: string
  name: string
  amount: number
  schedule: BillSchedule
  recurrence?: BillRecurrence
  note?: string
  category?: string
  envelopeId?: string
  /** When set, UI can show this amount as an estimate rather than fixed. */
  confidence?: 'estimate' | 'confirmed'
  /**
   * When true, show “set aside per pay period” on Bills and Upcoming for this bill only.
   */
  trackSetAside?: boolean
}

export interface OneOffItem {
  id: string
  name: string
  amount: number
  date: string
  category?: string
  note?: string
  envelopeId?: string
}

/** Fast discretionary spend (coffee, gas, etc.) */
export interface ExpenseEntry {
  id: string
  date: string
  amount: number
  note?: string
  category?: string
  envelopeId?: string
}

/** Extra recurring income lines (side gigs) — summed with take-home on Summary. */
export interface IncomeLine {
  id: string
  label: string
  amount: number
}

/** Budget vs actual for current pay period (matched by period dates). */
export interface PeriodBudgetRow {
  id: string
  /** Inclusive period start (ISO date) */
  periodStart: string
  /** Exclusive period end (ISO date) */
  periodEndExclusive: string
  targetType: 'category' | 'envelope'
  /** Category name or envelope id */
  targetKey: string
  budgeted: number
}

export interface SavingsGoal {
  id: string
  name: string
  targetAmount: number
  savedAmount: number
  /** Optional target date yyyy-mm-dd */
  targetDate?: string
}

/** Record-only envelope → envelope moves (no auto balance math). */
export interface EnvelopeTransfer {
  id: string
  date: string
  amount: number
  fromEnvelopeId: string
  toEnvelopeId: string
  note?: string
}

/** Free-form note for a specific pay window (matched by period dates). */
export interface PeriodNote {
  id: string
  periodStart: string
  periodEndExclusive: string
  body: string
}

/** One-tap presets for the quick expense form. */
export interface QuickExpenseTemplate {
  id: string
  label: string
  amount: number
  category?: string
  envelopeId?: string
}

export type OutflowSource = 'bill' | 'oneoff' | 'expense'

export interface Outflow {
  billId: string
  name: string
  amount: number
  date: string
  source: OutflowSource
  category?: string
  envelopeId?: string
  note?: string
}

export type ThemePreference = 'system' | 'light' | 'dark'

/** In-app / notification reminder (date-time). */
export interface CalendarReminder {
  id: string
  title: string
  body: string
  /** ISO datetime (local wall time as stored) */
  remindAt: string
  /** Hide until this ISO datetime */
  snoozedUntil: string | null
}

export interface AppPreferences {
  theme: ThemePreference
  lastExportAt: string | null
  /**
   * `null` = show welcome intro once. Omitted in older saves is treated as
   * already dismissed during rehydration merge.
   */
  welcomeDismissedAt?: string | null
  /** Notify when projected running balance dips below threshold this period. */
  lowBalanceAlertEnabled?: boolean
  lowBalanceThreshold?: number | null
  /** YYYY-MM-DD (local) of last low-balance alert to avoid spam */
  lastLowBalanceAlertDay?: string | null
  /**
   * Schedule system notifications for upcoming bill withdrawals (native app only).
   * One notification per bill occurrence, within the next few months.
   */
  billDueAlertsEnabled?: boolean
  /**
   * How many calendar days before each bill’s due date to fire (0 = 9:00 on the due date).
   */
  billDueAlertDaysBefore?: number
  calendarReminders?: CalendarReminder[]
  /** Legacy: bank anchor now lives on PaySettings; cleared when saving pay schedule. */
  bankBalanceAnchorDate?: string | null
  bankBalanceAnchorAmount?: number | null
  /**
   * Optional cushion subtracted from projected balance for “safe to spend” hints.
   * Same currency as pay settings.
   */
  safeSpendBufferAmount?: number | null
  /** Summary hero: pay period vs calendar month aggregates. */
  summaryViewMode?: 'pay_period' | 'calendar_month'
  /**
   * `simple` — fewer numbers, hero first, secondary sections collapsed.
   * `detailed` — original full Summary layout.
   */
  summaryDensity?: 'simple' | 'detailed'
}
