import { Resend } from 'resend'
import { FREIGHT_LEAD_TIMES } from './freight.js'

/**
 * Transactional email for the quote workflow, sent through Resend from the
 * verified `genuineoems.com` domain.
 *
 * Every export here is best effort: a bounced or misconfigured send must never
 * take down the request it was announcing. The customer's quote reference
 * lives in the database and stays reachable through `access_quote.sh` whether
 * or not the email left the building, so failures are logged and swallowed.
 */

const FROM = 'GENUINE_OEM <quotes@genuineoems.com>'
const FALLBACK_SITE_URL = 'https://genuineoems.com'

let client: Resend | null = null

/**
 * Built on first use rather than at import time: the functions that pull this
 * module in must still load — and answer — on an environment with no
 * `RESEND_API_KEY`, which is exactly the case in local dev.
 */
function resend() {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!client) client = new Resend(key)
  return client
}

/**
 * Where to point the customer. The origin of the request the email is being
 * sent from is the one address known to be serving this copy of the site, so
 * a deploy preview links to itself rather than to production, whose database
 * branch holds none of these references.
 */
export function siteUrl(req: Request) {
  try {
    return new URL(req.url).origin
  } catch {
    return (process.env.URL || FALLBACK_SITE_URL).replace(/\/+$/, '')
  }
}

const esc = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Mirrors `formatMoney` in src/lib/quote.ts, which the functions cannot import. */
const money = (value: string, currency: string) => {
  const amount = Number.parseFloat(value || '0')
  const safe = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'GBP',
      currencyDisplay: 'narrowSymbol',
    }).format(safe)
  } catch {
    return `${currency} ${safe.toFixed(2)}`
  }
}

/** First name only, so the greeting reads naturally; '' collapses to a neutral one. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || ''

type SendArgs = {
  to: string
  subject: string
  html: string
  text: string
  /** Identifies the send in the logs when it fails. */
  label: string
}

