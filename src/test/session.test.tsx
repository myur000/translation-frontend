import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.tsx'
import { login, logoutSession, refreshSession } from '../api/auth.ts'
import { ApiClient, ApiClientError } from '../api/client.ts'
import { AUTH_SESSION_STORAGE_KEY, createAuthSession } from '../auth/authStorage.ts'
import { SessionController, SessionChangedError, type SessionRequests } from '../auth/sessionController.ts'
import { AUTH_COORDINATION_KEY, BrowserSessionCoordinator, SessionCoordinationError, type SessionCoordination, type SessionMarker } from '../auth/sessionCoordinator.ts'
import { installBrowserSessionMock } from './browserSessionMock.ts'
import { accountFixture } from './accountFixtures.ts'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  sessionStorage.clear()
  localStorage.clear()
})

function token(version = 1, seconds = 900, subject = 'reader-id') {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({
    sub: subject, email: 'reader@example.com', email_verified: true,
    sid: 'session-id', exp: Math.floor(Date.now() / 1000) + seconds, jti: version,
  }) + '.signature'
}
function response(version = 1, seconds = 900) {
  return { accessToken: token(version, seconds), tokenType: 'Bearer' as const, expiresIn: seconds }
}
function session(version = 1, seconds = 900) {
  return createAuthSession(response(version, seconds), 'reader@example.com')
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function denied(status = 401) {
  return new ApiClientError('Denied', status, null, null, status === 429 ? 30 : null)
}

type Message = Parameters<SessionCoordination['publish']>[0]
function sharedCoordinator() {
  let marker: SessionMarker | null = null
  let revision = 0
  let queue: Promise<unknown> = Promise.resolve()
  const listeners = new Set<(message: Message) => void>()
  function create(): SessionCoordination {
    return {
      read: () => marker,
      mark: (state) => { marker = { revision: String(++revision), state }; return marker },
      exclusive: <T,>(operation: () => Promise<T>) => {
        const result = queue.then(operation)
        queue = result.catch(() => undefined)
        return result
      },
      publish: (message) => {
        if (message.type !== 'request' && message.revision !== marker?.revision) return
        for (const listener of listeners) listener(message)
      },
      connect: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      requestSession: async (requestedRevision) => {
        for (const listener of listeners) listener({ type: 'request', revision: requestedRevision })
      },
    }
  }
  return { create }
}
function requests(overrides: Partial<SessionRequests> = {}): SessionRequests {
  return {
    login: vi.fn().mockImplementation(async () => response()),
    refresh: vi.fn().mockImplementation(async () => response(2)),
    logout: vi.fn().mockResolvedValue(undefined),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}
const credentials = { email: 'reader@example.com', password: 'test-password' }

describe('refresh cookie API contract', () => {
  it('includes cookies and custom header without a Bearer token in refresh/logout', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) =>
      url === '/api/auth/logout' ? new Response(null, { status: 204 }) : json(response()),
    )
    vi.stubGlobal('fetch', fetchMock)
    await login(credentials)
    await refreshSession()
    await logoutSession()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/auth/login', '/api/auth/refresh', '/api/auth/logout',
    ])
    for (const [, init] of fetchMock.mock.calls) expect(init.credentials).toBe('include')
    for (const [, init] of fetchMock.mock.calls.slice(1)) {
      expect((init.headers as Headers).get('X-Refresh-Request')).toBe('true')
      expect((init.headers as Headers).has('Authorization')).toBe(false)
      expect(init.body).toBeUndefined()
    }
  })
})

