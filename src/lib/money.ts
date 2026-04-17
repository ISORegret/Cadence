import type { PaySettings } from '../types'

export function formatMoney(
  amount: number,
  settings: PaySettings | null,
): string {
  const currency = settings?.currencyCode?.trim() || 'USD'
  const loc = settings?.locale?.trim()
  try {
    return amount.toLocaleString(loc || undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    })
  } catch {
    try {
      return amount.toLocaleString(undefined, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      })
    } catch {
      return amount.toFixed(2)
    }
  }
}
