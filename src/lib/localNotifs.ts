import { Capacitor } from '@capacitor/core'
import {
  LocalNotifications,
  type LocalNotificationSchema,
} from '@capacitor/local-notifications'
import { addDays, format, isAfter, parseISO, startOfDay } from 'date-fns'
import { formatMoney } from './money'
import { listOutflowsInRange } from './payPeriod'
import type { AppPreferences, Bill, CalendarReminder, PaySettings } from '../types'

const ANDROID_CHANNEL = 'cadence_alerts'
/** Stable int32 for Android (same input → same id). */
export function reminderNotificationId(reminderId: string): number {
  let h = 0
  for (let i = 0; i < reminderId.length; i++) {
    h = (Math.imul(31, h) + reminderId.charCodeAt(i)) | 0
  }
  const n = h & 0x7fffffff
  return n === 0 ? 1 : n
}

const LOW_BALANCE_NOTIF_ID = 2_147_000_001

export async function ensureCadenceAndroidChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return
  await LocalNotifications.createChannel({
    id: ANDROID_CHANNEL,
    name: 'Cadence alerts',
    description: 'Reminders, bill due alerts, and low-balance alerts',
    importance: 4,
    visibility: 1,
  })
}

export type CadenceNotificationPermissionUi =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported'

/** Whether calendar / low-balance notifications are allowed (native or web). */
export async function getCadenceNotificationPermissionUi(): Promise<CadenceNotificationPermissionUi> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { display } = await LocalNotifications.checkPermissions()
      if (display === 'granted') return 'granted'
      if (display === 'denied') return 'denied'
      return 'prompt'
    } catch {
      return 'prompt'
    }
  }
  if (typeof globalThis.Notification === 'undefined') return 'unsupported'
  const p = globalThis.Notification.permission
  if (p === 'granted') return 'granted'
  if (p === 'denied') return 'denied'
  return 'prompt'
}

/**
 * Browser Notification.requestPermission — may return a Promise or a string
 * (legacy Safari). Do not chain `.then()` on the return value blindly.
 */
export async function requestWebNotificationPermission(): Promise<CadenceNotificationPermissionUi> {
  if (typeof globalThis.Notification === 'undefined') return 'unsupported'
  const req = globalThis.Notification.requestPermission
  if (typeof req !== 'function') return 'unsupported'
  try {
    const ret = req.call(globalThis.Notification) as
      | Promise<NotificationPermission>
      | NotificationPermission
    const raw =
      ret != null && typeof (ret as Promise<NotificationPermission>).then === 'function'
        ? await (ret as Promise<NotificationPermission>)
        : (ret as NotificationPermission)
    if (raw === 'granted') return 'granted'
    if (raw === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return 'unsupported'
  }
}

/** Request POST_NOTIFICATIONS etc. on Android / iOS. */
export async function requestLocalNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { display } = await LocalNotifications.requestPermissions()
    const ok = display === 'granted'
    try {
      await ensureCadenceAndroidChannel()
    } catch {
      /* channel creation is not required for the permission prompt */
    }
    return ok
  } catch {
    return false
  }
}

export async function syncCalendarRemindersToDevice(
  reminders: CalendarReminder[],
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const { display } = await LocalNotifications.checkPermissions()
  if (display !== 'granted') return
  try {
    await ensureCadenceAndroidChannel()
  } catch {
    return
  }

  const pending = await LocalNotifications.getPending()
  const fromExtra = pending.notifications
    .filter(
      (n) =>
        (n.extra as { cadence?: string } | undefined)?.cadence === 'reminder',
    )
    .map((n) => ({ id: n.id }))
  const fromIds = reminders.map((r) => ({ id: reminderNotificationId(r.id) }))
  const seen = new Set<number>()
  const uniqueCancel = [...fromExtra, ...fromIds].filter((x) => {
    if (seen.has(x.id)) return false
    seen.add(x.id)
    return true
  })
  if (uniqueCancel.length > 0) {
    await LocalNotifications.cancel({ notifications: uniqueCancel })
  }

  const now = new Date()
  const notifications: LocalNotificationSchema[] = []

  for (const r of reminders) {
    const remindAt = parseISO(r.remindAt)
    const snoozeAt = r.snoozedUntil ? parseISO(r.snoozedUntil) : null
    let at: Date | null = null
    if (snoozeAt && isAfter(snoozeAt, now)) at = snoozeAt
    else if (isAfter(remindAt, now)) at = remindAt
    if (!at) continue

    const n: LocalNotificationSchema = {
      id: reminderNotificationId(r.id),
      title: r.title.trim() || 'Cadence reminder',
      body: (r.body.trim() || 'Open Cadence').slice(0, 240),
      schedule: { at, allowWhileIdle: true },
      extra: { cadence: 'reminder', reminderId: r.id },
    }
    if (Capacitor.getPlatform() === 'android') n.channelId = ANDROID_CHANNEL
    notifications.push(n)
  }

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications })
  }
}

