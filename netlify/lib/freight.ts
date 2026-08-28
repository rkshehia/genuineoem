/**
 * The two freight options a published quote offers. Mirrors `FreightMethod` and
 * `FREIGHT_LEAD_TIMES` in src/lib/quote.ts — the functions cannot import from
 * the client bundle, so the pair has to be kept in step by hand.
 */
export type FreightMethod = 'air' | 'sea'

/**
 * Fixed per-method commitments rather than a figure an admin types per quote:
 * they are a property of how the part travels, not of the part.
 */
export const FREIGHT_LEAD_TIMES: Record<FreightMethod, string> = {
  air: '2-12 business days',
  sea: '40-45 days',
}

export const isFreightMethod = (value: unknown): value is FreightMethod =>
  value === 'air' || value === 'sea'

/** Anything unrecognised — an older row, a hand edit — reads back as null. */
export const asFreightMethod = (value: unknown): FreightMethod | null =>
  isFreightMethod(value) ? value : null

const amount = (value: string | null) => {
  if (value === null) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

type Pricing = {
  partCost: string
  dutiesCost: string
  seaFreightCost: string
  airFreightCost: string | null
}

/**
 * Landed cost per freight option: part + that option's freight + duties. Air
 * comes back null when the quote carries no air figure, which is what tells
 * the customer's record to offer sea alone.
 */
export function landedCosts(pricing: Pricing) {
  const part = amount(pricing.partCost) ?? 0
  const duties = amount(pricing.dutiesCost) ?? 0
  const sea = amount(pricing.seaFreightCost) ?? 0
  const air = amount(pricing.airFreightCost)

  return {
    sea: (part + sea + duties).toFixed(2),
    air: air === null ? null : (part + air + duties).toFixed(2),
  }
}

/** The landed cost the customer is agreeing to pay, or null if unavailable. */
export function landedCostFor(pricing: Pricing, method: FreightMethod) {
  const costs = landedCosts(pricing)
  return method === 'air' ? costs.air : costs.sea
}
