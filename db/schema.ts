import {
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

/**
 * A customer-filed enquiry from `request_quote.exe`. The `ref` is the shared
 * secret between us and the customer: it is what they type into
 * `access_quote.sh` to pull the record back up, so it is generated server-side
 * and kept unique.
 */
export const quoteRequests = pgTable('quote_requests', {
  id: serial().primaryKey(),
  ref: text().notNull().unique(),
  name: text().notNull(),
  email: text().notNull(),
  phone: text().notNull().default(''),
  partNo: text('part_no').notNull().default(''),
  vehicleId: text('vehicle_id').notNull().default(''),
  destinationCountry: text('destination_country').notNull().default(''),
  message: text().notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
})

/**
 * The priced answer an admin prepares for a request. A row existing here *is*
 * the "published" signal — until one exists, `access_quote.sh` reports the
 * order as still being processed.
 */
export const quotes = pgTable('quotes', {
  id: serial().primaryKey(),
  requestId: integer('request_id')
    .notNull()
    .unique()
    .references(() => quoteRequests.id),
  partName: text('part_name').notNull().default(''),
  partNo: text('part_no').notNull().default(''),
  vin: text().notNull().default(''),
  details: text().notNull().default(''),
  // Netlify Blobs key for the part photo, plus its mime type so the image
  // endpoint can serve it back with the right Content-Type.
  imageKey: text('image_key'),
  imageType: text('image_type'),
  currency: text().notNull().default('GBP'),
  partCost: numeric('part_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  // Sea freight. The column is still named `shipping_cost` — it predates there
  // being a second freight option, and renaming a column an applied migration
  // created buys nothing, so the rename lives here in the property name.
  seaFreightCost: numeric('shipping_cost', { precision: 12, scale: 2 })
    .notNull()
    .default('0'),
  // Air freight, deliberately nullable: quotes priced before air was offered
  // have no figure, and a null is what tells the customer's record to draw the
  // sea option alone rather than an air card reading zero.
  airFreightCost: numeric('air_freight_cost', { precision: 12, scale: 2 }),
  dutiesCost: numeric('duties_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  // The sea landed cost: part + sea freight + duties. Kept as `total_cost` so
  // rows written before air freight existed still read correctly. The air
  // landed cost is derived from `airFreightCost` rather than stored, so the two
  // can never drift apart.
  totalCost: numeric('total_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  leadTime: text('lead_time').notNull().default(''),
  notes: text().notNull().default(''),
  // Which freight option the customer accepted, recorded when they start
  // payment. Null until then.
  freightMethod: text('freight_method'),
  // The Paystack transaction reference for that attempt, so a payment can be
  // tied back to this record.
  paymentRef: text('payment_ref'),
  // Where the quote has got to: 'issued' until the admin marks it paid, at
  // which point `access_quote.sh` stops offering the payment link.
  state: text().notNull().default('issued'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export type QuoteRequestRow = typeof quoteRequests.$inferSelect
export type QuoteRow = typeof quotes.$inferSelect
