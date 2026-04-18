import {
  differenceInCalendarDays,
  endOfMonth,
  startOfDay,
  startOfMonth,
} from 'date-fns'
import type { CurrentPayPeriod } from './payPeriod'
import { payPeriodInclusiveLastDay } from './payPeriod'

/** Progress through the current calendar month (day of month / length). */
export function calendarMonthTimeline(today: Date): {
  dayOfMonth: number
  daysInMonth: number
} {
  const t = startOfDay(today)
  const start = startOfMonth(t)
  const end = endOfMonth(t)
  const daysInMonth = differenceInCalendarDays(end, start) + 1
  return { dayOfMonth: t.getDate(), daysInMonth }
}

export type PayPeriodTimeline =
  | {
      kind: 'live'
      /** 1-based day index inside the inclusive pay period */
      dayOfPeriod: number
      totalDays: number
      /** Calendar days from today until next payday */
      daysUntilPayday: number
    }
  | {
      kind: 'other_view'
      totalDays: number
      /** Human hint when not viewing the live period */
      hint: string
    }

export function payPeriodTimeline(
  today: Date,
  viewed: CurrentPayPeriod,
  viewingLivePeriod: boolean,
): PayPeriodTimeline {
  const t = startOfDay(today)
  const start = startOfDay(viewed.intervalStart)
  const lastDay = startOfDay(payPeriodInclusiveLastDay(viewed))
  const totalDays = Math.max(1, differenceInCalendarDays(lastDay, start) + 1)
  const nextPay = startOfDay(viewed.nextPayday)

  if (!viewingLivePeriod) {
    return {
      kind: 'other_view',
      totalDays,
      hint: 'Totals below are for the dates in the title.',
    }
  }

  const daysUntilPayday = Math.max(0, differenceInCalendarDays(nextPay, t))
  const dayOfPeriod = differenceInCalendarDays(t, start) + 1
  const clampedDay = Math.min(totalDays, Math.max(1, dayOfPeriod))

  return {
    kind: 'live',
    dayOfPeriod: clampedDay,
    totalDays,
    daysUntilPayday,
  }
}
