import type { QuoteRow } from '../../db/schema.js'
import { asFreightMethod, landedCosts } from './freight.js'
import { asQuoteState } from './quoteState.js'

/**
 * The published quote as both the customer's record and the admin console read
 * it. Shared so a new pricing field cannot reach one endpoint and miss the
 * other, and so the landed costs are worked out in exactly one place.
 * Mirrors `QuoteRecord` in src/lib/quote.ts.
 */
export function quotePayload(quote: QuoteRow) {
  const landed = landedCosts(quote)

  return {
    partName: quote.partName,
    partNo: quote.partNo,
    vin: quote.vin,
    details: quote.details,
    currency: quote.currency,
    partCost: quote.partCost,
    seaFreightCost: quote.seaFreightCost,
    airFreightCost: quote.airFreightCost,
    dutiesCost: quote.dutiesCost,
    totalCost: quote.totalCost,
    landedCostSea: landed.sea,
    landedCostAir: landed.air,
    freightMethod: asFreightMethod(quote.freightMethod),
    notes: quote.notes,
    state: asQuoteState(quote.state),
    hasImage: Boolean(quote.imageKey),
    updatedAt: quote.updatedAt,
  }
}
