import type { LoginResponse } from '../api/contracts/auth.ts'

export const AUTH_SESSION_STORAGE_KEY = 'doctranslate.auth.session.v1'

export interface AuthSession {
  accessToken: string
  email: string
  emailVerified: boolean
  expiresAt: number
}

interface JwtPayload {
  sub?: unknown
  email?: unknown
  email_verified?: unknown
  exp?: unknown
}

function decodeJwtPayload(accessToken: string): JwtPayload | null {
  const parts = accessToken.split('.')
  if (parts.length !== 3 || !parts[1]) return null

  try {
    const normalized = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(normalized), (character) =>
      character.charCodeAt(0),
    )
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes))

    return typeof payload === 'object' && payload !== null
      ? (payload as JwtPayload)
      : null
  } catch {
    return null
  }
}

function readJwtClaims(accessToken: string) {
  const payload = decodeJwtPayload(accessToken)

  if (
    !payload ||
    typeof payload.sub !== 'string' ||
    payload.sub.length === 0 ||
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp)
  ) {
    return null
  }

  return {
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
    expiresAt: payload.exp * 1000,
  }
}

export function readAccessTokenSubject(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken)
  return typeof payload?.sub === 'string' ? payload.sub : null
}

function isStoredSession(value: unknown): value is AuthSession {
  if (typeof value !== 'object' || value === null) return false

  const session = value as Partial<AuthSession>
  return (
    typeof session.accessToken === 'string' &&
    session.accessToken.length > 0 &&
    typeof session.email === 'string' &&
    typeof session.emailVerified === 'boolean' &&
    typeof session.expiresAt === 'number' &&
    Number.isFinite(session.expiresAt)
  )
}

export function createAuthSession(
  response: LoginResponse,
  fallbackEmail: string,
): AuthSession {
  if (typeof response?.tokenType !== 'string' || response.tokenType.toLowerCase() !== 'bearer') {
    throw new TypeError('Backend returned an unsupported token type.')
  }

  if (typeof response.accessToken !== 'string' ||
    typeof response.expiresIn !== 'number' || !Number.isFinite(response.expiresIn) || response.expiresIn <= 0) {
    throw new TypeError('Backend returned an invalid access token lifetime.')
  }

  const claims = readJwtClaims(response.accessToken)
  const responseExpiry = Date.now() + Math.max(0, response.expiresIn) * 1000
  const expiresAt = Math.min(responseExpiry, claims?.expiresAt ?? responseExpiry)

  if (!claims || expiresAt <= Date.now()) {
    throw new TypeError('Backend returned an invalid or expired JWT.')
  }

  return {
    accessToken: response.accessToken,
    email: claims.email ?? fallbackEmail.trim().toLowerCase(),
    emailVerified: claims.emailVerified,
    expiresAt,
  }
}

export function readAuthSession(): AuthSession | null {
  try {
    const serialized = sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!serialized) return null

    const stored: unknown = JSON.parse(serialized)
    if (!isStoredSession(stored)) {
      clearAuthSession()
      return null
    }

    const claims = readJwtClaims(stored.accessToken)
    const expiresAt = Math.min(stored.expiresAt, claims?.expiresAt ?? 0)

    if (!claims || expiresAt <= Date.now()) {
      clearAuthSession()
      return null
    }

    return {
      ...stored,
      email: claims.email ?? stored.email,
      emailVerified: claims.emailVerified,
      expiresAt,
    }
  } catch {
    clearAuthSession()
    return null
  }
}

export function clearAuthSession() {
  sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
}
