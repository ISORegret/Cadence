import { Capacitor } from '@capacitor/core'
import type { Outflow } from '../types'
import { downloadBlob, exportTextFileNative } from './downloadBlob'

function icsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .slice(0, 900)
}

/** Build RFC 5545 calendar with all-day events for each outflow date. */
export function buildWithdrawalsIcs(
  outflows: Outflow[],
  calendarName: string,
): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cadence//EN',
    `X-WR-CALNAME:${icsText(calendarName)}`,
  ]
  for (const o of outflows) {
    const uid = `${o.billId}-${o.date}@cadence-local`
    const meta = [o.category, o.note].filter(Boolean).join(' · ')
    const desc = meta ? `${meta} — ${o.amount}` : String(o.amount)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${o.date.replace(/-/g, '')}`,
      `SUMMARY:${icsText(o.name)}`,
      `DESCRIPTION:${icsText(desc)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export async function downloadIcs(filename: string, ics: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await exportTextFileNative(filename, ics)
    return
  }
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  await downloadBlob(filename, blob)
}
