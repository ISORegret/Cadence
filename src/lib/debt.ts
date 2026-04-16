/**
 * Estimate months to pay off fixed-rate debt with constant monthly payment.
 * Returns null if payment does not cover interest or inputs invalid.
 */
export function estimatePayoffMonths(
  principal: number,
  annualAprPercent: number,
  monthlyPayment: number,
): number | null {
  if (principal <= 0 || monthlyPayment <= 0) return null
  const monthlyRate = annualAprPercent / 100 / 12
  let balance = principal
  let months = 0
  const cap = 1200
  while (balance > 0.005 && months < cap) {
    const interest = balance * monthlyRate
    const toPrincipal = monthlyPayment - interest
    if (toPrincipal <= 0) return null
    balance -= toPrincipal
    months += 1
  }
  return months
}
