import {
  ADMIN_COOKIE,
  adminSecret,
  checkPassword,
  issueSession,
  readCookie,
  sessionCookie,
  verifySession,
} from '../lib/auth.js'
import { json } from '../lib/http.js'

/** GET reports whether the caller is signed in, POST signs in, DELETE signs out. */
export default async (req: Request) => {
  const secret = adminSecret()

  if (req.method === 'GET') {
    if (!secret) return json({ configured: false, authenticated: false })
    return json({
      configured: true,
      authenticated: verifySession(readCookie(req, ADMIN_COOKIE), secret),
    })
  }

  if (req.method === 'DELETE') {
    return json({ authenticated: false }, 200, {
      'set-cookie': sessionCookie(req, '', 0),
    })
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  if (!secret) {
    return json(
      {
        error: 'admin_not_configured',
        message:
          'Set the ADMIN_PASSWORD environment variable on this site to enable the admin console.',
      },
      503,
    )
  }

  let password = ''
  try {
    password = String(((await req.json()) as { password?: unknown }).password ?? '')
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  if (!checkPassword(password, secret)) return json({ error: 'invalid_password' }, 401)

  return json({ authenticated: true }, 200, {
    'set-cookie': sessionCookie(req, issueSession(secret), 12 * 60 * 60),
  })
}
