import { login, logoutAll, logoutSession, refreshSession } from '../api/auth.ts'
import { ApiClientError, type SessionRecovery } from '../api/client.ts'
import type { LoginRequest, LoginResponse } from '../api/contracts/auth.ts'
import { clearAuthSession, createAuthSession, readAccessTokenSubject, type AuthSession } from './authStorage.ts'
import {
  BrowserSessionCoordinator, SessionCoordinationError,
  type SessionCoordination,
} from './sessionCoordinator.ts'

export type SessionIssue = 'expired' | 'unavailable' | 'coordination' | 'logoutFailed' | null
export interface SessionSnapshot {
  session: AuthSession | null
  isRestoring: boolean
  issue: SessionIssue
}

export interface SessionRequests {
  login: (credentials: LoginRequest) => Promise<LoginResponse>
  refresh: () => Promise<LoginResponse>
  logout: () => Promise<void>
  logoutAll: (token: string) => Promise<void>
}

export class SessionChangedError extends Error {
  constructor() {
    super('The session changed while the request was in progress.')
    this.name = 'SessionChangedError'
  }
}

const defaultRequests: SessionRequests = {
  login, refresh: refreshSession, logout: logoutSession,
  logoutAll: (accessToken) => logoutAll({ accessToken }),
}

/** One refresh promise per tab; the coordinator serializes rotating cookies across tabs. */
export class SessionController implements SessionRecovery {
  private snapshot: SessionSnapshot
  private listeners = new Set<() => void>()
  private pendingRefresh: Promise<AuthSession> | null = null
  private bootstrapPromise: Promise<void> | null = null
  private refreshFailure: unknown = null
  private revision: string | null = null
  private generation = 0

  constructor(
    initialSession: AuthSession | null = null,
    privateCoordinator: SessionCoordination = new BrowserSessionCoordinator(),
    requests: SessionRequests = defaultRequests,
  ) {
    this.coordinator = privateCoordinator
    this.requests = requests
    this.snapshot = { session: initialSession, isRestoring: !initialSession, issue: null }
  }