async function send({ to, subject, html, text, label }: SendArgs) {
  const mailer = resend()
  if (!mailer) {
    console.warn(`${label}: RESEND_API_KEY is not set, skipping email to ${to}`)
    return
  }
  try {
    const { error } = await mailer.emails.send({ from: FROM, to, subject, html, text })
    // The SDK reports API-level rejections in the payload rather than by
    // throwing, so a send can "succeed" and still not have been sent.
    if (error) console.error(`${label}: resend rejected the email`, error)
  } catch (err) {
    console.error(`${label}: could not send email`, err)
  }
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

const shell = (body: string) => `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#05070a;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;color:#c8d6c8;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;border:1px solid #1d3a24;background:#0a0f0b;">
      <tr>
        <td style="padding:20px 24px;border-bottom:1px solid #1d3a24;color:#4ade80;font-size:13px;letter-spacing:1px;">
          GENUINE_OEM // BMW &amp; LAND ROVER OEM PARTS
        </td>
      </tr>
      <tr>
        <td style="padding:24px;font-size:14px;line-height:1.7;">
${body}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;border-top:1px solid #1d3a24;color:#5f7a63;font-size:11px;line-height:1.6;">
          GENUINE_OEM &middot; UK-sourced genuine BMW and Land Rover parts, delivered into Kenya.<br />
          Reply to this email if anything looks wrong.
        </td>
      </tr>
    </table>
  </body>
</html>`

const refBlock = (ref: string) => `
          <div style="margin:20px 0;padding:14px 16px;border:1px dashed #2c5c39;background:#08120c;text-align:center;">
            <div style="color:#5f7a63;font-size:11px;letter-spacing:1px;">QUOTE REFERENCE</div>
            <div style="color:#4ade80;font-size:22px;letter-spacing:2px;padding-top:6px;">${esc(ref)}</div>
          </div>`

const button = (href: string, label: string) => `
          <div style="margin:24px 0;">
            <a href="${esc(href)}" style="display:inline-block;padding:12px 20px;border:1px solid #4ade80;color:#4ade80;text-decoration:none;font-size:13px;letter-spacing:1px;">${esc(label)}</a>
          </div>`

const line = (label: string, value: string) =>
  value
    ? `<tr><td style="padding:4px 12px 4px 0;color:#5f7a63;font-size:12px;white-space:nowrap;">${esc(label)}</td><td style="padding:4px 0;color:#c8d6c8;font-size:13px;">${esc(value)}</td></tr>`
    : ''

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

type RequestReceived = {
  req: Request
  ref: string
  name: string
  email: string
  partNo: string
  vehicleId: string
  destinationCountry: string
  message: string
}

/**
 * Sent the moment an enquiry is stored. Its job is to hand the customer the
 * reference — the only credential they get — and to set the expectation that a
 * priced answer follows separately.
 */
export async function sendQuoteRequestReceived(args: RequestReceived) {
  const { req, ref, name, email } = args
  const accessUrl = `${siteUrl(req)}/access/${encodeURIComponent(ref)}`
  const greeting = firstName(name) ? `Hi ${firstName(name)},` : 'Hi,'

  const details = [
    line('PART NO', args.partNo),
    line('VEHICLE', args.vehicleId),
    line('DESTINATION', args.destinationCountry),
    line('NOTES', args.message),
  ]
    .filter(Boolean)
    .join('')

  const html = shell(`
          <p style="margin:0 0 12px;">${esc(greeting)}</p>
          <p style="margin:0 0 12px;">Your parts enquiry is logged. Our team is sourcing the part and working out the landed cost into ${esc(args.destinationCountry || 'your destination')} — you'll get a second email as soon as the quote is priced and ready to view.</p>
          ${refBlock(ref)}
          <p style="margin:0 0 12px;">Keep this reference safe: it's how you open your quote record. You can check its status at any time.</p>
          ${button(accessUrl, 'CHECK QUOTE STATUS')}
          ${details ? `<p style="margin:20px 0 8px;color:#5f7a63;font-size:11px;letter-spacing:1px;">WHAT YOU SENT US</p><table role="presentation" cellpadding="0" cellspacing="0">${details}</table>` : ''}`)

  const text = [
    greeting,
    '',
    "Your parts enquiry is logged. Our team is sourcing the part and working out the landed cost — you'll get a second email as soon as the quote is priced and ready to view.",
    '',
    `Quote reference: ${ref}`,
    `Check the status: ${accessUrl}`,
    '',
    'Keep this reference safe: it is how you open your quote record.',
    '',
    'GENUINE_OEM',
  ].join('\n')

  await send({
    to: email,
    subject: `Quote request received — ${ref}`,
    html,
    text,
    label: 'quote-request email',
  })
}

type QuoteReady = {
  req: Request
  ref: string
  name: string
  email: string
  partName: string
  currency: string
  /** Landed cost by sea: part + sea freight + duties. */
  landedCostSea: string
  /** Landed cost by air, or null when the quote does not offer air freight. */
  landedCostAir: string | null
  /** A re-publish over an existing quote, i.e. the price changed. */
  updated: boolean
}

/**
 * Sent when the admin publishes a price. Publishing is what makes the quote
 * visible to the customer, so this is the nudge that there is now something to
 * look at — a re-publish says so rather than pretending to be the first.
 */
export async function sendQuoteReady(args: QuoteReady) {
  const { req, ref, name, email, updated } = args
  const accessUrl = `${siteUrl(req)}/access/${encodeURIComponent(ref)}`
  const greeting = firstName(name) ? `Hi ${firstName(name)},` : 'Hi,'
  const sea = money(args.landedCostSea, args.currency)
  const air = args.landedCostAir ? money(args.landedCostAir, args.currency) : ''
  const headline = updated
    ? 'Your quote has been updated and is ready to view.'
    : 'Your quote is priced and ready to view.'

  // Both freight options, so the choice waiting on the record is visible from
  // the email. A quote with no air figure simply lists the one option.
  const details = [
    line('PART', args.partName),
    air ? line(`AIR FREIGHT (${FREIGHT_LEAD_TIMES.air})`, air) : '',
    line(`SEA FREIGHT (${FREIGHT_LEAD_TIMES.sea})`, sea),
  ]
    .filter(Boolean)
    .join('')

  const html = shell(`
          <p style="margin:0 0 12px;">${esc(greeting)}</p>
          <p style="margin:0 0 12px;">${esc(headline)} ${air ? 'Each figure below is a full landed cost' : 'The figure below is the full landed cost'} — part, freight and duties included.</p>
          ${refBlock(ref)}
          <table role="presentation" cellpadding="0" cellspacing="0">${details}</table>
          <p style="margin:16px 0 0;">Open your record to see the full breakdown, the part photo, and to accept ${air ? 'whichever option suits you' : 'the quote'}.</p>
          ${button(accessUrl, 'VIEW & ACCEPT QUOTE')}
          <p style="margin:0;color:#5f7a63;font-size:12px;">If the button doesn't work, go to ${esc(siteUrl(req))}, run access_quote.sh and enter ${esc(ref)}.</p>`)

  const text = [
    greeting,
    '',
    `${headline} ${air ? 'Each total below is a full landed cost' : 'The total below is the full landed cost'} — part, freight and duties included.`,
    '',
    `Quote reference: ${ref}`,
    args.partName ? `Part: ${args.partName}` : '',
    air ? `Air freight (${FREIGHT_LEAD_TIMES.air}): ${air}` : '',
    `Sea freight (${FREIGHT_LEAD_TIMES.sea}): ${sea}`,
    '',
    `View and accept your quote: ${accessUrl}`,
    '',
    `Or go to ${siteUrl(req)}, run access_quote.sh and enter ${ref}.`,
    '',
    'GENUINE_OEM',
  ]
    .filter((row, i, rows) => row !== '' || rows[i - 1] !== '')
    .join('\n')

  await send({
    to: email,
    subject: updated ? `Your quote has been updated — ${ref}` : `Your quote is ready — ${ref}`,
    html,
    text,
    label: 'admin-quote email',
  })
}
