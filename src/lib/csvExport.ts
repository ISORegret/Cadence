import { Capacitor } from '@capacitor/core'
import type {
  Bill,
  Envelope,
  EnvelopeTransfer,
  ExpenseEntry,
  IncomeLine,
  OneOffItem,
  PaySettings,
  PeriodBudgetRow,
  PeriodNote,
  QuickExpenseTemplate,
  SavingsGoal,
} from '../types'
import { downloadBlob, exportTextFileNative } from './downloadBlob'

function esc(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function row(cells: (string | number)[]): string {
  return cells.map((c) => esc(String(c))).join(',')
}

export function buildFinanceCsv(payload: {
  paySettings: PaySettings | null
  bills: Bill[]
  envelopes: Envelope[]
  oneOffItems: OneOffItem[]
  expenseEntries: ExpenseEntry[]
  incomeLines: IncomeLine[]
  periodBudgets: PeriodBudgetRow[]
  savingsGoals: SavingsGoal[]
  envelopeTransfers: EnvelopeTransfer[]
  periodNotes: PeriodNote[]
  quickExpenseTemplates: QuickExpenseTemplate[]
}): string {
  const lines: string[] = []

  lines.push('SECTION,pay_settings')
  lines.push(
    row([
      'frequency',
      'anchorPayDate',
      'incomePerPaycheck',
      'incomeSecondPaycheck',
      'startingFundsDate',
      'startingFundsAmount',
      'currencyCode',
    ]),
  )
  if (payload.paySettings) {
    const p = payload.paySettings
    lines.push(
      row([
        p.frequency,
        p.anchorPayDate,
        p.incomePerPaycheck ?? '',
        p.incomeSecondPaycheck ?? '',
        p.startingFundsDate ?? '',
        p.startingFundsAmount ?? '',
        p.currencyCode ?? '',
      ]),
    )
  }

  lines.push('SECTION,bills')
  lines.push(row(['id', 'name', 'amount', 'category', 'envelopeId', 'note']))
  for (const b of payload.bills) {
    lines.push(
      row([
        b.id,
        b.name,
        b.amount,
        b.category ?? '',
        b.envelopeId ?? '',
        b.note ?? '',
      ]),
    )
  }

  lines.push('SECTION,one_offs')
  lines.push(row(['id', 'name', 'amount', 'date', 'category']))
  for (const o of payload.oneOffItems) {
    lines.push(
      row([o.id, o.name, o.amount, o.date, o.category ?? '']),
    )
  }

  lines.push('SECTION,expenses')
  lines.push(row(['id', 'amount', 'date', 'category', 'note']))
  for (const e of payload.expenseEntries) {
    lines.push(
      row([e.id, e.amount, e.date, e.category ?? '', e.note ?? '']),
    )
  }

  lines.push('SECTION,income_lines')
  lines.push(row(['id', 'label', 'amount']))
  for (const i of payload.incomeLines) {
    lines.push(row([i.id, i.label, i.amount]))
  }

  lines.push('SECTION,envelopes')
  lines.push(row(['id', 'name']))
  for (const e of payload.envelopes) {
    lines.push(row([e.id, e.name]))
  }

  lines.push('SECTION,period_budgets')
  lines.push(
    row([
      'periodStart',
      'periodEndExclusive',
      'targetType',
      'targetKey',
      'budgeted',
    ]),
  )
  for (const p of payload.periodBudgets) {
    lines.push(
      row([
        p.periodStart,
        p.periodEndExclusive,
        p.targetType,
        p.targetKey,
        p.budgeted,
      ]),
    )
  }

  lines.push('SECTION,savings_goals')
  lines.push(row(['name', 'targetAmount', 'savedAmount', 'targetDate']))
  for (const g of payload.savingsGoals) {
    lines.push(
      row([g.name, g.targetAmount, g.savedAmount, g.targetDate ?? '']),
    )
  }

  lines.push('SECTION,envelope_transfers')
  lines.push(
    row(['date', 'amount', 'fromEnvelopeId', 'toEnvelopeId', 'note']),
  )
  for (const t of payload.envelopeTransfers) {
    lines.push(
      row([
        t.date,
        t.amount,
        t.fromEnvelopeId,
        t.toEnvelopeId,
        t.note ?? '',
      ]),
    )
  }

  lines.push('SECTION,period_notes')
  lines.push(row(['periodStart', 'periodEndExclusive', 'body']))
  for (const n of payload.periodNotes) {
    lines.push(row([n.periodStart, n.periodEndExclusive, n.body]))
  }

  lines.push('SECTION,quick_expense_templates')
  lines.push(row(['label', 'amount', 'category', 'envelopeId']))
  for (const q of payload.quickExpenseTemplates) {
    lines.push(
      row([q.label, q.amount, q.category ?? '', q.envelopeId ?? '']),
    )
  }

  return lines.join('\n')
}

export async function downloadCsv(filename: string, csv: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await exportTextFileNative(filename, csv)
    return
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  await downloadBlob(filename, blob)
}
