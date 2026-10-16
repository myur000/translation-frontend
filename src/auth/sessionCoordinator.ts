import type { AuthSession } from './authStorage.ts'

export const AUTH_COORDINATION_KEY = 'doctranslate.auth.coordination.v1'
const LOCK_NAME = 'doctranslate.auth-cookie'
const CHANNEL_NAME = 'doctranslate.auth-session'

export type SessionMarkerState = 'active' | 'signed-out' | 'refreshing' | 'unavailable'
export interface SessionMarker { revision: string; state: SessionMarkerState }
type SessionMessage =
  | { type: 'session'; revision: string; session: AuthSession }
  | { type: 'signed-out' | 'unavailable'; revision: string }
  | { type: 'request'; revision: string }

export interface SessionCoordination {
  read: () => SessionMarker | null
  mark: (state: SessionMarkerState) => SessionMarker
  exclusive: <T>(operation: () => Promise<T>) => Promise<T>
  publish: (message: SessionMessage) => void
  connect: (listener: (message: SessionMessage) => void) => () => void
  requestSession: (revision: string) => Promise<void>
}

export class SessionCoordinationError extends Error {
  constructor() {
    super('Safe session renewal requires Web Locks and browser storage.')
    this.name = 'SessionCoordinationError'
  }
}

function isMessage(value: unknown): value is SessionMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<SessionMessage>
  if (typeof message.revision !== 'string') return false
  if (message.type === 'session') {
    const session = message.session
    return Boolean(session && typeof session.accessToken === 'string' &&
      typeof session.email === 'string' && typeof session.emailVerified === 'boolean' &&
      typeof session.expiresAt === 'number' && Number.isFinite(session.expiresAt))
  }
  return message.type === 'signed-out' || message.type === 'unavailable' || message.type === 'request'
}

/** Only non-secret coordination markers are persisted. JWTs travel in memory. */
export class BrowserSessionCoordinator implements SessionCoordination {
  private channel: BroadcastChannel | null = null
  private listener: ((message: SessionMessage) => void) | null = null
  private waiters = new Set<() => void>()

  read(): SessionMarker | null {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(AUTH_COORDINATION_KEY) ?? 'null')
      if (!value || typeof value !== 'object') return null
      const marker = value as Partial<SessionMarker>
      return typeof marker.revision === 'string' &&
        ['active', 'signed-out', 'refreshing', 'unavailable'].includes(marker.state ?? '')
        ? marker as SessionMarker : null
    } catch {
      return null
    }
  }

  mark(state: SessionMarkerState): SessionMarker {
    const marker = { revision: crypto.randomUUID(), state }
    // If storage is blocked, fail BEFORE starting cookie rotation.
    localStorage.setItem(AUTH_COORDINATION_KEY, JSON.stringify(marker))
    return marker
  }

  exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (!navigator.locks) return Promise.reject(new SessionCoordinationError())
    return navigator.locks.request(LOCK_NAME, operation)
  }

  publish(message: SessionMessage) {
    this.channel?.postMessage(message)
  }

  connect(listener: (message: SessionMessage) => void) {
    this.listener = listener
    if (typeof window.BroadcastChannel === 'function') {
      this.channel = new window.BroadcastChannel(CHANNEL_NAME)
      this.channel.onmessage = (event: MessageEvent<unknown>) => {
        if (!isMessage(event.data)) return
        const message = event.data
        if (message.type !== 'request' && this.read()?.revision !== message.revision) return
        this.listener?.(message)
        if (message.type === 'session') for (const finish of this.waiters) finish()
      }
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_COORDINATION_KEY) return
      const marker = this.read()
      if (marker?.state === 'signed-out' || marker?.state === 'unavailable') {
        listener({ type: marker.state, revision: marker.revision })
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      this.channel?.close()
      this.channel = null
      this.listener = null
      for (const finish of this.waiters) finish()
    }
  }

  requestSession(revision: string): Promise<void> {
    if (!this.channel) return Promise.resolve()
    return new Promise((resolve) => {
      const finish = () => {
        window.clearTimeout(timeout)
        this.waiters.delete(finish)
        resolve()
      }
      const timeout = window.setTimeout(finish, 100)
      this.waiters.add(finish)
      this.publish({ type: 'request', revision })
    })
  }
}