const BILL_DUE_ALERT_HOUR = 9
/** How far ahead to schedule bill notifications (matches typical local-notif limits). */
const BILL_DUE_WINDOW_DAYS = 90
const MAX_BILL_DUE_NOTIFICATIONS = 64

function billDueNotificationId(billId: string, dueDate: string): number {
  const s = `billDue|${billId}|${dueDate}`
  let h = 0x13579bdf
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  const n = h & 0x7fffffff
  if (n === 0 || n === LOW_BALANCE_NOTIF_ID) return n + 3
  return n
}

function alertAtForBillDue(dueYmd: string, daysBefore: number): Date {
  const parts = dueYmd.split('-').map((x) => Number(x))
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return new Date(0)
  }
  const [y, mo, d] = parts
  const due = new Date(y, mo - 1, d)
  const day = addDays(due, -daysBefore)
  const at = new Date(day)
  at.setHours(BILL_DUE_ALERT_HOUR, 0, 0, 0)
  return at
}

/**
 * Schedules local notifications for upcoming bill withdrawals (native only).
 * Clears previous bill-due schedules whenever preferences or bills change.
 */
export async function syncBillDueAlertsToDevice(
  bills: Bill[],
  paySettings: PaySettings | null,
  prefs: Pick<AppPreferences, 'billDueAlertsEnabled' | 'billDueAlertDaysBefore'>,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const { display } = await LocalNotifications.checkPermissions()
  if (display !== 'granted') return
  try {
    await ensureCadenceAndroidChannel()
  } catch {
    return
  }

  const pending = await LocalNotifications.getPending()
  const billDuePending = pending.notifications
    .filter(
      (n) =>
        (n.extra as { cadence?: string } | undefined)?.cadence === 'billDue',
    )
    .map((n) => ({ id: n.id }))
  if (billDuePending.length > 0) {
    await LocalNotifications.cancel({ notifications: billDuePending })
  }

  if (prefs.billDueAlertsEnabled !== true || !paySettings) {
    return
  }

  const raw = prefs.billDueAlertDaysBefore
  const daysBefore = Math.min(
    14,
    Math.max(0, Math.floor(typeof raw === 'number' && !Number.isNaN(raw) ? raw : 1)),
  )

  const now = new Date()
  const rangeStart = startOfDay(now)
  const rangeEnd = addDays(rangeStart, BILL_DUE_WINDOW_DAYS)

  const flows = listOutflowsInRange(bills, rangeStart, rangeEnd).filter(
    (o) => o.source === 'bill',
  )
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  const slice = sorted.slice(0, MAX_BILL_DUE_NOTIFICATIONS)

  const notifications: LocalNotificationSchema[] = []

  for (const o of slice) {
    const at = alertAtForBillDue(o.date, daysBefore)
    if (!isAfter(at, now)) continue

    const id = billDueNotificationId(o.billId, o.date)
    const dueLabel = format(parseISO(o.date), 'MMM d, yyyy')
    const amount = formatMoney(o.amount, paySettings)
    const title = `Bill: ${o.name.trim() || 'Scheduled bill'}`.slice(0, 80)
    const body = `${amount} · Due ${dueLabel}`.slice(0, 240)

    const n: LocalNotificationSchema = {
      id,
      title,
      body,
      schedule: { at, allowWhileIdle: true },
      extra: { cadence: 'billDue', billId: o.billId, dueDate: o.date },
    }
    if (Capacitor.getPlatform() === 'android') n.channelId = ANDROID_CHANNEL
    notifications.push(n)
  }

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications })
  }
}

export async function fireLowBalanceLocalNotification(body: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const { display } = await LocalNotifications.checkPermissions()
  if (display !== 'granted') return
  try {
    await ensureCadenceAndroidChannel()
  } catch {
    return
  }
  await LocalNotifications.cancel({
    notifications: [{ id: LOW_BALANCE_NOTIF_ID }],
  })
  const at = new Date(Date.now() + 1200)
  const n: LocalNotificationSchema = {
    id: LOW_BALANCE_NOTIF_ID,
    title: 'Cadence — low projected balance',
    body: body.slice(0, 240),
    schedule: { at, allowWhileIdle: true },
    extra: { cadence: 'lowBalance' },
  }
  if (Capacitor.getPlatform() === 'android') n.channelId = ANDROID_CHANNEL
  await LocalNotifications.schedule({ notifications: [n] })
}