  private readonly coordinator: SessionCoordination
  private readonly requests: SessionRequests
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private update(next: SessionSnapshot) {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  private accept(session: AuthSession, revision: string | null) {
    clearAuthSession()
    this.revision = revision
    this.refreshFailure = null
    this.update({ session, isRestoring: false, issue: null })
  }

  connect = () => this.coordinator.connect((message) => {
    if (message.type === 'request') {
      if (this.revision === message.revision && this.snapshot.session) {
        this.coordinator.publish({ type: 'session', revision: message.revision, session: this.snapshot.session })
      }
    } else if (message.type === 'session') {
      try {
        const session = createAuthSession({
          accessToken: message.session.accessToken, tokenType: 'Bearer',
          expiresIn: Math.max(0, (message.session.expiresAt - Date.now()) / 1000),
        }, message.session.email)
        this.accept(session, message.revision)
      } catch { /* Ignore expired peer tokens; cookie renewal will recover them. */ }
    } else if (message.type === 'signed-out') {
      this.generation++
      this.refreshFailure = null
      clearAuthSession()
      this.update({ session: null, isRestoring: false, issue: null })
    } else {
      this.refreshFailure = new Error('Session renewal needs a fresh login.')
      this.update({ ...this.snapshot, isRestoring: false, issue: 'unavailable' })
    }
  })

  bootstrap = (): Promise<void> => {
    if (this.bootstrapPromise) return this.bootstrapPromise
    if (this.snapshot.session) {
      this.bootstrapPromise = Promise.resolve()
    } else if (this.coordinator.read()?.state === 'signed-out') {
      this.update({ session: null, isRestoring: false, issue: null })
      this.bootstrapPromise = Promise.resolve()
    } else {
      const hadKnownSession = this.coordinator.read()?.state === 'active'
      this.bootstrapPromise = this.refresh().then(() => undefined, () => {
        if (!hadKnownSession && this.snapshot.issue === 'expired') {
          this.update({ ...this.snapshot, issue: null })
        }
      })
    }
    return this.bootstrapPromise
  }

  login = async (credentials: LoginRequest): Promise<void> => {
    const generation = ++this.generation
    await this.coordinator.exclusive(async () => {
      const response = await this.requests.login(credentials)
      if (generation !== this.generation) throw new SessionChangedError()
      const session = createAuthSession(response, credentials.email)
      const marker = this.coordinator.mark('active')
      this.accept(session, marker.revision)
      this.coordinator.publish({ type: 'session', revision: marker.revision, session })
    })
  }

  refresh = (rejectedToken?: string): Promise<AuthSession> => {
    const session = this.snapshot.session
    if (session && rejectedToken && this.isDifferentAccount(rejectedToken, session.accessToken)) {
      return Promise.reject(new SessionChangedError())
    }
    if (rejectedToken && session && session.accessToken !== rejectedToken && session.expiresAt > Date.now()) {
      return Promise.resolve(session)
    }
    if (this.pendingRefresh) return this.pendingRefresh
    if (this.refreshFailure) return Promise.reject(this.refreshFailure)
    const generation = this.generation
    const previousToken = session?.accessToken
    let handledFailure = false
    this.pendingRefresh = this.coordinator.exclusive(async () => {
      try {
        if (generation !== this.generation) throw new SessionChangedError()
        const marker = this.coordinator.read()
        if (marker?.state === 'active' && marker.revision !== this.revision) {
          await this.coordinator.requestSession(marker.revision)
          const current = this.snapshot.session
          if (this.revision === marker.revision && current && current.expiresAt > Date.now() &&
            (!rejectedToken || current.accessToken !== rejectedToken)) return current
        }
        if (generation !== this.generation) throw new SessionChangedError()
        const current = this.snapshot.session
        if (current && current.accessToken !== previousToken && current.expiresAt > Date.now()) return current
        if (marker?.state === 'signed-out') {
          this.update({ session: null, isRestoring: false, issue: 'expired' })
          throw new SessionChangedError()
        }
        if (marker?.state === 'refreshing' || marker?.state === 'unavailable') {
          throw new Error('Previous refresh outcome is uncertain; do not rotate again.')
        }
        // A crashed tab or a lost response must not cause a blind repeat of rotation.
        this.coordinator.mark('refreshing')
        const response = await this.requests.refresh()
        if (generation !== this.generation) throw new SessionChangedError()
        const next = createAuthSession(response, current?.email ?? '')
        const active = this.coordinator.mark('active')
        this.accept(next, active.revision)
        this.coordinator.publish({ type: 'session', revision: active.revision, session: next })
        return next
      } catch (error) {
        // Commit failure markers while the cookie lock is still held.
        handledFailure = true
        this.handleRefreshFailure(error, generation)
        throw error
      }
    }).catch((error: unknown) => {
      if (!handledFailure) this.handleRefreshFailure(error, generation)
      throw error
    }).finally(() => { this.pendingRefresh = null })
    return this.pendingRefresh
  }

  private handleRefreshFailure(error: unknown, generation: number) {
    if (generation !== this.generation || error instanceof SessionChangedError) return
    if (error instanceof ApiClientError && error.status === 401) {
      this.invalidate('expired')
      return
    }
    this.refreshFailure = error
    const coordinationUnavailable = error instanceof SessionCoordinationError
    this.update({
      ...this.snapshot, isRestoring: false,
      issue: coordinationUnavailable ? 'coordination' : 'unavailable',
    })
    if (coordinationUnavailable) return
    try {
      const marker = this.coordinator.mark('unavailable')
      this.coordinator.publish({ type: 'unavailable', revision: marker.revision })
    } catch { /* Storage can be blocked. Local error state still prevents repeats. */ }
  }

  private isDifferentAccount(first: string, second: string) {
    const firstSubject = readAccessTokenSubject(first)
    const secondSubject = readAccessTokenSubject(second)
    return Boolean(firstSubject && secondSubject && firstSubject !== secondSubject)
  }

  prepareAccessToken = async (requestedToken: string): Promise<string> => {
    const session = this.snapshot.session
    if (!session || this.isDifferentAccount(requestedToken, session.accessToken)) throw new SessionChangedError()
    if (session.expiresAt > Date.now()) return session.accessToken
    return this.refreshAccessToken(requestedToken)
  }

  refreshAccessToken = async (rejectedToken: string): Promise<string> => {
    const next = await this.refresh(rejectedToken)
    if (this.isDifferentAccount(rejectedToken, next.accessToken)) throw new SessionChangedError()
    return next.accessToken
  }

  onUnauthorized = (rejectedToken: string) => {
    // A delayed rejection for an old JWT must not sign out a newer session.
    const sharedRevision = this.coordinator.read()?.revision
    if (sharedRevision && this.revision && sharedRevision !== this.revision) return
    if (this.snapshot.session?.accessToken === rejectedToken) this.invalidate('expired')
  }

  invalidate = (issue: SessionIssue = null) => {
    this.generation++
    this.refreshFailure = null
    clearAuthSession()
    this.update({ session: null, isRestoring: false, issue })
    try {
      const marker = this.coordinator.mark('signed-out')
      this.coordinator.publish({ type: 'signed-out', revision: marker.revision })
    } catch { /* Local logout still works when storage is unavailable. */ }
  }

  logout = async (): Promise<void> => {
    ++this.generation
    try {
      await this.coordinator.exclusive(async () => {
        await this.requests.logout()
        this.invalidate()
      })
    } catch (error) {
      this.update({ ...this.snapshot, isRestoring: false, issue: 'logoutFailed' })
      throw error
    }
  }

  logoutEverywhere = async (): Promise<void> => {
    const session = this.snapshot.session
    if (!session) return
    // Obtain a valid JWT before taking the cookie lock to avoid recursive locking.
    const token = await this.prepareAccessToken(session.accessToken)
    ++this.generation
    try {
      await this.coordinator.exclusive(async () => {
        await this.requests.logoutAll(token)
        this.invalidate()
      })
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) this.onUnauthorized(token)
      else this.update({ ...this.snapshot, issue: 'logoutFailed' })
      throw error
    }
  }
}
