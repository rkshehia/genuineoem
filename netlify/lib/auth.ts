import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import process from 'node:process'

export const ADMIN_COOKIE = 'goem_admin'
const SESSION_MS = 12 * 60 * 60 * 1000

/**
 * The admin console is gated by a single shared password held in the
 * `ADMIN_PASSWORD` environment variable. With no password configured the
 * console is bolted shut rather than left open — see `adminGate`.
 */
export function adminSecret() {
  return process.env.ADMIN_PASSWORD ?? ''
}

function sign(expiresAt: number, secret: string) {
  return createHmac('sha256', secret).update(`goem-admin.${expiresAt}`).digest('base64url')
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function checkPassword(candidate: string, secret: string) {
  return secret.length > 0 && safeEqual(candidate, secret)
}

/** Session token is `<expiry>.<hmac>` — stateless, so no session table is needed. */
export function issueSession(secret: string) {
  const expiresAt = Date.now() + SESSION_MS
  return `${expiresAt}.${sign(expiresAt, secret)}`
}

export function verifySession(token: string, secret: string) {
  const [expiresRaw, mac] = token.split('.')
  const expiresAt = Number(expiresRaw)
  if (!mac || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false
  return safeEqual(mac, sign(expiresAt, secret))
}

export function readCookie(req: Request, name: string) {
  const header = req.headers.get('cookie')
  if (!header) return ''
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return ''
}

export function sessionCookie(req: Request, value: string, maxAgeSeconds: number) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : ''
  return `${ADMIN_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`
}

/**
 * Returns a Response when the caller must be turned away, or `null` when the
 * request carries a valid admin session.
 */
export function adminGate(req: Request): Response | null {
  const secret = adminSecret()
  if (!secret) {
    return Response.json(
      {
        error: 'admin_not_configured',
        message:
          'Set the ADMIN_PASSWORD environment variable on this site to enable the admin console.',
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
  if (!verifySession(readCookie(req, ADMIN_COOKIE), secret)) {
    return Response.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    )
  }
  return null
}
