import type { Outflow } from '../types'

export function sumByCategory(
  outflows: Outflow[],
): Map<string, number> {
  const m = new Map<string, number>()
  for (const o of outflows) {
    const c = (o.category || '').trim() || 'Uncategorized'
    m.set(c, (m.get(c) ?? 0) + o.amount)
  }
  return m
}

export function sumForCategory(outflows: Outflow[], category: string): number {
  const t = category.trim()
  return outflows
    .filter((o) => (o.category || '').trim() === t)
    .reduce((s, o) => s + o.amount, 0)
}

export function sumForEnvelope(
  outflows: Outflow[],
  envelopeId: string,
): number {
  return outflows
    .filter((o) => o.envelopeId === envelopeId)
    .reduce((s, o) => s + o.amount, 0)
}
