import { parseISO, isValid } from 'date-fns'

export interface CsvColumnGuess {
  dateIdx?: number
  amountIdx?: number
  memoIdx?: number
}

const DATE_RE = /date|posted|transaction|time/i
const AMT_RE = /amount|debit|credit|sum|value/i
const MEMO_RE = /memo|description|details|payee|name|merchant|note/i

export function guessCsvColumns(headers: string[]): CsvColumnGuess {
  const out: CsvColumnGuess = {}
  headers.forEach((raw, idx) => {
    const h = raw.trim()
    if (!h) return
    if (out.dateIdx === undefined && DATE_RE.test(h)) out.dateIdx = idx
    if (out.amountIdx === undefined && AMT_RE.test(h)) out.amountIdx = idx
    if (out.memoIdx === undefined && MEMO_RE.test(h)) out.memoIdx = idx
  })
  return out
}

/** Parse currency / accounting-style numbers; negatives may use parentheses. */
export function parseAmountCell(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const negParen = /^\(.*\)$/.test(s)
  const cleaned = s
    .replace(/^\((.*)\)$/, '$1')
    .replace(/[$€£,\s]/g, '')
    .replace(/^\+/, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return negParen ? -Math.abs(n) : n
}

function tryParseISODate(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  const isoLike = /^\d{4}-\d{2}-\d{2}/.test(t)
  const d = isoLike ? parseISO(t.slice(0, 10)) : parseISO(t)
  if (!isValid(d)) return null
  const y = d.getFullYear()
  if (y < 1990 || y > 2100) return null
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function parseDateCell(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const iso = tryParseISODate(t)
  if (iso) return iso

  const mdy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mdy) {
    let month = Number(mdy[1])
    let day = Number(mdy[2])
    let year = Number(mdy[3])
    if (year < 100) year += year >= 70 ? 1900 : 2000
    const d = new Date(year, month - 1, day)
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      const mm = String(month).padStart(2, '0')
      const dd = String(day).padStart(2, '0')
      return `${year}-${mm}-${dd}`
    }
  }
  return null
}

export interface BankImportRow {
  date: string
  amount: number
  note?: string
}

export interface RowToExpenseOptions {
  /** When true, positive amounts in the Amount column import as expenses (some exports only list debits as positive). */
  treatPositiveAsDebit?: boolean
}

/**
 * Build expense rows: by default only negative amounts (typical bank debits) import.
 * Skip zero and positive rows unless `treatPositiveAsDebit` is enabled.
 */
export function rowToExpenseCandidate(
  cells: string[],
  dateIdx: number,
  amountIdx: number,
  memoIdx: number | undefined,
  opts?: RowToExpenseOptions,
): BankImportRow | null {
  const dateRaw = cells[dateIdx]
  const amtRaw = cells[amountIdx]
  if (dateRaw === undefined || amtRaw === undefined) return null
  const date = parseDateCell(dateRaw)
  const signed = parseAmountCell(amtRaw)
  if (!date || signed === null || signed === 0) return null
  let expenseAmt: number | null = null
  if (signed < 0) expenseAmt = Math.abs(signed)
  else if (opts?.treatPositiveAsDebit) expenseAmt = signed
  if (expenseAmt === null || expenseAmt <= 0) return null
  let note: string | undefined
  if (memoIdx !== undefined && memoIdx >= 0) {
    const m = cells[memoIdx]?.trim()
    if (m) note = m.slice(0, 500)
  }
  return { date, amount: expenseAmt, note }
}
