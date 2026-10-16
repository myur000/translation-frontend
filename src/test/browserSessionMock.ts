import { vi } from 'vitest'
import { accountFixture } from './accountFixtures.ts'

/** Browser capabilities and anonymous bootstrap for pre-existing component tests. */
export function installBrowserSessionMock({ mockAccount = true } = {}) {
  let queue: Promise<unknown> = Promise.resolve()
  const locks = {
    request: (_name: string, operation: () => Promise<unknown>) => {
      const result = queue.then(operation)
      queue = result.catch(() => undefined)
      return result
    },
  }
  const browserNavigator = globalThis.navigator
  vi.stubGlobal('navigator', new Proxy(browserNavigator, {
    get(target, key) {
      return key === 'locks' ? locks : Reflect.get(target, key, target)
    },
  }))
  const fetchImplementation = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const account = mockAccount ? accountFixture(input) : null
    if (account) return Promise.resolve(new Response(JSON.stringify(account), {
      headers: { 'Content-Type': 'application/json' },
    }))
    if (input === '/api/auth/refresh') return Promise.resolve(new Response(null, { status: 401 }))
    if (input === '/api/auth/logout') return Promise.resolve(new Response(null, { status: 204 }))
    return fetchImplementation(input, init)
  }))
}
