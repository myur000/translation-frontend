import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import App from '../App.tsx'
import { apiClient } from '../api/client.ts'
import { AUTH_SESSION_STORAGE_KEY } from '../auth/authStorage.ts'
import { installBrowserSessionMock } from './browserSessionMock.ts'

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.lang = ''
  vi.unstubAllGlobals()
})

function renderApp(path = '/') {
  installBrowserSessionMock()
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

function createJwt(
  email = 'reader@example.com',
  emailVerified = true,
  expiresAt = Math.floor(Date.now() / 1000) + 3600,
) {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'user-1',
    email,
    email_verified: emailVerified,
    exp: expiresAt,
  })}.signature`
}

function seedSession(emailVerified = true) {
  sessionStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: createJwt('reader@example.com', emailVerified),
      email: 'reader@example.com',
      emailVerified,
      expiresAt: Date.now() + 3_600_000,
    }),
  )
}

function apiErrorResponse(status: 401 | 403, message: string) {
  return new Response(
    JSON.stringify({
      timestamp: '2026-10-05T00:00:00Z',
      status,
      message,
      path: '/api/protected',
      fieldErrors: {},
      correlation_id: `correlation-${status}`,
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

describe('authentication flow', () => {
  it('switches the authentication screen theme with the header icon', async () => {
    const user = userEvent.setup()
    renderApp('/login')

    await user.click(
      screen.getByRole('button', { name: 'Включить тёмную тему' }),
    )
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(
      screen.getByRole('button', { name: 'Включить светлую тему' }),
    ).toBeTruthy()

    await user.click(
      screen.getByRole('button', { name: 'Включить светлую тему' }),
    )
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('redirects an anonymous user from a protected route to login', async () => {
    renderApp('/history')

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeTruthy()
    expect(screen.queryByText('История переводов')).toBeNull()
  })

  it('does not expose a development demo bypass', () => {
    renderApp('/login')

    expect(screen.queryByRole('button', { name: 'Заполнить' })).toBeNull()
    expect(screen.queryByText(/demo@local\.test/)).toBeNull()
  })

  it('logs in, keeps the JWT in memory and returns to the requested route', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: createJwt(),
          tokenType: 'Bearer',
          expiresIn: 3600,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderApp('/history')

    await screen.findByRole('heading', { name: 'Вход' })
    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(
      await screen.findByRole('heading', { name: 'История переводов' }),
    ).toBeTruthy()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/auth/login')
    expect(init.body).toBe(
      JSON.stringify({
        email: 'reader@example.com',
        password: 'password123',
      }),
    )
  })

  it('returns from registration to login with the header arrow', async () => {
    const user = userEvent.setup()
    renderApp('/register')

    await user.click(
      screen.getByRole('link', { name: 'Вернуться ко входу' }),
    )

    expect(screen.getByRole('heading', { name: 'Вход' })).toBeTruthy()
  })

  it('registers an account and shows the email verification handoff', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'user-1',
          email: 'new@example.com',
          createdAt: '2026-10-05T00:00:00Z',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderApp('/register')

    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'password123')
    await user.type(screen.getByLabelText('Повторите пароль'), 'password123')
    await user.click(
      screen.getByRole('button', { name: 'Создать аккаунт' }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Аккаунт создан' }),
    ).toBeTruthy()
    expect(screen.getByText(/new@example\.com/)).toBeTruthy()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/register')
  })

  it('shows the email verification banner and resends the email', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    seedSession(false)
    vi.stubGlobal('fetch', fetchMock)
    renderApp()

    expect(
      screen.getByRole('region', { name: 'Подтверждение email' }),
    ).toBeTruthy()

    await user.click(
      screen.getByRole('button', { name: 'Отправить повторно' }),
    )

    expect(await screen.findByText('Новое письмо отправлено.')).toBeTruthy()
    const resendCall = fetchMock.mock.calls.find(
      ([url]) => url === '/api/auth/email-verification/request',
    )
    expect(resendCall).toBeTruthy()
    expect(resendCall?.[1].body).toBe(
      JSON.stringify({ email: 'reader@example.com' }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Скрыть напоминание о подтверждении email',
      }),
    )
    expect(
      screen.queryByRole('region', { name: 'Подтверждение email' }),
    ).toBeNull()
  })

  it('rejects an expired JWT restored from storage', async () => {
    sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: createJwt(
          'reader@example.com',
          true,
          Math.floor(Date.now() / 1000) - 60,
        ),
        email: 'reader@example.com',
        emailVerified: true,
        expiresAt: Date.now() + 3_600_000,
      }),
    )

    renderApp()

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeTruthy()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('logs out locally and removes the JWT session', async () => {
    const user = userEvent.setup()
    seedSession()
    renderApp()

    await user.click(
      screen.getByRole('button', { name: 'Открыть меню пользователя' }),
    )
    await user.click(screen.getByRole('menuitem', { name: 'Выйти' }))

    expect(screen.getByRole('heading', { name: 'Вход' })).toBeTruthy()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('confirms email from a token link and clears the stale session', async () => {
    const token = 'verification-token-1234567890'
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    seedSession(false)
    vi.stubGlobal('fetch', fetchMock)
    renderApp(`/verify-email?token=${token}`)

    expect(
      await screen.findByRole('heading', { name: 'Email подтверждён' }),
    ).toBeTruthy()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/auth/email-verification/confirm',
    )
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ token }))
  })

  it('rejects an email verification link without a token locally', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderApp('/verify-email')

    expect(
      screen.getByRole('heading', { name: 'Не удалось подтвердить email' }),
    ).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requests a password reset without exposing account existence', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    renderApp('/forgot-password')

    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }))

    expect(
      await screen.findByRole('heading', { name: 'Проверьте почту' }),
    ).toBeTruthy()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/password-reset/request')
  })

  it('sets a new password from a reset token', async () => {
    const user = userEvent.setup()
    const token = 'password-reset-token-123456'
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    renderApp(`/reset-password?token=${token}`)

    await user.type(screen.getByLabelText('Новый пароль'), 'new-password-123')
    await user.type(
      screen.getByLabelText('Повторите новый пароль'),
      'new-password-123',
    )
    await user.click(
      screen.getByRole('button', { name: 'Сохранить новый пароль' }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Пароль изменён' }),
    ).toBeTruthy()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/password-reset/confirm')
    expect(fetchMock.mock.calls[0][1].body).toBe(
      JSON.stringify({ token, password: 'new-password-123' }),
    )
  })

  it('clears the session and returns to login after a 401 response', async () => {
    seedSession()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(apiErrorResponse(401, 'Требуется вход')),
    )
    renderApp()

    expect(screen.getByText('Мои книги')).toBeTruthy()

    await act(async () => {
      await apiClient
        .request('/protected', { accessToken: 'expired-token' })
        .catch(() => undefined)
    })

    expect(
      await screen.findByRole('heading', { name: 'Вход' }),
    ).toBeTruthy()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('keeps the session and explains a 403 response', async () => {
    seedSession()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(apiErrorResponse(403, 'Доступ запрещён')),
    )
    renderApp()

    await act(async () => {
      await apiClient
        .request('/protected', { accessToken: 'valid-token' })
        .catch(() => undefined)
    })

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Действие недоступно',
    )
    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })
})
