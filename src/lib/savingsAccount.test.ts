import { describe, expect, it } from 'vitest'
import { projectedSavingsBalanceEndOfDay } from './savingsAccount'
import type { SavingsAccountTransfer } from '../types'

describe('projectedSavingsBalanceEndOfDay', () => {
  it('walks backward from a future savings anchor by reversing transfers', () => {
    const transfers: SavingsAccountTransfer[] = [
      {
        id: 'save',
        date: '2026-05-02',
        amount: 300,
        direction: 'to_savings',
      },
      {
        id: 'withdraw',
        date: '2026-05-03',
        amount: 100,
        direction: 'from_savings',
      },
    ]

    expect(
      projectedSavingsBalanceEndOfDay(
        '2026-05-03',
        1200,
        '2026-05-01',
        transfers,
      ),
    ).toBe(1000)
  })
})
