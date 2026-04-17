import type { PayFrequency, PaySettings } from '../types'

const FREQUENCIES: PayFrequency[] = [
  'weekly',
  'biweekly',
  'monthly',
  'twice_monthly',
]

function intlCurrencyOk(currency: string, locale: string | undefined): boolean {
  try {
    ;(1).toLocaleString(locale || undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Normalizes pay settings from storage or backups so Intl formatting never throws
 * (invalid ISO 4217 codes and locales crash some WebViews with a blank screen).
 */
export function sanitizePaySettings(ps: PaySettings | null): PaySettings | null {
  if (!ps) return null
  const frequency = FREQUENCIES.includes(ps.frequency) ? ps.frequency : 'biweekly'

  let currencyCode = (ps.currencyCode || 'USD').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currencyCode)) currencyCode = 'USD'
  if (!intlCurrencyOk(currencyCode, undefined)) currencyCode = 'USD'

  let locale = ps.locale?.trim()
  if (locale === '') locale = undefined
  if (locale && !intlCurrencyOk(currencyCode, locale)) locale = undefined

  return { ...ps, frequency, currencyCode, locale }
}
