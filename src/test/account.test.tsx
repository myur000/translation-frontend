import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountProvider } from '../account/AccountProvider.tsx'
import { getAccountSubscription, getAccountUsage, parseAccountSubscription, parseAccountUsage } from '../api/account.ts'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import { PlansPage } from '../pages/PlansPage.tsx'
import { UserMenu } from '../components/user/UserMenu.tsx'
import { freeSubscription, freeUsage } from './accountFixtures.ts'

const auth = vi.hoisted(() => ({
  session: { email: 'reader@example.com', accessToken: 'token-1' },
  logout: vi.fn(),
}))
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => auth }))
vi.mock('../profile/useProfile.ts', () => ({ useProfile: () => ({
  profile: { display_name: 'Reader' },
}) }))

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}
type Result = unknown | (() => Promise<Response>)
function installApi(usage: Result = freeUsage, subscription: Result = freeSubscription) {
  const values = { usage, subscription }
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const key = String(input) === '/api/account/usage' ? 'usage'
      : String(input) === '/api/account/subscription' ? 'subscription' : null
    if (!key) throw new Error('Unexpected request: ' + String(input))
    const value = values[key]
    return typeof value === 'function' ? (value as () => Promise<Response>)() : json(value)
  })
  vi.stubGlobal('fetch', mock)
  return { mock, values }
}
function TestApp() {
  return <PreferencesProvider><MemoryRouter initialEntries={['/plans']}>
    <AccountProvider key={auth.session.email}>
      <UserMenu isCollapsed={false} />
      <Routes>
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/" element={<h1>Workspace</h1>} />
      </Routes>
    </AccountProvider>
  </MemoryRouter></PreferencesProvider>
}
const renderPage = () => render(<TestApp />)
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  auth.session = { email: 'reader@example.com', accessToken: 'token-1' }
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.lang = ''
})

describe('account API contract', () => {
  it('accepts finite and unlimited allowances, including occupied units above a reduced limit', () => {
    expect(parseAccountUsage(freeUsage)).toEqual(freeUsage)
    expect(parseAccountUsage({ ...freeUsage, used_units: 12, remaining_units: 0 }).used_units).toBe(12)
    expect(parseAccountUsage({ ...freeUsage, unlimited: true, limit_units: null, remaining_units: null }).unlimited).toBe(true)
  })
  it.each([
    null,
    { ...freeUsage, used_units: -1 },
    { ...freeUsage, used_units: 2.5 },
    { ...freeUsage, remaining_units: 11 },
    { ...freeUsage, remaining_units: null },
    { ...freeUsage, limit_units: 0 },
    { ...freeUsage, unlimited: true },
    { ...freeUsage, resets_at: 'invalid' },
    { ...freeUsage, period_type: 'YEAR' },
    { ...freeUsage, plan_display_name: '' },
  ])('rejects invalid usage instead of inventing a zero or Free plan: %j', (value) => {
    expect(() => parseAccountUsage(value)).toThrow()
  })
  it.each(['FREE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'])('accepts subscription status %s', (status) => {
    expect(parseAccountSubscription({ ...freeSubscription, status }).status).toBe(status)
  })
  it.each([
    null, { ...freeSubscription, status: 'UNKNOWN' },
    { ...freeSubscription, current_period_end: 'not-a-date' },
    { ...freeSubscription, cancel_at_period_end: 'false' },
  ])('rejects invalid subscriptions: %j', (value) => {
    expect(() => parseAccountSubscription(value)).toThrow()
  })
  it('uses authenticated read-only endpoints and forwards abort signals', async () => {
    const { mock } = installApi()
    const controller = new AbortController()
    await getAccountUsage({ accessToken: 'test-jwt', signal: controller.signal })
    await getAccountSubscription({ accessToken: 'test-jwt', signal: controller.signal })
    expect(mock.mock.calls.map(([input]) => input)).toEqual(['/api/account/usage', '/api/account/subscription'])
    for (const call of vi.mocked(fetch).mock.calls) {
      const options = call[1]!
      expect(options.method).toBe('GET')
      expect(new Headers(options.headers).get('Authorization')).toBe('Bearer test-jwt')
      expect(options.signal).toBe(controller.signal)
      expect(options.body).toBeUndefined()
    }
  })
})

