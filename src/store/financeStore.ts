import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ParsedBackup } from '../lib/backup'
import { sanitizePaySettings } from '../lib/sanitizePaySettings'
import type {
  AppPreferences,
  Bill,
  CalendarReminder,
  Envelope,
  EnvelopeTransfer,
  ExpenseEntry,
  IncomeLine,
  OneOffItem,
  PaySettings,
  PeriodBudgetRow,
  PeriodNote,
  QuickExpenseTemplate,
  SavingsAccountTransfer,
  SavingsGoal,
} from '../types'

function newId(): string {
  return crypto.randomUUID()
}

export const defaultPreferences = (): AppPreferences => ({
  theme: 'system',
  lastExportAt: null,
  welcomeDismissedAt: null,
  lowBalanceAlertEnabled: false,
  lowBalanceThreshold: null,
  lastLowBalanceAlertDay: null,
  billDueAlertsEnabled: false,
  billDueAlertDaysBefore: 1,
  calendarReminders: [],
  safeSpendBufferAmount: null,
  summaryViewMode: 'pay_period',
  summaryDensity: 'simple',
  csvExportPreset: 'full',
})

const MAX_UNDO = 12

/** Strip removed set-aside preference keys from older localStorage saves. */
function sanitizePreferences(prefs: AppPreferences): AppPreferences {
  const next = { ...prefs }
  for (const k of [
    'setAsideJarPaidThrough',
    'setAsideJarProjectionReleaseThrough',
    'setAsideJarPaidBillHideThrough',
    'setAsideJarPaidBillTapMs',
    'setAsideJarProjectionReleaseTapMs',
  ] as const) {
    delete (next as Record<string, unknown>)[k]
  }
  return next
}

function sanitizeBill(b: Bill): Bill {
  const x = { ...b } as Record<string, unknown>
  delete x.trackSetAside
  delete x.setAsideSplitPeriods
  return x as unknown as Bill
}

function sanitizeSavingsTransfers(
  xs: SavingsAccountTransfer[] | undefined,
): SavingsAccountTransfer[] {
  if (!Array.isArray(xs)) return []
  // Remove the one-click test reset transfer if it exists.
  return xs.filter((t) => (t.note ?? '').trim() !== 'Reset test bucket to $0')
}

