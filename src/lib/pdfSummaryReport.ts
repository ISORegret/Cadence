import { format } from 'date-fns'
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { sumByCategory } from './budgetMath'
import { downloadBlob } from './downloadBlob'
import { formatMoney } from './money'
import {
  getCurrentPayPeriod,
  incomeForPeriodStarting,
  listExpenseOutflowsInRange,
  listOneOffOutflowsInRange,
  listOutflowsInRange,
  mergeAllOutflowLists,
  paidKeyForOutflow,
  totalAmount,
} from './payPeriod'
import { getStartingFunds } from './startingFunds'
import type {
  AppPreferences,
  Bill,
  BillRecurrence,
  BillSchedule,
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
  SavingsGoal,
} from '../types'

/** Brand-aligned palette (teal / slate) */
const C = {
  brand: [13, 148, 136] as [number, number, number],
  brandDark: [15, 118, 110] as [number, number, number],
  slate800: [30, 41, 59] as [number, number, number],
  slate600: [71, 85, 105] as [number, number, number],
  slate100: [241, 245, 249] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  band: [240, 253, 250] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
}

const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

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
      return `One-time on ${s.date} · ${recurrenceLabel(rec)}`
    case 'monthly':
      base = `Monthly on day ${s.dayOfMonth}`
      break
    case 'weekly':
      base = `Weekly on ${weekdays[s.dayOfWeek] ?? '—'}`
      break
    case 'biweekly':
      base = `Every 2 weeks (from ${s.anchorDate})`
      break
    default:
      base = ''
  }
  return `${base} · ${recurrenceLabel(rec)}`
}

function payFrequencyLabel(ps: PaySettings): string {
  switch (ps.frequency) {
    case 'weekly':
      return 'Weekly'
    case 'biweekly':
      return 'Biweekly'
    case 'monthly':
      return 'Monthly'
    case 'twice_monthly':
      return 'Twice monthly'
    default:
      return String(ps.frequency)
  }
}

