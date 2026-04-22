import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney } from '../lib/money'
import {
  listExpenseOutflowsInRange,
  listOneOffOutflowsInRange,
  listOutflowsInRange,
  mergeAllOutflowLists,
  paidKeyForOutflow,
  payPeriodInclusiveLastDay,
  totalAmount,
} from '../lib/payPeriod'
import type { Outflow } from '../types'
import { hasSavingsAnchor } from '../lib/savingsAccount'
import { CashflowStandingBadge } from '../components/CashflowStandingBadge'
import { PageUndo } from '../components/PageUndo'
import { useCadenceHealth } from '../hooks/useCadenceHealth'
import { useFinanceStore } from '../store/financeStore'

export function SummaryPage() {
  const paySettings = useFinanceStore((s) => s.paySettings)
  const bills = useFinanceStore((s) => s.bills)
  const oneOffItems = useFinanceStore((s) => s.oneOffItems)
  const expenseEntries = useFinanceStore((s) => s.expenseEntries)
  const addExpenseEntry = useFinanceStore((s) => s.addExpenseEntry)
  const envelopes = useFinanceStore((s) => s.envelopes)
  const preferences = useFinanceStore((s) => s.preferences)
  const setPreferences = useFinanceStore((s) => s.setPreferences)
  const addSavingsAccountTransfer = useFinanceStore((s) => s.addSavingsAccountTransfer)
  const removeSavingsAccountTransfer = useFinanceStore((s) => s.removeSavingsAccountTransfer)
  const savingsAccountTransfers = useFinanceStore((s) => s.savingsAccountTransfers)
  const paidOutflowKeys = useFinanceStore((s) => s.paidOutflowKeys)
  const togglePaidKey = useFinanceStore((s) => s.togglePaidKey)

  const [qeNote, setQeNote] = useState('')
  const [qeAmount, setQeAmount] = useState('')
  const [qeDate, setQeDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [qeCat, setQeCat] = useState(preferences.lastQuickExpenseCategory ?? '')
  const [qeEnv, setQeEnv] = useState(preferences.lastQuickExpenseEnvelopeId ?? '')

  const [txAmount, setTxAmount] = useState('')
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [txDir, setTxDir] = useState<'to_savings' | 'from_savings'>('to_savings')
  const [txNote, setTxNote] = useState('')

  const { todayStr, today, period, projectedBalanceEndOfToday, projectedSavingsEndOfToday, standing } =
    useCadenceHealth()
  const money = (n: number) => formatMoney(n, paySettings)

  const netBucketMoved = useMemo(() => {
    return savingsAccountTransfers
      .filter((t) => t.date <= todayStr)
      .reduce((s, t) => s + (t.direction === 'to_savings' ? t.amount : -t.amount), 0)
  }, [savingsAccountTransfers, todayStr])

  const billBucketBalanceLabel = useMemo(() => {
    if (!paySettings) return '—'
    // If a savings baseline is configured, show the projected savings balance (end of today).
    if (projectedSavingsEndOfToday !== null) return money(projectedSavingsEndOfToday)

    // Otherwise, still show something that moves: net of recorded transfers up through today.
    return `${money(netBucketMoved)} (net moved)`
  }, [paySettings, projectedSavingsEndOfToday, money, netBucketMoved])

  const totalFundsLabel = useMemo(() => {
    if (projectedBalanceEndOfToday === null) return '—'
    // When a real savings anchor exists we can show a true "checking + savings" total.
    if (projectedSavingsEndOfToday !== null) {
      return money(projectedBalanceEndOfToday + projectedSavingsEndOfToday)
    }
    // Without a savings anchor, the best we can do is "checking + net moved".
    return `${money(projectedBalanceEndOfToday + netBucketMoved)} (approx.)`
  }, [projectedBalanceEndOfToday, projectedSavingsEndOfToday, money, netBucketMoved])

  const {
    dueFromCashThisPeriod,
    dueFromBillBucketThisPeriod,
    dueTotalThisPeriod,
    periodLabel,
    dayOfPeriodLabel,
  } = useMemo(() => {
    if (!paySettings || !period) {
      return {
        dueFromCashThisPeriod: 0,
        dueFromBillBucketThisPeriod: 0,
        dueTotalThisPeriod: 0,
        periodLabel: '',
        dayOfPeriodLabel: '',
      }
    }

    const outflows = mergeAllOutflowLists([
      listOutflowsInRange(bills, period.intervalStart, period.intervalEndExclusive),
      listOneOffOutflowsInRange(oneOffItems, period.intervalStart, period.intervalEndExclusive),
      listExpenseOutflowsInRange(expenseEntries, period.intervalStart, period.intervalEndExclusive),
    ])

    // Option A: "Bill bucket" bills are still due, but shouldn't reduce cash twice.
    const billBucketBillOutflows = outflows.filter(
      (o) => o.source === 'bill' && (o.payFrom ?? 'checking') === 'savings',
    )
    const cashOutflows = outflows.filter(
      (o) => o.source !== 'bill' || (o.payFrom ?? 'checking') !== 'savings',
    )

    const billSavedMap = new Map<string, number>(
      bills.map((b) => [b.id, Math.max(0, b.savedAmount ?? 0)]),
    )

    let savedApplied = 0
    const appliedByBill = new Map<string, number>()
    for (const o of cashOutflows) {
      if (o.source !== 'bill') continue
      const available = billSavedMap.get(o.billId) ?? 0
      if (available <= 0) continue
      const already = appliedByBill.get(o.billId) ?? 0
      const remain = Math.max(0, available - already)
      if (remain <= 0) continue
      const applied = Math.min(remain, o.amount)
      appliedByBill.set(o.billId, already + applied)
    }
    savedApplied = [...appliedByBill.values()].reduce((s, v) => s + v, 0)

    const cashTotal = totalAmount(cashOutflows)
    const dueFromCash = Math.max(0, cashTotal - savedApplied)
    const dueFromBucket = totalAmount(billBucketBillOutflows)
    const dueTotal = dueFromCash + dueFromBucket

    const inclusiveEnd = payPeriodInclusiveLastDay(period)
    const periodLabelLocal = `${format(period.intervalStart, 'MMM d')} – ${format(inclusiveEnd, 'MMM d')}`
    const totalDays = Math.max(
      1,
      differenceInCalendarDays(period.intervalEndExclusive, period.intervalStart),
    )
    const dayIdx = Math.min(
      totalDays,
      Math.max(1, differenceInCalendarDays(today, period.intervalStart) + 1),
    )
    const dayLabel = `Day ${dayIdx} of ${totalDays}`

    return {
      dueFromCashThisPeriod: dueFromCash,
      dueFromBillBucketThisPeriod: dueFromBucket,
      dueTotalThisPeriod: dueTotal,
      periodLabel: periodLabelLocal,
      dayOfPeriodLabel: dayLabel,
    }
  }, [paySettings, period, bills, oneOffItems, expenseEntries, today])

  /** Withdrawals in this pay period whose due date is today or earlier — hidden until the due day (e.g. due the 25th won’t show on the 24th). */
  const dueThroughTodayRows = useMemo(() => {
    if (!paySettings || !period) return [] as Outflow[]
    const outflows = mergeAllOutflowLists([
      listOutflowsInRange(bills, period.intervalStart, period.intervalEndExclusive),
      listOneOffOutflowsInRange(oneOffItems, period.intervalStart, period.intervalEndExclusive),
      listExpenseOutflowsInRange(expenseEntries, period.intervalStart, period.intervalEndExclusive),
    ])
    return outflows
      .filter((o) => o.date <= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
  }, [
    paySettings,
    period,
    bills,
    oneOffItems,
    expenseEntries,
    todayStr,
  ])

  const isPaid = (o: Outflow) => paidOutflowKeys.includes(paidKeyForOutflow(o))

  if (!paySettings || !period) {
    return (
      <div className="card p-8 text-left">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Set your pay schedule
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Add when you get paid so Summary can show your current cash estimate and what’s due this
          pay period.
        </p>
        <div className="mt-6">
          <Link to="/settings" className="btn-primary">
            Configure pay schedule
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 text-left">
      <div className="card-tight flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-label">Summary</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
            {periodLabel}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {dayOfPeriodLabel}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <CashflowStandingBadge standing={standing} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Checking (estimate)
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {projectedBalanceEndOfToday !== null ? money(projectedBalanceEndOfToday) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Total funds (checking + bucket): <span className="tabular-nums">{totalFundsLabel}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Uses your Starting funds + scheduled paychecks/withdrawals through today. Transfers to the
            bucket reduce checking.
          </p>
        </div>

        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Payment due (this pay period)
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {money(dueTotalThisPeriod)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Cash due {money(dueFromCashThisPeriod)} · Bucket-paid due {money(dueFromBillBucketThisPeriod)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Bucket balance <span className="tabular-nums">{billBucketBalanceLabel}</span>
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
          <div className="min-w-0">
            <p className="section-label">Spend</p>
            <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              Quick expense
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Single purchase — shows up in Calendar and totals.
            </p>
          </div>
          <PageUndo />
        </div>

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
            setQeDate(new Date().toISOString().slice(0, 10))
          }}
        >
          <input
            value={qeNote}
            onChange={(e) => setQeNote(e.target.value)}
            placeholder="What (optional)"
            className="input-field min-w-[10rem] flex-1"
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
          <input
            value={qeCat}
            onChange={(e) => setQeCat(e.target.value)}
            placeholder="Category (optional)"
            className="input-field min-w-[9rem] flex-1"
          />
          <select
            value={qeEnv}
            onChange={(e) => setQeEnv(e.target.value)}
            className="select-field !py-1.5 text-sm"
          >
            <option value="">Envelope (optional)</option>
            {envelopes.map((ev) => (
              <option key={`qe-${ev.id}`} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary !py-2 text-sm">
            Add
          </button>
        </form>
      </div>

      <div className="card">
        <p className="section-label">Bill bucket</p>
        <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
          Move money in/out
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Record money you set aside so bills can be paid from the bucket without reducing cash twice.
        </p>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          <span className="font-semibold">Bucket balance:</span>{' '}
          <span className="tabular-nums">{billBucketBalanceLabel}</span>
        </p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const amount = Number(txAmount)
            if (!txDate.trim() || !Number.isFinite(amount) || amount <= 0) return
            addSavingsAccountTransfer({
              date: txDate.trim(),
              amount,
              direction: txDir,
              note: txNote.trim() || undefined,
            })
            setTxAmount('')
            setTxNote('')
            setTxDate(new Date().toISOString().slice(0, 10))
          }}
        >
          <input
            value={txAmount}
            onChange={(e) => setTxAmount(e.target.value)}
            type="number"
            step="0.01"
            min="0"
            placeholder="Amount"
            className="input-field w-28"
            required
          />
          <input
            value={txDate}
            onChange={(e) => setTxDate(e.target.value)}
            type="date"
            className="input-field"
            required
          />
          <select
            value={txDir}
            onChange={(e) => setTxDir(e.target.value as 'to_savings' | 'from_savings')}
            className="select-field !py-1.5 text-sm"
          >
            <option value="to_savings">To savings</option>
            <option value="from_savings">From savings</option>
          </select>
          <input
            value={txNote}
            onChange={(e) => setTxNote(e.target.value)}
            placeholder="Note (optional)"
            className="input-field min-w-[10rem] flex-1"
          />
          <button type="submit" className="btn-solid !py-2 text-sm">
            Add
          </button>
        </form>

        {savingsAccountTransfers.length > 0 ? (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Recent bucket moves
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {[...savingsAccountTransfers]
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 12)
                .map((t) => (
                  <li key={t.id} className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-slate-800 dark:text-slate-200">
                        <span className="tabular-nums font-semibold">{money(t.amount)}</span>{' '}
                        <span className="text-slate-500 dark:text-slate-400">
                          {t.direction === 'to_savings' ? '→ bucket' : '← from bucket'}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t.date}
                        {t.note?.trim() ? ` · ${t.note.trim()}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                      onClick={() => {
                        const ok = window.confirm('Delete this bucket move?')
                        if (!ok) return
                        removeSavingsAccountTransfer(t.id)
                      }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              Need older entries? Manage the full list in{' '}
              <Link to="/settings#savings-account" className="font-semibold underline">
                Settings
              </Link>
              .
            </p>
          </div>
        ) : null}
        {!hasSavingsAnchor(paySettings) ? (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Add a savings balance baseline in{' '}
            <Link to="/settings#savings-account" className="font-semibold underline">
              Settings
            </Link>{' '}
            if you want the bucket balance to be a true projected savings balance (instead of “net moved”).
          </p>
        ) : null}
      </div>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-white/10">
          <div className="min-w-0">
            <p className="section-label">Paid status</p>
            <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
              Due through today
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Only withdrawals scheduled on or before today appear here. If something is due tomorrow, it
              shows up once that date arrives. Check off when paid — amount and label strike through.
            </p>
          </div>
          <PageUndo />
        </div>

        {dueThroughTodayRows.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Nothing scheduled through today in this pay period (or everything left is dated later this
            period).
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {dueThroughTodayRows.map((o) => {
              const pk = paidKeyForOutflow(o)
              const paid = isPaid(o)
              return (
                <li key={pk} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={paid}
                      onChange={() => togglePaidKey(pk)}
                      className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 dark:border-slate-600"
                      aria-label={paid ? `Paid: ${o.name}` : `Mark paid: ${o.name}`}
                    />
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        <span
                          className={
                            paid
                              ? 'text-slate-500 line-through dark:text-slate-500'
                              : ''
                          }
                        >
                          {o.name}
                        </span>
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
                            : o.payFrom === 'savings'
                              ? ' · From bucket'
                              : ''}
                      </p>
                      {o.note ? (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{o.note}</p>
                      ) : null}
                    </div>
                  </label>
                  <span
                    className={[
                      'shrink-0 tabular-nums text-sm font-semibold',
                      paid
                        ? 'text-slate-400 line-through'
                        : 'text-slate-800 dark:text-slate-200',
                    ].join(' ')}
                  >
                    {money(o.amount)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

