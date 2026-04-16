import type { PaySettings } from '../types'

export function formatMoney(
  amount: number,
  settings: PaySettings | null,
): string {
  const currency = settings?.currencyCode?.trim() || 'USD'
  const loc = settings?.locale?.trim()
  return amount.toLocaleString(loc || undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  })
}
