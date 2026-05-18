import { describe, expect, it } from 'vitest'
import { paydayIncomeInOpenRange } from './payPeriod'
import type { PaySettings } from '../types'

describe('paydayIncomeInOpenRange', () => {
  it('uses the configured second paycheck amount for twice-monthly schedules', () => {
    const paySettings: PaySettings = {
      frequency: 'twice_monthly',
      anchorPayDate: '2026-05-01',
      twiceMonthlyDays: [1, 15],
      incomePerPaycheck: 1000,
      incomeSecondPaycheck: 1500,
    }

    expect(
      paydayIncomeInOpenRange(
        new Date(2026, 4, 1),
        new Date(2026, 4, 16),
        paySettings,
      ),
    ).toEqual([
      { iso: '2026-05-01', amount: 1000 },
      { iso: '2026-05-15', amount: 1500 },
    ])
  })
})