describe('session controller', () => {
  it('restores one in-memory session and coalesces duplicate bootstrap calls', async () => {
    const api = requests()
    const controller = new SessionController(null, sharedCoordinator().create(), api)
    const first = controller.bootstrap()
    expect(controller.bootstrap()).toBe(first)
    await first
    expect(api.refresh).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().session?.email).toBe('reader@example.com')
    expect(controller.getSnapshot().isRestoring).toBe(false)
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('uses one refresh result for JSON, multipart and binary requests with simultaneous 401s', async () => {
    const api = requests()
    const controller = new SessionController(session(), sharedCoordinator().create(), api)
    const oldToken = controller.getSnapshot().session!.accessToken
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      const bearer = (init.headers as Headers).get('Authorization')
      if (bearer === 'Bearer ' + oldToken) return new Response(null, { status: 401 })
      return url.endsWith('/download') ? new Response('translated file') : json({ ok: true })
    })
    const client = new ApiClient({ fetchImplementation: fetchMock })
    client.setSessionRecovery(controller)
    const form = new FormData()
    const file = new File(['pdf'], 'book.pdf')
    form.append('file', file)
    const [profile, upload, binary] = await Promise.all([
      client.request('/profile', { accessToken: oldToken }),
      client.request('/upload', { method: 'POST', accessToken: oldToken, body: form }),
      client.requestBinary('/download', { accessToken: oldToken }),
    ])
    expect(profile).toEqual({ ok: true })
    expect(upload).toEqual({ ok: true })
    expect(await binary.blob.text()).toBe('translated file')
    expect(api.refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(6)
    const uploads = fetchMock.mock.calls.filter(([url]) => url.endsWith('/upload'))
    expect(uploads[1][1].body).toBe(form)
    expect((uploads[1][1].body as FormData).get('file')).toBe(file)
  })

  it('does not rotate again for a delayed 401 from the previous JWT', async () => {
    const api = requests()
    const controller = new SessionController(session(), sharedCoordinator().create(), api)
    const oldToken = controller.getSnapshot().session!.accessToken
    await controller.refresh()
    expect(await controller.refreshAccessToken(oldToken)).toBe(controller.getSnapshot().session!.accessToken)
    expect(api.refresh).toHaveBeenCalledTimes(1)
  })

  it('coordinates two tabs and shares the new JWT without persisting it', async () => {
    const hub = sharedCoordinator()
    const api = requests()
    const first = new SessionController(null, hub.create(), api)
    const second = new SessionController(null, hub.create(), api)
    const disconnectFirst = first.connect()
    const disconnectSecond = second.connect()
    await first.login(credentials)
    const oldToken = first.getSnapshot().session!.accessToken
    await Promise.all([first.refresh(oldToken), second.refresh(oldToken)])
    expect(api.refresh).toHaveBeenCalledTimes(1)
    expect(first.getSnapshot().session).toEqual(second.getSnapshot().session)
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    await second.logout()
    expect(first.getSnapshot().session).toBeNull()
    expect(second.getSnapshot().session).toBeNull()
    disconnectFirst(); disconnectSecond()
  })

  it('clears the session only when refresh confirms 401', async () => {
    const api = requests({ refresh: vi.fn().mockRejectedValue(denied()) })
    const controller = new SessionController(session(), sharedCoordinator().create(), api)
    await expect(controller.refresh()).rejects.toMatchObject({ status: 401 })
    expect(controller.getSnapshot()).toMatchObject({
      session: null, isRestoring: false, issue: 'expired',
    })
  })

  it.each([403, 429, 500, 503])('preserves the workspace and stops automatic repeats after refresh HTTP %s', async (status) => {
    const api = requests({ refresh: vi.fn().mockRejectedValue(denied(status)) })
    const controller = new SessionController(session(), sharedCoordinator().create(), api)
    await expect(controller.refresh()).rejects.toMatchObject({ status })
    expect(controller.getSnapshot().session).not.toBeNull()
    expect(controller.getSnapshot().issue).toBe('unavailable')
    await expect(controller.refresh()).rejects.toMatchObject({ status })
    expect(api.refresh).toHaveBeenCalledTimes(1)
  })

  it('does not blindly retry a lost rotation response, including after reload', async () => {
    const hub = sharedCoordinator()
    const api = requests({ refresh: vi.fn().mockRejectedValue(new TypeError('Network lost')) })
    const controller = new SessionController(session(), hub.create(), api)
    await expect(controller.refresh()).rejects.toThrow('Network lost')
    expect(controller.getSnapshot().session).not.toBeNull()
    const reloaded = new SessionController(null, hub.create(), api)
    await reloaded.bootstrap()
    expect(api.refresh).toHaveBeenCalledTimes(1)
    expect(reloaded.getSnapshot()).toMatchObject({ isRestoring: false, issue: 'unavailable' })
  })

  it('does not resurrect a session if logout starts during refresh', async () => {
    let resolveRefresh!: (value: ReturnType<typeof response>) => void
    const api = requests({
      refresh: vi.fn().mockImplementation(() => new Promise((resolve) => { resolveRefresh = resolve })),
    })
    const controller = new SessionController(session(), sharedCoordinator().create(), api)
    const renewal = controller.refresh().catch(() => undefined)
    await Promise.resolve()
    const leaving = controller.logout()
    resolveRefresh(response(2))
    await Promise.all([renewal, leaving])
    expect(api.logout).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().session).toBeNull()
  })

  it('keeps the session and explains a failed server logout', async () => {
    const api = requests({ logout: vi.fn().mockRejectedValue(new TypeError('Offline')) })
    const controller = new SessionController(session(), sharedCoordinator().create(), api)
    await expect(controller.logout()).rejects.toThrow('Offline')
    expect(controller.getSnapshot().session).not.toBeNull()
    expect(controller.getSnapshot().issue).toBe('logoutFailed')
  })
})

