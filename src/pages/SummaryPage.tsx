import { differenceInCalendarDays, format } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney } from '../lib/money'
import {
  listExpenseOutflowsInRange,
  listOneOffOutflowsInRange,
  listOutflowsInRange,
  mergeAllOutflowLists,
  payPeriodInclusiveLastDay,
  totalAmount,
} from '../lib/payPeriod'
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
  const savingsAccountTransfers = useFinanceStore((s) => s.savingsAccountTransfers)

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

  const billBucketBalanceLabel = useMemo(() => {
    if (!paySettings) return '—'
    // If a savings baseline is configured, show the projected savings balance (end of today).
    if (projectedSavingsEndOfToday !== null) return money(projectedSavingsEndOfToday)

    // Otherwise, still show something that moves: net of recorded transfers up through today.
    const net = savingsAccountTransfers
      .filter((t) => t.date <= todayStr)
      .reduce((s, t) => s + (t.direction === 'to_savings' ? t.amount : -t.amount), 0)
    return `${money(net)} (net moved)`
  }, [paySettings, projectedSavingsEndOfToday, money, savingsAccountTransfers, todayStr])

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
            Cash (estimate)
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {projectedBalanceEndOfToday !== null ? money(projectedBalanceEndOfToday) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Uses your Starting funds + scheduled paychecks/withdrawals through today.
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
            Cash {money(dueFromCashThisPeriod)} · Bill bucket {money(dueFromBillBucketThisPeriod)}
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
    </div>
  )
}