type PersistSlice = {
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

const emptyPersist = (): PersistSlice => ({
  paySettings: null,
  bills: [],
  envelopes: [],
  oneOffItems: [],
  expenseEntries: [],
  paidOutflowKeys: [],
  preferences: defaultPreferences(),
  periodBudgets: [],
  savingsGoals: [],
  incomeLines: [],
  envelopeTransfers: [],
  periodNotes: [],
  quickExpenseTemplates: [],
  savingsAccountTransfers: [],
})

function takeSnapshot(s: PersistSlice): string {
  return JSON.stringify(s)
}

function applySnapshot(json: string): PersistSlice {
  const parsed = JSON.parse(json) as Partial<PersistSlice>
  return {
    ...emptyPersist(),
    ...parsed,
    preferences: sanitizePreferences({
      ...defaultPreferences(),
      ...(parsed.preferences ?? {}),
    }),
    bills: Array.isArray(parsed.bills)
      ? parsed.bills.map(sanitizeBill)
      : emptyPersist().bills,
    savingsAccountTransfers: sanitizeSavingsTransfers(parsed.savingsAccountTransfers),
  }
}

interface FinanceState extends PersistSlice {
  undoSnapshots: string[]

  setPaySettings: (s: PaySettings) => void
  replaceFromBackup: (payload: ParsedBackup) => void
  setLastExportAt: (iso: string) => void
  setPreferences: (p: Partial<AppPreferences>) => void
  addCalendarReminder: (r: Omit<CalendarReminder, 'id' | 'snoozedUntil'>) => void
  removeCalendarReminder: (id: string) => void
  snoozeCalendarReminder: (id: string, snoozedUntilIso: string) => void

  undoLast: () => void

  addEnvelope: (name: string) => void
  removeEnvelope: (id: string) => void
  renameEnvelope: (id: string, name: string) => void

  addOneOff: (o: Omit<OneOffItem, 'id'>) => void
  updateOneOff: (id: string, patch: Partial<Omit<OneOffItem, 'id'>>) => void
  removeOneOff: (id: string) => void

  addExpenseEntry: (o: Omit<ExpenseEntry, 'id'>) => void
  removeExpenseEntry: (id: string) => void

  addIncomeLine: (o: Omit<IncomeLine, 'id'>) => void
  updateIncomeLine: (id: string, patch: Partial<Omit<IncomeLine, 'id'>>) => void
  removeIncomeLine: (id: string) => void

  setPeriodBudgets: (rows: PeriodBudgetRow[]) => void
  upsertPeriodBudget: (row: Omit<PeriodBudgetRow, 'id'>) => void
  removePeriodBudget: (id: string) => void

  addSavingsGoal: (g: Omit<SavingsGoal, 'id'>) => void
  updateSavingsGoal: (id: string, patch: Partial<Omit<SavingsGoal, 'id'>>) => void
  removeSavingsGoal: (id: string) => void

  addEnvelopeTransfer: (t: Omit<EnvelopeTransfer, 'id'>) => void
  removeEnvelopeTransfer: (id: string) => void

  addSavingsAccountTransfer: (t: Omit<SavingsAccountTransfer, 'id'>) => void
  removeSavingsAccountTransfer: (id: string) => void

  upsertPeriodNote: (row: Omit<PeriodNote, 'id'>) => void
  removePeriodNote: (id: string) => void

  addQuickExpenseTemplate: (t: Omit<QuickExpenseTemplate, 'id'>) => void
  removeQuickExpenseTemplate: (id: string) => void

  togglePaidKey: (key: string) => void
  clearPaidKeys: () => void

  addBill: (b: Omit<Bill, 'id'>) => void
  /** Add many bills at once (e.g. append import). Each draft gets a new id. */
  appendBills: (drafts: Omit<Bill, 'id'>[]) => void
  updateBill: (id: string, patch: Partial<Omit<Bill, 'id'>>) => void
  removeBill: (id: string) => void
}

function withUndo(
  state: FinanceState,
  partial: Partial<PersistSlice>,
): Partial<FinanceState> {
  const slice: PersistSlice = {
    paySettings: state.paySettings,
    bills: state.bills,
    envelopes: state.envelopes,
    oneOffItems: state.oneOffItems,
    expenseEntries: state.expenseEntries,
    paidOutflowKeys: state.paidOutflowKeys,
    preferences: state.preferences,
    periodBudgets: state.periodBudgets,
    savingsGoals: state.savingsGoals,
    incomeLines: state.incomeLines,
    envelopeTransfers: state.envelopeTransfers,
    periodNotes: state.periodNotes,
    quickExpenseTemplates: state.quickExpenseTemplates,
    savingsAccountTransfers: state.savingsAccountTransfers,
  }
  const snap = takeSnapshot(slice)
  return {
    ...partial,
    undoSnapshots: [...state.undoSnapshots.slice(-(MAX_UNDO - 1)), snap],
  }
}

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set) => ({
      ...emptyPersist(),
      undoSnapshots: [],

      undoLast: () =>
        set((state) => {
          if (state.undoSnapshots.length === 0) return state
          const snaps = [...state.undoSnapshots]
          const json = snaps.pop()!
          const restored = applySnapshot(json)
          return {
            ...state,
            ...restored,
            undoSnapshots: snaps,
          } as FinanceState
        }),

      setPaySettings: (paySettings) =>
        set((state) => ({
          ...withUndo(state, {
            paySettings: sanitizePaySettings(paySettings)!,
          }),
        })),

      replaceFromBackup: (payload) =>
        set({
          paySettings: sanitizePaySettings(payload.paySettings),
          bills: payload.bills.map(sanitizeBill),
          envelopes: payload.envelopes ?? [],
          oneOffItems: payload.oneOffItems ?? [],
          expenseEntries: payload.expenseEntries ?? [],
          paidOutflowKeys: payload.paidOutflowKeys ?? [],
          preferences: sanitizePreferences({
            ...defaultPreferences(),
            ...payload.preferences,
            calendarReminders:
              payload.preferences.calendarReminders ??
              defaultPreferences().calendarReminders,
          }),
          periodBudgets: payload.periodBudgets ?? [],
          savingsGoals: payload.savingsGoals ?? [],
          incomeLines: payload.incomeLines ?? [],
          envelopeTransfers: payload.envelopeTransfers ?? [],
          periodNotes: payload.periodNotes ?? [],
          quickExpenseTemplates: payload.quickExpenseTemplates ?? [],
          savingsAccountTransfers: sanitizeSavingsTransfers(payload.savingsAccountTransfers),
          undoSnapshots: [],
        }),

      setLastExportAt: (iso) =>
        set((s) => ({
          preferences: { ...s.preferences, lastExportAt: iso },
        })),

      setPreferences: (p) =>
        set((s) => ({
          preferences: { ...s.preferences, ...p },
        })),

      addCalendarReminder: (r) =>
        set((s) => ({
          preferences: {
            ...s.preferences,
            calendarReminders: [
              ...(s.preferences.calendarReminders ?? []),
              {
                ...r,
                id: newId(),
                snoozedUntil: null,
              },
            ],
          },
        })),

      removeCalendarReminder: (id) =>
        set((s) => ({
          preferences: {
            ...s.preferences,
            calendarReminders: (s.preferences.calendarReminders ?? []).filter(
              (x) => x.id !== id,
            ),
          },
        })),

      snoozeCalendarReminder: (id, snoozedUntilIso) =>
        set((s) => ({
          preferences: {
            ...s.preferences,
            calendarReminders: (s.preferences.calendarReminders ?? []).map(
              (x) =>
                x.id === id ? { ...x, snoozedUntil: snoozedUntilIso } : x,
            ),
          },
        })),

      addEnvelope: (name) =>
        set((state) =>
          withUndo(state, {
            envelopes: [...state.envelopes, { id: newId(), name: name.trim() }],
          }),
        ),

      removeEnvelope: (id) =>
        set((state) =>
          withUndo(state, {
            envelopes: state.envelopes.filter((e) => e.id !== id),
            bills: state.bills.map((b) =>
              b.envelopeId === id ? { ...b, envelopeId: undefined } : b,
            ),
            oneOffItems: state.oneOffItems.map((o) =>
              o.envelopeId === id ? { ...o, envelopeId: undefined } : o,
            ),
            expenseEntries: state.expenseEntries.map((e) =>
              e.envelopeId === id ? { ...e, envelopeId: undefined } : e,
            ),
            periodBudgets: state.periodBudgets.filter(
              (r) => !(r.targetType === 'envelope' && r.targetKey === id),
            ),
          }),
        ),

      renameEnvelope: (id, name) =>
        set((state) =>
          withUndo(state, {
            envelopes: state.envelopes.map((e) =>
              e.id === id ? { ...e, name: name.trim() } : e,
            ),
          }),
        ),

      addOneOff: (o) =>
        set((state) =>
          withUndo(state, {
            oneOffItems: [...state.oneOffItems, { ...o, id: newId() }],
          }),
        ),

      updateOneOff: (id, patch) =>
        set((state) =>
          withUndo(state, {
            oneOffItems: state.oneOffItems.map((x) =>
              x.id === id ? { ...x, ...patch } : x,
            ),
          }),
        ),

      removeOneOff: (id) =>
        set((state) =>
          withUndo(state, {
            oneOffItems: state.oneOffItems.filter((x) => x.id !== id),
            paidOutflowKeys: state.paidOutflowKeys.filter(
              (k) => k !== `oneoff:${id}`,
            ),
          }),
        ),

      addExpenseEntry: (o) =>
        set((state) =>
          withUndo(state, {
            expenseEntries: [...state.expenseEntries, { ...o, id: newId() }],
          }),
        ),

      removeExpenseEntry: (id) =>
        set((state) =>
          withUndo(state, {
            expenseEntries: state.expenseEntries.filter((x) => x.id !== id),
            paidOutflowKeys: state.paidOutflowKeys.filter(
              (k) => k !== `expense:${id}`,
            ),
          }),
        ),

      addIncomeLine: (o) =>
        set((state) =>
          withUndo(state, {
            incomeLines: [...state.incomeLines, { ...o, id: newId() }],
          }),
        ),

      updateIncomeLine: (id, patch) =>
        set((state) =>
          withUndo(state, {
            incomeLines: state.incomeLines.map((x) =>
              x.id === id ? { ...x, ...patch } : x,
            ),
          }),
        ),

      removeIncomeLine: (id) =>
        set((state) =>
          withUndo(state, {
            incomeLines: state.incomeLines.filter((x) => x.id !== id),
          }),
        ),

      setPeriodBudgets: (rows) =>
        set((state) => withUndo(state, { periodBudgets: rows })),

      upsertPeriodBudget: (row) =>
        set((state) => {
          const id = newId()
          const filtered = state.periodBudgets.filter(
            (r) =>
              !(
                r.periodStart === row.periodStart &&
                r.periodEndExclusive === row.periodEndExclusive &&
                r.targetType === row.targetType &&
                r.targetKey === row.targetKey
              ),
          )
          return withUndo(state, {
            periodBudgets: [...filtered, { ...row, id }],
          })
        }),

      removePeriodBudget: (id) =>
        set((state) =>
          withUndo(state, {
            periodBudgets: state.periodBudgets.filter((r) => r.id !== id),
          }),
        ),

      addSavingsGoal: (g) =>
        set((state) =>
          withUndo(state, {
            savingsGoals: [...state.savingsGoals, { ...g, id: newId() }],
          }),
        ),

      updateSavingsGoal: (id, patch) =>
        set((state) =>
          withUndo(state, {
            savingsGoals: state.savingsGoals.map((x) =>
              x.id === id ? { ...x, ...patch } : x,
            ),
          }),
        ),

      removeSavingsGoal: (id) =>
        set((state) =>
          withUndo(state, {
            savingsGoals: state.savingsGoals.filter((x) => x.id !== id),
          }),
        ),

      addEnvelopeTransfer: (t) =>
        set((state) =>
          withUndo(state, {
            envelopeTransfers: [
              ...state.envelopeTransfers,
              { ...t, id: newId() },
            ],
          }),
        ),

      removeEnvelopeTransfer: (id) =>
        set((state) =>
          withUndo(state, {
            envelopeTransfers: state.envelopeTransfers.filter(
              (x) => x.id !== id,
            ),
          }),
        ),

      addSavingsAccountTransfer: (t) =>
        set((state) =>
          withUndo(state, {
            savingsAccountTransfers: [
              ...state.savingsAccountTransfers,
              { ...t, id: newId() },
            ],
          }),
        ),

      removeSavingsAccountTransfer: (id) =>
        set((state) =>
          withUndo(state, {
            savingsAccountTransfers: state.savingsAccountTransfers.filter(
              (x) => x.id !== id,
            ),
          }),
        ),

      upsertPeriodNote: (row) =>
        set((state) => {
          const rest = state.periodNotes.filter(
            (n) =>
              !(
                n.periodStart === row.periodStart &&
                n.periodEndExclusive === row.periodEndExclusive
              ),
          )
          const body = row.body.trim()
          if (!body) {
            return withUndo(state, { periodNotes: rest })
          }
          return withUndo(state, {
            periodNotes: [...rest, { ...row, body, id: newId() }],
          })
        }),

      removePeriodNote: (id) =>
        set((state) =>
          withUndo(state, {
            periodNotes: state.periodNotes.filter((n) => n.id !== id),
          }),
        ),

      addQuickExpenseTemplate: (t) =>
        set((state) =>
          withUndo(state, {
            quickExpenseTemplates: [
              ...state.quickExpenseTemplates,
              { ...t, id: newId() },
            ],
          }),
        ),

      removeQuickExpenseTemplate: (id) =>
        set((state) =>
          withUndo(state, {
            quickExpenseTemplates: state.quickExpenseTemplates.filter(
              (x) => x.id !== id,
            ),
          }),
        ),

      togglePaidKey: (key) =>
        set((state) => {
          const has = state.paidOutflowKeys.includes(key)
          return withUndo(state, {
            paidOutflowKeys: has
              ? state.paidOutflowKeys.filter((k) => k !== key)
              : [...state.paidOutflowKeys, key],
          })
        }),

      clearPaidKeys: () =>
        set((state) => withUndo(state, { paidOutflowKeys: [] })),

      addBill: (b) =>
        set((state) =>
          withUndo(state, {
            bills: [...state.bills, { ...b, id: newId() }],
          }),
        ),

      appendBills: (drafts) =>
        set((state) => {
          if (drafts.length === 0) return state
          const added = drafts.map((d) =>
            sanitizeBill({ ...d, id: newId() }),
          )
          return {
            ...withUndo(state, { bills: [...state.bills, ...added] }),
          } as FinanceState
        }),

      updateBill: (id, patch) =>
        set((state) =>
          withUndo(state, {
            bills: state.bills.map((x) => {
              if (x.id !== id) return x
              let next: Bill = { ...x, ...patch }
              if (
                Object.prototype.hasOwnProperty.call(patch, 'recurrence') &&
                patch.recurrence === undefined
              ) {
                const stripped = { ...next }
                delete stripped.recurrence
                next = stripped
              }
              if (
                Object.prototype.hasOwnProperty.call(patch, 'confidence') &&
                patch.confidence === undefined
              ) {
                const stripped = { ...next }
                delete stripped.confidence
                next = stripped
              }
              return next
            }),
          }),
        ),

      removeBill: (id) =>
        set((state) =>
          withUndo(state, {
            bills: state.bills.filter((x) => x.id !== id),
            paidOutflowKeys: state.paidOutflowKeys.filter(
              (k) => !k.startsWith(`${id}|`) && k !== `oneoff:${id}`,
            ),
          }),
        ),
    }),
    {
      name: 'finance-app-manual-v1',
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FinanceState>
        const prevPrefs = p.preferences
        if (!prevPrefs) {
          const merged = { ...current, ...p } as FinanceState
          return {
            ...merged,
            paySettings: sanitizePaySettings(merged.paySettings),
            preferences: sanitizePreferences(merged.preferences),
            bills: merged.bills.map(sanitizeBill),
          }
        }
        const welcomeDismissedAt =
          'welcomeDismissedAt' in prevPrefs
            ? prevPrefs.welcomeDismissedAt
            : new Date().toISOString()
        const mergedPrefs = sanitizePreferences({
          ...defaultPreferences(),
          ...prevPrefs,
          welcomeDismissedAt,
          calendarReminders: Array.isArray(prevPrefs.calendarReminders)
            ? prevPrefs.calendarReminders
            : [],
        })
        const merged = {
          ...current,
          ...p,
          preferences: mergedPrefs,
        } as FinanceState
        return {
          ...merged,
          paySettings: sanitizePaySettings(merged.paySettings),
          preferences: sanitizePreferences(merged.preferences),
          bills: merged.bills.map(sanitizeBill),
        }
      },
      partialize: (state) => ({
        paySettings: state.paySettings,
        bills: state.bills,
        envelopes: state.envelopes,
        oneOffItems: state.oneOffItems,
        expenseEntries: state.expenseEntries,
        paidOutflowKeys: state.paidOutflowKeys,
        preferences: state.preferences,
        periodBudgets: state.periodBudgets,
        savingsGoals: state.savingsGoals,
        incomeLines: state.incomeLines,
        envelopeTransfers: state.envelopeTransfers,
        periodNotes: state.periodNotes,
        quickExpenseTemplates: state.quickExpenseTemplates,
        savingsAccountTransfers: state.savingsAccountTransfers,
      }),
    },
  ),
)