describe('plans UI and account state', () => {
  it('shows real remaining units, progress, reset date and read-only subscription information', async () => {
    const { mock } = installApi()
    renderPage()
    expect(await screen.findByText('Осталось переводов: 7')).toBeTruthy()
    expect((screen.getByRole('progressbar') as HTMLProgressElement).value).toBe(3)
    expect((screen.getByRole('progressbar') as HTMLProgressElement).max).toBe(10)
    expect(screen.getByText('Бесплатный тариф')).toBeTruthy()
    expect(screen.getByText(/Новый период:/).textContent).toContain('2026')
    expect(screen.getByText(/до 20 МБ/)).toBeTruthy()
    expect(mock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: /Купить|Оплатить/ })).toBeNull()
  })
  it('opens the plan page from the user menu and links to the profile page', async () => {
    installApi()
    renderPage()
    await screen.findByText('Осталось переводов: 7')
    await userEvent.click(screen.getByRole('button', { name: 'Открыть меню пользователя' }))
    expect(screen.getByRole('menuitem', { name: 'Тариф и лимиты' }).getAttribute('href')).toBe('/plans')
    expect(screen.getByRole('menuitem', { name: 'Профиль' }).getAttribute('href')).toBe('/profile')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Тариф и лимиты' }))
    expect(screen.queryByRole('menu')).toBeNull()
    await userEvent.click(screen.getByRole('link', { name: 'Вернуться к рабочей области' }))
    expect(screen.getByRole('heading', { name: 'Workspace' })).toBeTruthy()
  })
  it('shows an exhausted allowance and clamps the progress without hiding already uploaded books', async () => {
    installApi({ ...freeUsage, used_units: 12, remaining_units: 0 })
    renderPage()
    await screen.findByText('Осталось переводов: 0')
    expect(screen.getByText(/Уже загруженные книги остаются/)).toBeTruthy()
    expect((screen.getByRole('progressbar') as HTMLProgressElement).value).toBe(10)
  })
  it('renders unlimited Pro without treating nullable fields as zero', async () => {
    installApi({ ...freeUsage, plan_code: 'PRO', plan_display_name: 'Pro',
      unlimited: true, limit_units: null, remaining_units: null }, {
      ...freeSubscription, plan_code: 'PRO', plan_display_name: 'Pro', status: 'ACTIVE',
      current_period_start: '2026-10-01T00:00:00Z', current_period_end: '2026-11-01T00:00:00Z',
    })
    renderPage()
    await screen.findByText('Активна')
    expect(screen.getAllByText('Безлимит').length).toBeGreaterThan(0)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/Осталось переводов: 0/)).toBeNull()
    expect(screen.getByText('Конец периода')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Открыть меню пользователя' }).textContent).toContain('Pro')
  })
  it('distinguishes effective Free limits from a past-due Pro subscription', async () => {
    installApi(freeUsage, { ...freeSubscription, plan_code: 'PRO', plan_display_name: 'Pro', status: 'PAST_DUE' })
    renderPage()
    await screen.findByText('Есть задолженность')
    expect(screen.getByText(/Платная подписка не даёт расширенных/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Открыть меню пользователя' }).textContent).toContain('Free')
    const section = screen.getByRole('region', { name: 'Действующий тариф' })
    expect(within(section).getByText('Pro')).toBeTruthy()
    expect(screen.getByText('Осталось переводов: 7')).toBeTruthy()
  })
  it('shows cancellation at period end without claiming immediate cancellation', async () => {
    installApi(freeUsage, { ...freeSubscription, status: 'ACTIVE', cancel_at_period_end: true })
    renderPage()
    expect(await screen.findByText('Подписка будет отменена в конце текущего периода.')).toBeTruthy()
  })
  it('preserves usable quota information when the subscription endpoint fails', async () => {
    installApi(freeUsage, async () => json({}, 500))
    renderPage()
    await screen.findByText('Осталось переводов: 7')
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось получить подписку')
    expect((screen.getByRole('button', { name: 'Обновить данные' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('does not claim Free or zero remaining when usage is unavailable', async () => {
    installApi(async () => json({}, 500))
    renderPage()
    await screen.findByRole('alert')
    expect(screen.queryByText(/Осталось переводов:/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Открыть меню пользователя' }).textContent).not.toContain('Free')
    expect(screen.getByRole('button', { name: 'Открыть меню пользователя' }).textContent).toContain('Данные недоступны')
  })
  it('retains last values with a stale warning, then recovers on manual refresh', async () => {
    const { values } = installApi()
    renderPage()
    await screen.findByText('Осталось переводов: 7')
    values.usage = async () => { throw new TypeError('Offline') }
    await userEvent.click(screen.getByRole('button', { name: 'Обновить данные' }))
    await screen.findAllByText(/они могут быть устаревшими/)
    expect(screen.getByText('Осталось переводов: 7')).toBeTruthy()
    values.usage = { ...freeUsage, used_units: 5, remaining_units: 5 }
    await userEvent.click(screen.getByRole('button', { name: 'Обновить данные' }))
    expect(await screen.findByText('Осталось переводов: 5')).toBeTruthy()
    expect(screen.queryByText(/они могут быть устаревшими/)).toBeNull()
  })
  it('limits a hung request to 10 seconds without losing the other response', async () => {
    vi.useFakeTimers()
    installApi(() => new Promise<Response>(() => {}))
    renderPage()
    await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(screen.getByText('Бесплатный тариф')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Не удалось получить лимиты')
    expect((screen.getByRole('button', { name: 'Обновить данные' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('updates credentials without refetching just because the access token rotated', async () => {
    const { mock } = installApi()
    const view = renderPage()
    await screen.findByText('Осталось переводов: 7')
    auth.session = { ...auth.session, accessToken: 'token-2' }
    view.rerender(<TestApp />)
    expect(mock).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole('button', { name: 'Обновить данные' }))
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(4))
    const requests = vi.mocked(fetch).mock.calls
    expect(new Headers(requests[2][1]?.headers).get('Authorization')).toBe('Bearer token-2')
  })
  it('ignores a late response from the previous account', async () => {
    let finish!: (response: Response) => void
    const { values } = installApi(() => new Promise<Response>((resolve) => { finish = resolve }))
    const view = renderPage()
    await flush()
    auth.session = { email: 'another@example.com', accessToken: 'other-token' }
    values.usage = { ...freeUsage, used_units: 9, remaining_units: 1 }
    view.rerender(<TestApp />)
    await screen.findByText('Осталось переводов: 1')
    await act(async () => finish(json(freeUsage)))
    expect(screen.queryByText('Осталось переводов: 7')).toBeNull()
  })
  it('refreshes on window focus but throttles closely repeated focus events', async () => {
    vi.useFakeTimers()
    const { mock } = installApi()
    renderPage()
    await flush()
    expect(mock).toHaveBeenCalledTimes(2)
    fireEvent.focus(window)
    await flush()
    expect(mock).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_001) })
    fireEvent.focus(window)
    await flush()
    expect(mock).toHaveBeenCalledTimes(4)
  })
  it('automatically reloads at the server-supplied allowance reset boundary', async () => {
    vi.useFakeTimers()
    const { mock } = installApi({ ...freeUsage, resets_at: new Date(Date.now() + 2_000).toISOString() })
    renderPage()
    await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(2_100) })
    expect(mock).toHaveBeenCalledTimes(4)
  })
  it('supports English and dark mode using the existing preferences', async () => {
    localStorage.setItem('doctranslate.preferences.v1', JSON.stringify({ theme: 'dark', language: 'en' }))
    installApi()
    renderPage()
    expect(await screen.findByText('Translations remaining: 7')).toBeTruthy()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.lang).toBe('en')
  })
})
