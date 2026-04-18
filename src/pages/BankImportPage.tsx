import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney } from '../lib/money'
import { parseCsv } from '../lib/parseCsv'
import {
  guessCsvColumns,
  rowToExpenseCandidate,
  type BankImportRow,
} from '../lib/bankCsvImport'
import { useFinanceStore } from '../store/financeStore'

const SUGGESTED_CATEGORIES = [
  'Housing',
  'Utilities',
  'Debt',
  'Insurance',
  'Subscriptions',
  'Food',
  'Transport',
  'Other',
]

function uniqSorted<T extends string>(xs: (T | undefined)[]): T[] {
  const set = new Set<T>()
  for (const x of xs) {
    if (x?.trim()) set.add(x.trim() as T)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function BankImportPage() {
  const paySettings = useFinanceStore((s) => s.paySettings)
  const bills = useFinanceStore((s) => s.bills)
  const oneOffItems = useFinanceStore((s) => s.oneOffItems)
  const expenseEntries = useFinanceStore((s) => s.expenseEntries)
  const preferences = useFinanceStore((s) => s.preferences)
  const addExpenseEntry = useFinanceStore((s) => s.addExpenseEntry)

  const categories = useMemo(
    () =>
      uniqSorted([
        ...SUGGESTED_CATEGORIES,
        ...bills.map((b) => b.category),
        ...oneOffItems.map((o) => o.category),
        ...expenseEntries.map((e) => e.category),
        preferences.lastQuickExpenseCategory,
      ] as string[]),
    [bills, oneOffItems, expenseEntries, preferences.lastQuickExpenseCategory],
  )

  const defaultCat =
    preferences.lastQuickExpenseCategory?.trim() ||
    categories[0] ||
    'Other'

  const [paste, setPaste] = useState('')
  const [category, setCategory] = useState(defaultCat)
  const [skipHeader, setSkipHeader] = useState(true)
  const [treatPositiveAsDebit, setTreatPositiveAsDebit] = useState(false)
  const [dateIdx, setDateIdx] = useState(0)
  const [amountIdx, setAmountIdx] = useState(1)
  const [memoIdx, setMemoIdx] = useState<number | ''>('')
  const [lastResult, setLastResult] = useState<string | null>(null)

  const rows = useMemo(() => {
    const t = paste.trim()
    if (!t) return [] as string[][]
    return parseCsv(t)
  }, [paste])

  const headerRow = rows[0] ?? []
  const dataRows = skipHeader && rows.length > 1 ? rows.slice(1) : rows

  const applyGuess = () => {
    if (headerRow.length === 0) return
    const g = guessCsvColumns(headerRow)
    if (g.dateIdx !== undefined) setDateIdx(g.dateIdx)
    if (g.amountIdx !== undefined) setAmountIdx(g.amountIdx)
    if (g.memoIdx !== undefined) setMemoIdx(g.memoIdx)
    else setMemoIdx('')
  }

  const preview: BankImportRow[] = useMemo(() => {
    const out: BankImportRow[] = []
    const memo =
      memoIdx === '' || memoIdx === undefined || typeof memoIdx !== 'number'
        ? undefined
        : memoIdx
    for (const cells of dataRows.slice(0, 25)) {
      const row = rowToExpenseCandidate(
        cells,
        dateIdx,
        amountIdx,
        memo,
        { treatPositiveAsDebit },
      )
      if (row) out.push(row)
    }
    return out
  }, [dataRows, dateIdx, amountIdx, memoIdx, treatPositiveAsDebit])

  const importAll = () => {
    if (dataRows.length === 0) {
      setLastResult('Nothing to import.')
      return
    }
    const memo =
      memoIdx === '' || memoIdx === undefined || typeof memoIdx !== 'number'
        ? undefined
        : memoIdx

    const existing = new Set(
      expenseEntries.map((e) =>
        `${e.date}|${e.amount}|${(e.note || '').slice(0, 80)}`,
      ),
    )

    let added = 0
    let skipped = 0
    for (const cells of dataRows) {
      const row = rowToExpenseCandidate(cells, dateIdx, amountIdx, memo, {
        treatPositiveAsDebit,
      })
      if (!row) {
        skipped++
        continue
      }
      const key = `${row.date}|${row.amount}|${(row.note || '').slice(0, 80)}`
      if (existing.has(key)) {
        skipped++
        continue
      }
      existing.add(key)
      addExpenseEntry({
        date: row.date,
        amount: row.amount,
        note: row.note,
        category: category.trim() || undefined,
      })
      added++
    }
    setLastResult(`Imported ${added} expense row(s). Skipped ${skipped} empty, credit, or duplicate line(s).`)
  }

  const colOptions = headerRow.map((h, i) => ({
    value: i,
    label: h.trim() ? `${i}: ${h.trim().slice(0, 48)}` : `Column ${i}`,
  }))

  return (
    <div className="space-y-6 text-left print:max-w-none">
      <div>
        <p className="section-label">Planning</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
          Import bank CSV → expenses
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Paste export text or use a file below. Map <strong className="font-medium">Date</strong>{' '}
          and <strong className="font-medium">Amount</strong>; optional memo/description. By default only{' '}
          <strong className="font-medium">negative</strong> amounts import as spending (typical debit
          exports). Credits and duplicates are skipped.
        </p>
      </div>

      <div className="card space-y-4">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          CSV text
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={6}
            className="input-field mt-1 min-h-[120px] w-full font-mono text-xs"
            placeholder="Paste rows including header…"
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const r = new FileReader()
              r.onload = () => setPaste(String(r.result ?? ''))
              r.readAsText(f)
            }}
          />
          <span>Or choose a .csv file</span>
        </label>
      </div>

      {rows.length > 0 ? (
        <div className="card space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={applyGuess}>
              Guess columns from header
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={skipHeader}
              onChange={(e) => setSkipHeader(e.target.checked)}
            />
            First row is header
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={treatPositiveAsDebit}
              onChange={(e) => setTreatPositiveAsDebit(e.target.checked)}
            />
            Positive amounts are debits (use when your file has no negative signs)
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Date column
              <select
                value={dateIdx}
                onChange={(e) => setDateIdx(Number(e.target.value))}
                className="select-field !py-2 text-sm"
              >
                {colOptions.map((o) => (
                  <option key={`d-${o.value}`} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Amount column
              <select
                value={amountIdx}
                onChange={(e) => setAmountIdx(Number(e.target.value))}
                className="select-field !py-2 text-sm"
              >
                {colOptions.map((o) => (
                  <option key={`a-${o.value}`} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Memo (optional)
              <select
                value={memoIdx === '' ? '' : String(memoIdx)}
                onChange={(e) => {
                  const v = e.target.value
                  setMemoIdx(v === '' ? '' : Number(v))
                }}
                className="select-field !py-2 text-sm"
              >
                <option value="">—</option>
                {colOptions.map((o) => (
                  <option key={`m-${o.value}`} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Category for imported rows
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="select-field max-w-md !py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="bg-slate-50 dark:bg-white/[0.04]">
                <tr>
                  <th className="px-2 py-2">Preview (first imports)</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-2 py-3 text-slate-500">
                      No debit rows matched with current mapping.
                    </td>
                  </tr>
                ) : (
                  preview.map((r, i) => (
                    <tr key={`${r.date}-${i}`} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1.5">
                        <span className="text-slate-500">{r.date}</span>{' '}
                        <span className="text-slate-800 dark:text-slate-200">{r.note || 'Expense'}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {formatMoney(r.amount, paySettings)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <button type="button" className="btn-solid" onClick={importAll}>
            Import all debit rows
          </button>
          {lastResult ? (
            <p className="text-sm text-slate-700 dark:text-slate-300">{lastResult}</p>
          ) : null}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Review on{' '}
            <Link to="/" className="link-accent">
              Summary
            </Link>{' '}
            under quick expenses / activity.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Paste CSV content to continue.</p>
      )}
    </div>
  )
}