function trunc(s: string, max: number): string {
  const t = s.replace(/\r\n/g, '\n')
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function envName(envelopes: Envelope[], id?: string): string {
  if (!id?.trim()) return '—'
  return envelopes.find((e) => e.id === id)?.name ?? id
}

function getFinalY(doc: jsPDF): number {
  const last = (doc as jsPDF & { lastAutoTable?: { finalY: number } })
    .lastAutoTable
  return last?.finalY ?? 48
}

export type CadenceSummaryPdfInput = {
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
  preferences: AppPreferences
  paidOutflowKeys: string[]
}

export async function downloadCadenceSummaryPdf(
  data: CadenceSummaryPdfInput,
): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const margin = 48
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const innerW = pageW - 2 * margin

  /** Keep tables above the footer rule + page label (was overlapping rows when 0). */
  const tableMargin = {
    left: margin,
    right: margin,
    top: 0,
    bottom: 58,
  } as const

  const money = (n: number) => formatMoney(n, data.paySettings)

  const drawCover = () => {
    const bandH = 108
    doc.setFillColor(...C.brand)
    doc.rect(0, 0, pageW, bandH, 'F')
    doc.setDrawColor(...C.brandDark)
    doc.setLineWidth(1)
    doc.line(0, bandH, pageW, bandH)

    doc.setTextColor(...C.white)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(28)
    doc.text('Cadence', margin, 48)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(13)
    doc.text('Financial summary report', margin, 72)
    doc.setFontSize(9)
    doc.setTextColor(220, 245, 243)
    doc.text(
      `Generated ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")} (local time)`,
      margin,
      92,
    )
    doc.setTextColor(51, 65, 85)
    doc.setFontSize(10)
    return bandH + 28
  }

  let y = drawCover()

  autoTable(doc, {
    startY: y,
    margin: { ...tableMargin },
    body: [
      [
        'Only sections where you have something to show are included below (empty categories are omitted). Amounts use your currency and locale from Settings.',
      ],
    ],
    theme: 'plain',
    styles: {
      fontSize: 9,
      textColor: C.slate600,
      cellPadding: 12,
      fillColor: C.slate100,
      lineColor: C.border,
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: innerW },
    },
  })
  y = getFinalY(doc) + 18

  const sectionBanner = (title: string) => {
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      body: [[title]],
      theme: 'plain',
      styles: {
        fillColor: C.band,
        textColor: C.brandDark,
        fontStyle: 'bold',
        fontSize: 11,
        cellPadding: { top: 8, bottom: 8, left: 10, right: 10 },
        lineColor: [167, 243, 208],
        lineWidth: 0.75,
      },
      columnStyles: { 0: { cellWidth: innerW } },
    })
    y = getFinalY(doc) + 10
  }

  const kv = (rows: [string, string][]) => {
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      body: rows,
      theme: 'striped',
      styles: {
        fontSize: 9,
        cellPadding: 6,
        textColor: C.slate800,
        lineColor: C.border,
      },
      headStyles: { fillColor: C.slate800, textColor: C.white, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      columnStyles: {
        0: { cellWidth: 128, fontStyle: 'bold', textColor: C.slate600 },
        1: { cellWidth: innerW - 128, overflow: 'linebreak' },
      },
    })
    y = getFinalY(doc) + 16
  }

  if (data.paySettings) {
    sectionBanner('Pay schedule')
    const ps = data.paySettings
    const payRows: [string, string][] = [
      ['Frequency', payFrequencyLabel(ps)],
      ['Anchor pay date', ps.anchorPayDate],
    ]
    if (ps.frequency === 'monthly' && ps.monthlyPayDay != null) {
      payRows.push(['Monthly pay day', String(ps.monthlyPayDay)])
    }
    if (ps.frequency === 'twice_monthly' && ps.twiceMonthlyDays) {
      payRows.push([
        'Twice-monthly days',
        `${ps.twiceMonthlyDays[0]}, ${ps.twiceMonthlyDays[1]}`,
      ])
    }
    if (
      typeof ps.incomePerPaycheck === 'number' &&
      !Number.isNaN(ps.incomePerPaycheck)
    ) {
      payRows.push(['Income per paycheck', money(ps.incomePerPaycheck)])
    }
    if (
      typeof ps.incomeSecondPaycheck === 'number' &&
      !Number.isNaN(ps.incomeSecondPaycheck)
    ) {
      payRows.push([
        'Income (second paycheck)',
        money(ps.incomeSecondPaycheck),
      ])
    }
    const sf = getStartingFunds(ps, data.preferences)
    if (
      sf.date != null &&
      sf.amount != null &&
      typeof sf.amount === 'number' &&
      !Number.isNaN(sf.amount)
    ) {
      payRows.push([
        `Starting funds (as of ${sf.date})`,
        money(sf.amount),
      ])
    }
    payRows.push([
      'Currency / locale',
      `${ps.currencyCode?.trim() || 'USD'} · ${ps.locale?.trim() || 'default'}`,
    ])
    kv(payRows)
  }

  if (data.paySettings) {
    const today = new Date()
    const period = getCurrentPayPeriod(today, data.paySettings)
    const billFlows = listOutflowsInRange(
      data.bills,
      period.intervalStart,
      period.intervalEndExclusive,
    )
    const oneOffFlows = listOneOffOutflowsInRange(
      data.oneOffItems,
      period.intervalStart,
      period.intervalEndExclusive,
    )
    const expenseFlows = listExpenseOutflowsInRange(
      data.expenseEntries,
      period.intervalStart,
      period.intervalEndExclusive,
    )
    const allOutflows = mergeAllOutflowLists([
      billFlows,
      oneOffFlows,
      expenseFlows,
    ])
    const unpaid = allOutflows.filter(
      (o) => !data.paidOutflowKeys.includes(paidKeyForOutflow(o)),
    )
    const base = incomeForPeriodStarting(period.lastPayday, data.paySettings)
    const extra = data.incomeLines.reduce((s, x) => s + x.amount, 0)
    const inc =
      base !== null && typeof base === 'number' && !Number.isNaN(base)
        ? base + extra
        : extra > 0
          ? extra
          : null

    sectionBanner('Current pay period (snapshot)')
    const snapRows: [string, string][] = [
      [
        'Pay window',
        `${format(period.intervalStart, 'MMM d, yyyy')} → next payday ${format(period.nextPayday, 'MMM d, yyyy')}`,
      ],
      [
        'Total scheduled (this window)',
        money(totalAmount(allOutflows)),
      ],
      ['Still due (unpaid)', money(totalAmount(unpaid))],
    ]
    if (inc !== null) {
      snapRows.push([
        'Income (take-home + extra lines)',
        money(inc),
      ])
    } else {
      snapRows.push([
        'Income',
        'Add take-home under Pay schedule (and optional extra lines) for a full total.',
      ])
    }
    kv(snapRows)

    const byCat = sumByCategory(allOutflows)
    if (byCat.size > 0) {
      sectionBanner('Spending by category (this period)')
      autoTable(doc, {
        startY: y,
        margin: { ...tableMargin },
        rowPageBreak: 'avoid',
        head: [['Category', 'Amount']],
        body: [...byCat.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([cat, amt]) => [cat, money(amt)]),
        theme: 'striped',
        headStyles: {
          fillColor: C.slate800,
          textColor: C.white,
          fontStyle: 'bold',
          fontSize: 9,
        },
        styles: {
          fontSize: 9,
          cellPadding: 6,
          lineColor: C.border,
        },
        columnStyles: {
          0: { cellWidth: innerW * 0.62 },
          1: { cellWidth: innerW * 0.38, halign: 'right', font: 'courier' },
        },
        showHead: 'everyPage',
      })
      y = getFinalY(doc) + 16
    }
  }

  if (data.bills.length > 0) {
    sectionBanner(`Bills (${data.bills.length})`)
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      rowPageBreak: 'avoid',
      head: [['Name', 'Amount', 'Schedule', 'Category', 'Envelope', 'Notes']],
      body: [...data.bills]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((bill) => [
          bill.name,
          money(bill.amount),
          trunc(scheduleLabel(bill.schedule, bill.recurrence), 90),
          bill.category?.trim() || '—',
          envName(data.envelopes, bill.envelopeId),
          bill.note?.trim() ? trunc(bill.note, 120) : '—',
        ]),
      theme: 'striped',
      headStyles: {
        fillColor: C.slate800,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: {
        fontSize: 8,
        cellPadding: 4,
        overflow: 'linebreak',
        lineColor: C.border,
      },
      columnStyles: {
        0: { cellWidth: innerW * 0.2 },
        1: { cellWidth: innerW * 0.12, halign: 'right', font: 'courier' },
        2: { cellWidth: innerW * 0.26 },
        3: { cellWidth: innerW * 0.12 },
        4: { cellWidth: innerW * 0.14 },
        5: { cellWidth: innerW * 0.16 },
      },
      showHead: 'everyPage',
    })
    y = getFinalY(doc) + 16
  }

  if (data.envelopes.length > 0) {
    sectionBanner(`Envelopes (${data.envelopes.length})`)
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      head: [['Name']],
      body: [...data.envelopes]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => [e.name]),
      theme: 'striped',
      headStyles: {
        fillColor: C.slate800,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 9,
      },
      styles: { fontSize: 9, cellPadding: 5, lineColor: C.border },
      columnStyles: { 0: { cellWidth: innerW } },
    })
    y = getFinalY(doc) + 16
  }

  if (data.oneOffItems.length > 0) {
    sectionBanner(`One-off withdrawals (${data.oneOffItems.length})`)
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      rowPageBreak: 'avoid',
      head: [['Date', 'Name', 'Amount', 'Category', 'Envelope', 'Note']],
      body: [...data.oneOffItems]
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
        )
        .map((o) => [
          o.date,
          o.name,
          money(o.amount),
          o.category?.trim() || '—',
          envName(data.envelopes, o.envelopeId),
          o.note?.trim() ? trunc(o.note, 80) : '—',
        ]),
      theme: 'striped',
      headStyles: {
        fillColor: C.slate800,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', lineColor: C.border },
      columnStyles: {
        0: { cellWidth: innerW * 0.14, font: 'courier' },
        1: { cellWidth: innerW * 0.22 },
        2: { cellWidth: innerW * 0.14, halign: 'right', font: 'courier' },
        3: { cellWidth: innerW * 0.14 },
        4: { cellWidth: innerW * 0.16 },
        5: { cellWidth: innerW * 0.2 },
      },
      showHead: 'everyPage',
    })
    y = getFinalY(doc) + 16
  }

  if (data.expenseEntries.length > 0) {
    sectionBanner(`Quick expense entries (${data.expenseEntries.length})`)
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      rowPageBreak: 'avoid',
      head: [['Date', 'Amount', 'Description', 'Category', 'Envelope']],
      body: [...data.expenseEntries]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => [
          e.date,
          money(e.amount),
          e.note?.trim() ? trunc(e.note, 100) : '—',
          e.category?.trim() || '—',
          envName(data.envelopes, e.envelopeId),
        ]),
      theme: 'striped',
      headStyles: {
        fillColor: C.slate800,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', lineColor: C.border },
      columnStyles: {
        0: { cellWidth: innerW * 0.14, font: 'courier' },
        1: { cellWidth: innerW * 0.14, halign: 'right', font: 'courier' },
        2: { cellWidth: innerW * 0.32 },
        3: { cellWidth: innerW * 0.18 },
        4: { cellWidth: innerW * 0.22 },
      },
      showHead: 'everyPage',
    })
    y = getFinalY(doc) + 16
  }

  if (data.incomeLines.length > 0) {
    sectionBanner(`Extra income lines (${data.incomeLines.length})`)
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      head: [['Label', 'Amount']],
      body: data.incomeLines.map((row) => [row.label, money(row.amount)]),
      theme: 'striped',
      headStyles: {
        fillColor: C.slate800,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 9,
      },
      styles: { fontSize: 9, cellPadding: 5, lineColor: C.border },
      columnStyles: {
        0: { cellWidth: innerW * 0.65 },
        1: { cellWidth: innerW * 0.35, halign: 'right', font: 'courier' },
      },
    })
    y = getFinalY(doc) + 16
  }

  if (data.periodBudgets.length > 0) {
    sectionBanner(`Period budgets (${data.periodBudgets.length})`)
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      rowPageBreak: 'avoid',
      head: [['Period start', 'Period end', 'Type', 'Target', 'Budgeted']],
      body: [...data.periodBudgets]
        .sort(
          (a, b) =>
            a.periodStart.localeCompare(b.periodStart) ||
            a.targetKey.localeCompare(b.targetKey),
        )
        .map((row) => [
          row.periodStart,
          row.periodEndExclusive,
          row.targetType,
          row.targetKey,
          money(row.budgeted),
        ]),
      theme: 'striped',
      headStyles: {
        fillColor: C.slate800,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: { fontSize: 8, cellPadding: 4, lineColor: C.border },
      columnStyles: {
        0: { cellWidth: innerW * 0.18, font: 'courier' },
        1: { cellWidth: innerW * 0.18, font: 'courier' },
        2: { cellWidth: innerW * 0.14 },
        3: { cellWidth: innerW * 0.3 },
        4: { cellWidth: innerW * 0.2, halign: 'right', font: 'courier' },
      },
      showHead: 'everyPage',
    })
    y = getFinalY(doc) + 16
  }

  if (data.savingsGoals.length > 0) {
    sectionBanner(`Savings goals (${data.savingsGoals.length})`)
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      head: [['Goal', 'Saved', 'Target', 'Progress', 'Target date']],
      body: data.savingsGoals.map((g) => {
        const pct =
          g.targetAmount > 0
            ? `${Math.min(100, Math.round((g.savedAmount / g.targetAmount) * 100))}%`
            : '—'
        return [
          g.name,
          money(g.savedAmount),
          money(g.targetAmount),
          pct,
          g.targetDate ?? '—',
        ]
      }),
      theme: 'striped',
      headStyles: {
        fillColor: C.slate800,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: { fontSize: 8, cellPadding: 4, lineColor: C.border },
      columnStyles: {
        0: { cellWidth: innerW * 0.28 },
        1: { cellWidth: innerW * 0.18, halign: 'right', font: 'courier' },
        2: { cellWidth: innerW * 0.18, halign: 'right', font: 'courier' },
        3: { cellWidth: innerW * 0.12, halign: 'center' },
        4: { cellWidth: innerW * 0.24, font: 'courier' },
      },
    })
    y = getFinalY(doc) + 16
  }

  if (data.envelopeTransfers.length > 0) {
    sectionBanner(`Envelope transfers (${data.envelopeTransfers.length})`)
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      rowPageBreak: 'avoid',
      head: [['Date', 'Amount', 'From', 'To', 'Note']],
      body: [...data.envelopeTransfers]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((t) => [
          t.date,
          money(t.amount),
          envName(data.envelopes, t.fromEnvelopeId),
          envName(data.envelopes, t.toEnvelopeId),
          t.note?.trim() ? trunc(t.note, 60) : '—',
        ]),
      theme: 'striped',
      headStyles: {
        fillColor: C.slate800,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', lineColor: C.border },
      columnStyles: {
        0: { cellWidth: innerW * 0.14, font: 'courier' },
        1: { cellWidth: innerW * 0.14, halign: 'right', font: 'courier' },
        2: { cellWidth: innerW * 0.2 },
        3: { cellWidth: innerW * 0.2 },
        4: { cellWidth: innerW * 0.32 },
      },
      showHead: 'everyPage',
    })
    y = getFinalY(doc) + 16
  }

  if (data.periodNotes.length > 0) {
    sectionBanner(`Pay period notes (${data.periodNotes.length})`)
    for (const n of [...data.periodNotes].sort((a, b) =>
      a.periodStart.localeCompare(b.periodStart),
    )) {
      autoTable(doc, {
        startY: y,
        margin: { ...tableMargin },
        body: [
          [
            {
              content: `${n.periodStart} → ${n.periodEndExclusive}`,
              colSpan: 1,
              styles: {
                fillColor: C.slate100,
                fontStyle: 'bold',
                textColor: C.brandDark,
                fontSize: 9,
              },
            },
          ],
          [
            {
              content: n.body?.trim() ? trunc(n.body, 6000) : '(empty)',
              styles: {
                fontSize: 9,
                overflow: 'linebreak',
                cellPadding: 8,
              },
            },
          ],
        ],
        theme: 'plain',
        styles: { lineColor: C.border, lineWidth: 0.5 },
        columnStyles: { 0: { cellWidth: innerW } },
      })
      y = getFinalY(doc) + 12
    }
  }

  const reminders: CalendarReminder[] = data.preferences.calendarReminders ?? []
  if (reminders.length > 0) {
    sectionBanner(`Calendar reminders (${reminders.length})`)
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      rowPageBreak: 'avoid',
      head: [['When', 'Title', 'Details']],
      body: [...reminders]
        .sort((a, b) => a.remindAt.localeCompare(b.remindAt))
        .map((r) => [
          r.remindAt.replace('T', ' '),
          r.title,
          r.body?.trim() ? trunc(r.body, 200) : '—',
        ]),
      theme: 'striped',
      headStyles: {
        fillColor: C.slate800,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', lineColor: C.border },
      columnStyles: {
        0: { cellWidth: innerW * 0.22, font: 'courier' },
        1: { cellWidth: innerW * 0.28 },
        2: { cellWidth: innerW * 0.5 },
      },
      showHead: 'everyPage',
    })
    y = getFinalY(doc) + 16
  }

  if (data.quickExpenseTemplates.length > 0) {
    sectionBanner(`Quick expense templates (${data.quickExpenseTemplates.length})`)
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      head: [['Label', 'Amount', 'Category', 'Envelope']],
      body: data.quickExpenseTemplates.map((t) => [
        t.label,
        money(t.amount),
        t.category?.trim() || '—',
        envName(data.envelopes, t.envelopeId),
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: C.slate800,
        textColor: C.white,
        fontStyle: 'bold',
        fontSize: 9,
      },
      styles: { fontSize: 9, cellPadding: 5, lineColor: C.border },
      columnStyles: {
        0: { cellWidth: innerW * 0.32 },
        1: { cellWidth: innerW * 0.18, halign: 'right', font: 'courier' },
        2: { cellWidth: innerW * 0.22 },
        3: { cellWidth: innerW * 0.28 },
      },
    })
    y = getFinalY(doc) + 16
  }

  sectionBanner('App preferences')
  kv([
    ['Theme', data.preferences.theme],
    [
      'Last backup export',
      data.preferences.lastExportAt ?? 'never',
    ],
    [
      'Low-balance alert',
      `${data.preferences.lowBalanceAlertEnabled ? 'On' : 'Off'}${
        typeof data.preferences.lowBalanceThreshold === 'number'
          ? ` · threshold ${money(data.preferences.lowBalanceThreshold)}`
          : ''
      }`,
    ],
  ])

  if (data.paidOutflowKeys.length > 0) {
    sectionBanner('Paid withdrawal markers')
    const sample = data.paidOutflowKeys.slice(0, 40)
    const paidBody: string[][] = [
      [
        `Total marked paid: ${data.paidOutflowKeys.length} (Summary checkboxes).`,
      ],
    ]
    if (sample.length > 0) {
      paidBody.push(['Sample keys (up to 40):'])
      for (const k of sample) paidBody.push([k])
    }
    if (data.paidOutflowKeys.length > 40) {
      paidBody.push(['… additional keys omitted.'])
    }
    autoTable(doc, {
      startY: y,
      margin: { ...tableMargin },
      body: paidBody,
      theme: 'plain',
      styles: {
        fontSize: 8,
        cellPadding: 5,
        textColor: C.slate600,
        overflow: 'linebreak',
      },
      columnStyles: { 0: { cellWidth: innerW } },
    })
    y = getFinalY(doc) + 8
  }

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.slate600)
    doc.text(
      `Cadence · Confidential · Page ${i} of ${totalPages}`,
      margin,
      pageH - 24,
    )
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.25)
    doc.line(margin, pageH - 34, pageW - margin, pageH - 34)
    doc.setTextColor(0, 0, 0)
  }

  const pdfName = `cadence-summary-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`
  const blob = doc.output('blob')
  await downloadBlob(pdfName, blob)
}
