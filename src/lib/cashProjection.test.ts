import { describe, expect, it } from 'vitest'
import { projectedBalanceEndOfDay } from './cashProjection'
import type { OneOffItem, PaySettings } from '../types'

describe('projectedBalanceEndOfDay', () => {
  const paySettings: PaySettings = {
    frequency: 'biweekly',
    anchorPayDate: '2026-05-03',
    incomePerPaycheck: 1000,
  }
  const oneOffItems: OneOffItem[] = [
    {
      id: 'rent',
      name: 'Rent',
      amount: 300,
      date: '2026-05-02',
    },
  ]

  it('walks backward from a future anchor by reversing intervening cashflow', () => {
    expect(
      projectedBalanceEndOfDay(
        '2026-05-03',
        1200,
        '2026-05-01',
        paySettings,
        [],
        oneOffItems,
        [],
        [],
      ),
    ).toBe(500)
  })

  it('keeps backward and forward projections symmetric', () => {
    expect(
      projectedBalanceEndOfDay(
        '2026-05-01',
        500,
        '2026-05-03',
        paySettings,
        [],
        oneOffItems,
        [],
        [],
      ),
    ).toBe(1200)
  })
})
