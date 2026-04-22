import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { findDuplicateBill } from '../lib/duplicateBills'
import type { Bill, BillRecurrence, BillSchedule } from '../types'
import { PageUndo } from '../components/PageUndo'
import { useFinanceStore } from '../store/financeStore'

const weekdays = [
  { v: 0, label: 'Sunday' },
  { v: 1, label: 'Monday' },
  { v: 2, label: 'Tuesday' },
  { v: 3, label: 'Wednesday' },
  { v: 4, label: 'Thursday' },
  { v: 5, label: 'Friday' },
  { v: 6, label: 'Saturday' },
]

function money(n: number) {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

type RecurrenceFormMode = 'continuous' | 'count' | 'lastDate'

function recurrenceLabel(rec?: BillRecurrence): string {
  if (!rec) return 'Ongoing'
  switch (rec.kind) {
    case 'continuous':
      return 'Ongoing'
    case 'endsAfterPayments':
      return `${rec.count} payment${rec.count === 1 ? '' : 's'}`
    case 'endsOn':
      return `Until ${rec.lastPaymentDate}`
    default:
      return ''
  }
}

function scheduleLabel(s: BillSchedule, rec?: BillRecurrence): string {
  let base: string
  switch (s.kind) {
    case 'once':
      return `One-time on ${s.date}`
    case 'monthly':
      base = `Monthly on day ${s.dayOfMonth}`
      break
    case 'weekly':
      base = `Weekly on ${weekdays.find((w) => w.v === s.dayOfWeek)?.label ?? '—'}`
      break
    case 'biweekly':
      base = `Every 2 weeks (from ${s.anchorDate})`
      break
    default:
      base = ''
  }
  return `${base} · ${recurrenceLabel(rec)}`
}

function defaultRecurrenceMode(rec?: BillRecurrence): RecurrenceFormMode {
  if (!rec || rec.kind === 'continuous') return 'continuous'
  if (rec.kind === 'endsOn') return 'lastDate'
  return 'count'
}

const CATEGORY_SUGGESTIONS = [
  'Housing',
  'Utilities',
  'Debt',
  'Insurance',
  'Subscriptions',
  'Food',
  'Other',
]

export function BillsPage() {
  const bills = useFinanceStore((s) => s.bills)
  const envelopes = useFinanceStore((s) => s.envelopes)
  const addBill = useFinanceStore((s) => s.addBill)
  const updateBill = useFinanceStore((s) => s.updateBill)
  const removeBill = useFinanceStore((s) => s.removeBill)

  const [searchParams, setSearchParams] = useSearchParams()
  const billFromUrl = searchParams.get('bill')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [kind, setKind] = useState<BillSchedule['kind']>('monthly')
  const [recurrenceMode, setRecurrenceMode] =
    useState<RecurrenceFormMode>('continuous')

  const editing = editingId ? bills.find((b) => b.id === editingId) : null

  useEffect(() => {
    if (!billFromUrl) return
    const b = bills.find((x) => x.id === billFromUrl)
    if (!b) return
    setEditingId(billFromUrl)
    setKind(b.schedule.kind)
    setRecurrenceMode(defaultRecurrenceMode(b.recurrence))
    const id = requestAnimationFrame(() => {
      document.getElementById(`bill-row-${billFromUrl}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
    return () => cancelAnimationFrame(id)
  }, [billFromUrl, bills])

  const clearBillQuery = () =>
    setSearchParams(
      (sp) => {
        const next = new URLSearchParams(sp)
        next.delete('bill')
        return next
      },
      { replace: true },
    )

  const buildSchedule = (fd: FormData): BillSchedule | null => {
    if (kind === 'once') {
      const date = String(fd.get('onceDate') || '')
      return date ? { kind: 'once', date } : null
    }
    if (kind === 'monthly') {
      const dom = Math.min(31, Math.max(1, Number(fd.get('dayOfMonth')) || 1))
      return { kind: 'monthly', dayOfMonth: dom }
    }
    if (kind === 'weekly') {
      return {
        kind: 'weekly',
        dayOfWeek: Number(fd.get('dayOfWeek')) || 0,
      }
    }
    const anchor = String(fd.get('biweeklyAnchor') || '')
    return anchor ? { kind: 'biweekly', anchorDate: anchor } : null
  }

  const buildRecurrence = (
    fd: FormData,
    schedule: BillSchedule,
  ): BillRecurrence | undefined => {
    if (schedule.kind === 'once') return undefined
    const mode = (fd.get('recurrenceMode') as string) || 'continuous'
    if (mode === 'continuous') return undefined
    if (mode === 'lastDate') {
      const last = String(fd.get('lastPaymentDate') || '')
      return last ? { kind: 'endsOn', lastPaymentDate: last } : undefined
    }
    const count = Math.max(1, Math.floor(Number(fd.get('paymentCount')) || 1))
    if (schedule.kind === 'biweekly') {
      return {
        kind: 'endsAfterPayments',
        count,
        seriesStart: schedule.anchorDate,
      }
    }
    const seriesStart = String(fd.get('seriesStart') || '')
    if (!seriesStart) return undefined
    return { kind: 'endsAfterPayments', count, seriesStart }
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') || '').trim()
    const amount = Number(fd.get('amount'))
    if (!name || Number.isNaN(amount) || amount < 0) return

    const schedule = buildSchedule(fd)
    if (!schedule) return

    const recurrence = buildRecurrence(fd, schedule)
    const note = String(fd.get('note') || '').trim() || undefined
    const category = String(fd.get('category') || '').trim() || undefined
    const envRaw = String(fd.get('envelopeId') || '').trim()
    const envelopeId = envRaw || undefined
    const savedRaw = Number(fd.get('savedAmount'))
    const savedAmount =
      Number.isFinite(savedRaw) && savedRaw > 0
        ? Math.max(0, Math.min(amount, savedRaw))
        : 0

    if (!editingId) {
      const dup = findDuplicateBill(bills, { name, amount, schedule })
      if (
        dup &&
        !window.confirm(
          `You already have “${dup.name}” with the same amount and schedule. Save another anyway?`,
        )
      ) {
        return
      }
    } else {
      const dup = findDuplicateBill(
        bills,
        { name, amount, schedule },
        editingId,
      )
      if (
        dup &&
        !window.confirm(
          `Another bill matches “${dup.name}” with the same amount and schedule. Save anyway?`,
        )
      ) {
        return
      }
    }

    const amountIsEstimate = fd.get('amountIsEstimate') === 'on'
    const meta = {
      note,
      category,
      envelopeId,
      savedAmount,
      confidence: amountIsEstimate ? ('estimate' as const) : undefined,
    }

    if (editingId) {
      updateBill(editingId, {
        name,
        amount,
        schedule,
        recurrence,
        ...meta,
      })
      setEditingId(null)
      clearBillQuery()
    } else {
      addBill({ name, amount, schedule, recurrence, ...meta })
      e.currentTarget.reset()
      setKind('monthly')
      setRecurrenceMode('continuous')
    }
  }

  const startEdit = (b: Bill) => {
    setEditingId(b.id)
    setKind(b.schedule.kind)
    setRecurrenceMode(defaultRecurrenceMode(b.recurrence))
    setSearchParams(
      (sp) => {
        const next = new URLSearchParams(sp)
        next.set('bill', b.id)
        return next
      },
      { replace: true },
    )
  }

  const cancelEdit = () => {
    setEditingId(null)
    setKind('monthly')
    setRecurrenceMode('continuous')
    clearBillQuery()
  }

  const showRecurrence = kind !== 'once'
  const showSeriesStartForCount =
    recurrenceMode === 'count' &&
    (kind === 'weekly' || kind === 'monthly')

  return (
    <div className="space-y-8 text-left">
      <div>
        <p className="section-label">Bills</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
          Recurring payments
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Add or edit money that leaves your account. Set loans to end after a
          number of payments or on a last date; otherwise they stay ongoing.
        </p>
      </div>

      <form
        key={editingId ?? 'new'}
        onSubmit={onSubmit}
        className="card space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            {editing ? 'Edit bill' : 'Add bill'}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="link-accent text-sm"
              >
                Cancel edit
              </button>
            ) : null}
            <PageUndo />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Name
            </span>
            <input
              name="name"
              required
              defaultValue={editing?.name}
              placeholder="Rent, loan, subscription…"
              className="input-field mt-1 w-full"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Amount
            </span>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={editing?.amount}
              placeholder="0.00"
              className="input-field mt-1 w-full"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              name="amountIsEstimate"
              defaultChecked={editing?.confidence === 'estimate'}
              className="rounded border-slate-300 dark:border-slate-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Amount is an estimate (not exact)
            </span>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Category
            </span>
            <input
              name="category"
              list="bill-categories"
              defaultValue={editing?.category}
              placeholder="e.g. Utilities"
              className="input-field mt-1 w-full"
            />
            <datalist id="bill-categories">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Envelope (optional)
            </span>
            <select
              name="envelopeId"
              defaultValue={editing?.envelopeId ?? ''}
              className="select-field mt-1 w-full"
            >
              <option value="">— None —</option>
              {envelopes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Note (optional)
            </span>
            <textarea
              name="note"
              rows={2}
              defaultValue={editing?.note}
              placeholder="Account #, phone to call, …"
              className="input-field mt-1 w-full"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Schedule type
            </span>
            <select
              name="scheduleKind"
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as BillSchedule['kind'])
              }
              className="select-field mt-1 w-full"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="once">One-time</option>
            </select>
          </label>
        </div>

        {kind === 'once' && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Date
            </span>
            <input
              type="date"
              name="onceDate"
              required
              defaultValue={
                editing?.schedule.kind === 'once'
                  ? editing.schedule.date
                  : undefined
              }
              className="input-field mt-1 w-full"
            />
          </label>
        )}

        {kind === 'monthly' && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Day of month (1–31)
            </span>
            <input
              type="number"
              name="dayOfMonth"
              min={1}
              max={31}
              defaultValue={
                editing?.schedule.kind === 'monthly'
                  ? editing.schedule.dayOfMonth
                  : 1
              }
              required
              className="input-field mt-1 w-full"
            />
          </label>
        )}

        {kind === 'weekly' && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Day of week
            </span>
            <select
              name="dayOfWeek"
              defaultValue={
                editing?.schedule.kind === 'weekly'
                  ? editing.schedule.dayOfWeek
                  : 1
              }
              className="select-field mt-1 w-full"
            >
              {weekdays.map((w) => (
                <option key={w.v} value={w.v}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {kind === 'biweekly' && (
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              First withdrawal (anchor)
            </span>
            <input
              type="date"
              name="biweeklyAnchor"
              required
              defaultValue={
                editing?.schedule.kind === 'biweekly'
                  ? editing.schedule.anchorDate
                  : undefined
              }
              className="input-field mt-1 w-full"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Repeats every 14 days from this date. For a limited series, set
              “Number of payments” below (e.g. 8 payments).
            </span>
          </label>
        )}

        {showRecurrence && (
          <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/90 p-4 dark:border-white/5 dark:bg-white/[0.04]">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              How long does this charge run?
            </p>
            <label className="block">
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Recurrence
              </span>
              <select
                name="recurrenceMode"
                value={recurrenceMode}
                onChange={(e) =>
                  setRecurrenceMode(e.target.value as RecurrenceFormMode)
                }
                className="select-field mt-1 w-full"
              >
                <option value="continuous">Ongoing (no end)</option>
                <option value="count">Ends after N payments</option>
                <option value="lastDate">Ends on or before a date</option>
              </select>
            </label>

            {recurrenceMode === 'count' && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Number of payments
                </span>
                <input
                  type="number"
                  name="paymentCount"
                  min={1}
                  step={1}
                  defaultValue={
                    editing?.recurrence?.kind === 'endsAfterPayments'
                      ? editing.recurrence.count
                      : 8
                  }
                  required
                  className="input-field mt-1 w-full"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  {kind === 'biweekly'
                    ? 'e.g. 8 for eight withdrawals every two weeks from the anchor date.'
                    : 'First payment is on the “series start” date below (or same as monthly day).'}
                </span>
              </label>
            )}

            {showSeriesStartForCount && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  First payment in this series
                </span>
                <input
                  type="date"
                  name="seriesStart"
                  required
                  defaultValue={
                    editing?.recurrence?.kind === 'endsAfterPayments'
                      ? editing.recurrence.seriesStart
                      : undefined
                  }
                  className="input-field mt-1 w-full"
                />
              </label>
            )}

            {recurrenceMode === 'lastDate' && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Last payment on or before
                </span>
                <input
                  type="date"
                  name="lastPaymentDate"
                  required
                  defaultValue={
                    editing?.recurrence?.kind === 'endsOn'
                      ? editing.recurrence.lastPaymentDate
                      : undefined
                  }
                  className="input-field mt-1 w-full"
                />
              </label>
            )}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary px-5"
        >
          {editing ? 'Save changes' : 'Add bill'}
        </button>
      </form>

      <div className="card !p-0 overflow-hidden">
        {bills.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No bills yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {bills.map((b: Bill) => (
              <li
                key={b.id}
                id={`bill-row-${b.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {b.name}
                    {b.confidence === 'estimate' ? (
                      <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                        Est.
                      </span>
                    ) : null}
                  </p>
                  <p className="break-words text-xs text-slate-500 dark:text-slate-400">
                    {b.category ? `${b.category} · ` : ''}
                    {scheduleLabel(b.schedule, b.recurrence)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums font-medium text-slate-800 dark:text-slate-200">
                    {money(b.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => startEdit(b)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (editingId === b.id) setEditingId(null)
                      if (billFromUrl === b.id) clearBillQuery()
                      removeBill(b.id)
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-950 dark:hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