describe('401 recovery boundaries', () => {
  it('does not let a delayed second 401 sign out a newer login', async () => {
    let resolveRejection!: (value: Response) => void
    const api = requests({ login: vi.fn().mockImplementation(async () => response(3)) })
    const controller = new SessionController(session(), sharedCoordinator().create(), api)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRejection = resolve }))
    const client = new ApiClient({ fetchImplementation: fetchMock })
    client.setSessionRecovery(controller)
    const pending = client.request('/profile', { accessToken: token() }).catch((error) => error)
    for (let index = 0; index < 20 && !resolveRejection; index++) await Promise.resolve()
    expect(resolveRejection).toBeTypeOf('function')
    await controller.login(credentials)
    resolveRejection(new Response(null, { status: 401 }))
    expect(await pending).toMatchObject({ status: 401 })
    expect(controller.getSnapshot().session?.accessToken).toBe(token(3))
    expect(controller.getSnapshot().issue).toBeNull()
  })

  it('does not replay another account\'s request if refresh restores a different account', async () => {
    const api = requests({
      refresh: vi.fn().mockImplementation(async () => ({
        ...response(2), accessToken: token(2, 900, 'another-user'),
      })),
    })
    const controller = new SessionController(session(), sharedCoordinator().create(), api)
    await expect(controller.refreshAccessToken(token())).rejects.toBeInstanceOf(SessionChangedError)
    expect(controller.getSnapshot().session?.accessToken).toBe(token(2, 900, 'another-user'))
  })

  it('retries a protected request at most once', async () => {
    const api = requests()
    const controller = new SessionController(session(), sharedCoordinator().create(), api)
    const fetchMock = vi.fn().mockImplementation(async () => new Response(null, { status: 401 }))
    const client = new ApiClient({ fetchImplementation: fetchMock })
    client.setSessionRecovery(controller)
    await expect(client.request('/profile', { accessToken: token() })).rejects.toMatchObject({ status: 401 })
    expect(api.refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never refreshes public login failures or permission errors', async () => {
    const api = requests()
    const controller = new SessionController(session(), sharedCoordinator().create(), api)
    const client = new ApiClient({
      fetchImplementation: vi.fn().mockImplementation(async (url) =>
        new Response(null, { status: url.endsWith('/auth/login') ? 401 : 403 }),
      ),
    })
    client.setSessionRecovery(controller)
    await expect(client.request('/auth/login', { method: 'POST', json: credentials })).rejects.toMatchObject({ status: 401 })
    await expect(client.request('/upload', { accessToken: token() })).rejects.toMatchObject({ status: 403 })
    expect(api.refresh).not.toHaveBeenCalled()
    expect(controller.getSnapshot().session).not.toBeNull()
  })

  it('does not replay a request aborted while waiting for refresh', async () => {
    const abort = new AbortController()
    const api = requests({
      refresh: vi.fn().mockImplementation(async () => {
        abort.abort()
        return response(2)
      }),
    })
    const controller = new SessionController(session(), sharedCoordinator().create(), api)
    const fetchMock = vi.fn().mockImplementation(async () => new Response(null, { status: 401 }))
    const client = new ApiClient({ fetchImplementation: fetchMock })
    client.setSessionRecovery(controller)
    await expect(client.request('/profile', { accessToken: token(), signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

function installAppApi() {
  installBrowserSessionMock()
  const api = vi.fn().mockImplementation(async (url) => {
    const account = accountFixture(url)
    if (account) return json(account)
    if (url === '/api/auth/refresh') return json(response(2))
    if (url === '/api/profile') return json({ email: 'reader@example.com', username: 'Reader' })
    if (url.startsWith('/api/documents/history')) return json({ items: [] })
    if (url === '/api/auth/logout') return new Response(null, { status: 204 })
    throw new Error('Unexpected URL: ' + String(url))
  })
  vi.stubGlobal('fetch', api)
  return api
}
function renderWorkspace() {
  return render(<StrictMode><MemoryRouter><App /></MemoryRouter></StrictMode>)
}

describe('session UI integration', () => {
  it('shows an unavailable state instead of redirecting on bootstrap network failure', async () => {
    installBrowserSessionMock()
    const api = vi.fn().mockRejectedValue(new TypeError('Network lost'))
    vi.stubGlobal('fetch', api)
    renderWorkspace()
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось обновить сессию')
    expect(screen.getByRole('link', { name: 'Войти заново' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Вход' })).toBeNull()
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('renews before expiry, stays in the workspace and never stores JWTs', async () => {
    vi.useFakeTimers()
    const initial = session(1, 120)
    sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(initial))
    const api = installAppApi()
    renderWorkspace()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText('Мои книги')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })
    expect(api.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1)
    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Вход' })).toBeNull()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    const marker = localStorage.getItem(AUTH_COORDINATION_KEY)
    expect(marker).not.toContain('accessToken')
    expect(marker).not.toContain(initial.accessToken)
  })

  it('restores after reload with one refresh even in React StrictMode', async () => {
    const api = installAppApi()
    const first = renderWorkspace()
    expect(screen.getByRole('status').textContent).toContain('Восстанавливаем')
    expect(await screen.findByText('Мои книги')).toBeTruthy()
    expect(api.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1)
    first.unmount()
    renderWorkspace()
    expect(await screen.findByText('Мои книги')).toBeTruthy()
    expect(api.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(2)
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })
})

class TestBroadcastChannel {
  static peers = new Set<TestBroadcastChannel>()
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  constructor(_name: string) { TestBroadcastChannel.peers.add(this) }
  postMessage(data: unknown) {
    for (const peer of TestBroadcastChannel.peers) {
      if (peer !== this) queueMicrotask(() => peer.onmessage?.({ data } as MessageEvent<unknown>))
    }
  }
  close() { TestBroadcastChannel.peers.delete(this) }
}

describe('browser session coordination', () => {
  it('uses Web Locks and BroadcastChannel to share one rotation across two tabs', async () => {
    installBrowserSessionMock()
    vi.stubGlobal('BroadcastChannel', TestBroadcastChannel)
    const api = requests()
    const first = new SessionController(null, new BrowserSessionCoordinator(), api)
    const second = new SessionController(null, new BrowserSessionCoordinator(), api)
    const stopFirst = first.connect()
    const stopSecond = second.connect()
    try {
      await first.login(credentials)
      const previous = first.getSnapshot().session!.accessToken
      await Promise.all([first.refresh(previous), second.refresh(previous)])
      expect(api.refresh).toHaveBeenCalledTimes(1)
      expect(first.getSnapshot().session).toEqual(second.getSnapshot().session)
      const marker = localStorage.getItem(AUTH_COORDINATION_KEY)
      expect(marker).toContain('active')
      expect(marker).not.toContain('accessToken')
      expect(marker).not.toContain(previous)
      await first.logout()
      await Promise.resolve()
      expect(second.getSnapshot().session).toBeNull()
    } finally {
      stopFirst(); stopSecond()
    }
  })

  it('refuses unsafe renewal without Web Locks and does not poison other tabs', async () => {
    const controller = new SessionController(session(), new BrowserSessionCoordinator(), requests())
    await expect(controller.refresh()).rejects.toBeInstanceOf(SessionCoordinationError)
    expect(controller.getSnapshot().issue).toBe('coordination')
    expect(controller.getSnapshot().session).not.toBeNull()
    expect(localStorage.getItem(AUTH_COORDINATION_KEY)).toBeNull()
  })

  it('treats an interrupted refresh marker as uncertain, not as permission to repeat', async () => {
    installBrowserSessionMock()
    localStorage.setItem(AUTH_COORDINATION_KEY, JSON.stringify({ revision: 'interrupted', state: 'refreshing' }))
    const api = requests()
    const controller = new SessionController(null, new BrowserSessionCoordinator(), api)
    await controller.bootstrap()
    expect(api.refresh).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({ isRestoring: false, issue: 'unavailable' })
  })

  it('handles a logout storage event when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const coordinator = new BrowserSessionCoordinator()
    const controller = new SessionController(session(), coordinator, requests())
    const disconnect = controller.connect()
    coordinator.mark('signed-out')
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_COORDINATION_KEY }))
    expect(controller.getSnapshot().session).toBeNull()
    disconnect()
  })
})
