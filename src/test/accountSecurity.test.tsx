import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '../api/client.ts'
import { readLinkToken } from '../auth/linkToken.ts'
import { SessionsSection } from '../components/profile/SessionsSection.tsx'
import { SecuritySection } from '../components/profile/security/SecuritySection.tsx'
import { EmailChangeLinkPage } from '../pages/EmailChangeLinkPage.tsx'
import { LoginPage } from '../pages/LoginPage.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import { installDialogPolyfill } from './dialogPolyfill.ts'
import { TestQueryProvider } from './queryWrapper.tsx'

const api = vi.hoisted(() => ({
  changePassword: vi.fn(), requestEmailChange: vi.fn(), confirmEmailChange: vi.fn(), cancelEmailChange: vi.fn(),
  listSessions: vi.fn(), revokeSession: vi.fn(), getSecondFactorStatus: vi.fn(), setupSecondFactor: vi.fn(),
  enableSecondFactor: vi.fn(), disableSecondFactor: vi.fn(), regenerateRecoveryCodes: vi.fn(),
}))
vi.mock('../api/accountSecurity.ts', () => api)
const auth = vi.hoisted(() => ({
  session: { email: 'reader@example.com', accessToken: 'jwt', emailVerified: true, expiresAt: Date.now() + 600_000 },
  isAuthenticated: false, isRestoring: false,
  login: vi.fn(), completeSecondFactor: vi.fn(), replaceSession: vi.fn(),
  invalidateSession: vi.fn(), logoutEverywhere: vi.fn(),
}))
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => auth }))
vi.mock('../profile/useProfile.ts', () => ({ useProfile: () => ({ isMutating: false }) }))

const apiError = (status: number, code: string, message = 'Ошибка') =>
  new ApiClientError(message, status, { timestamp: '', status, code, message, path: '', fieldErrors: {}, correlation_id: '' }, null, null)

const now = new Date()
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString()

function renderProfileParts() {
  return render(<PreferencesProvider><MemoryRouter><TestQueryProvider>
    <SecuritySection email="reader@example.com" />
    <SessionsSection />
  </TestQueryProvider></MemoryRouter></PreferencesProvider>)
}
const securityRow = (title: string) => screen.getByText(title, { selector: 'p' }).closest('li')!

let restoreDialog: () => void
beforeEach(() => {
  restoreDialog = installDialogPolyfill()
  for (const mock of [...Object.values(api), auth.login, auth.completeSecondFactor, auth.replaceSession, auth.invalidateSession]) mock.mockReset()
  api.listSessions.mockResolvedValue([])
  api.getSecondFactorStatus.mockResolvedValue({ enabled: false, recoveryCodesLeft: 0 })
  auth.replaceSession.mockImplementation(async (perform: (token: string) => Promise<unknown>) => { await perform('jwt') })
})
afterEach(() => {
  cleanup()
  restoreDialog()
})

describe('links from emails', () => {
  it('reads the token from the fragment and still accepts old links with a query', () => {
    expect(readLinkToken({ hash: '#token=abc', search: '' })).toBe('abc')
    expect(readLinkToken({ hash: '', search: '?token=old' })).toBe('old')
    expect(readLinkToken({ hash: '', search: '' })).toBe('')
  })

  it('confirms the new email only on a click and ends the local session', async () => {
    const user = userEvent.setup()
    api.confirmEmailChange.mockResolvedValue(undefined)
    render(<PreferencesProvider><MemoryRouter initialEntries={['/confirm-email-change#token=t-1']}>
      <Routes><Route path="/confirm-email-change" element={<EmailChangeLinkPage action="confirm" />} /></Routes>
    </MemoryRouter></PreferencesProvider>)

    // Открытие ссылки само ничего не отправляет: её мог открыть почтовый сканер.
    expect(api.confirmEmailChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Подтвердить новую почту' }))
    expect(api.confirmEmailChange).toHaveBeenCalledWith({ token: 't-1' })
    expect(await screen.findByRole('heading', { name: 'Почта изменена' })).toBeTruthy()
    expect(auth.invalidateSession).toHaveBeenCalled()
  })

  it('explains a used link and a taken address', async () => {
    const user = userEvent.setup()
    api.cancelEmailChange.mockRejectedValue(apiError(400, 'INVALID_ACTION_LINK'))
    render(<PreferencesProvider><MemoryRouter initialEntries={['/cancel-email-change#token=t-2']}>
      <Routes><Route path="/cancel-email-change" element={<EmailChangeLinkPage action="cancel" />} /></Routes>
    </MemoryRouter></PreferencesProvider>)
    await user.click(screen.getByRole('button', { name: 'Отменить смену почты' }))
    expect((await screen.findByRole('alert')).textContent).toContain('обратитесь в поддержку')
    expect(auth.invalidateSession).not.toHaveBeenCalled()
  })
})

describe('sign-in with a second factor', () => {
  function renderLogin() {
    return render(<PreferencesProvider><MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<h1>Книги</h1>} />
      </Routes>
    </MemoryRouter></PreferencesProvider>)
  }
  async function passPassword(user: ReturnType<typeof userEvent.setup>) {
    auth.login.mockResolvedValue({ status: 'second-factor', challenge: 'c-1', email: 'reader@example.com', expiresAt: Date.now() + 300_000 })
    renderLogin()
    await user.type(screen.getByLabelText('Email'), 'reader@example.com')
    await user.type(screen.getByLabelText('Пароль'), 'secret-password')
    await user.click(screen.getByRole('button', { name: 'Войти' }))
    await screen.findByRole('heading', { name: 'Код подтверждения' })
  }

  it('asks for the app code after the password and signs in with it', async () => {
    const user = userEvent.setup()
    await passPassword(user)
    auth.completeSecondFactor.mockResolvedValue(undefined)

    await user.type(screen.getByLabelText('Код из приложения'), '12345')
    await user.click(screen.getByRole('button', { name: 'Подтвердить' }))
    expect(screen.getByRole('alert').textContent).toBe('Код — шесть цифр.')
    expect(auth.completeSecondFactor).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Код из приложения'), '6')
    await user.click(screen.getByRole('button', { name: 'Подтвердить' }))
    expect(auth.completeSecondFactor).toHaveBeenCalledWith({ challenge: 'c-1', code: '123456' }, 'reader@example.com')
    expect(await screen.findByRole('heading', { name: 'Книги' })).toBeTruthy()
  })

  it('accepts a recovery code and reports a wrong one', async () => {
    const user = userEvent.setup()
    await passPassword(user)
    auth.completeSecondFactor.mockRejectedValueOnce(apiError(400, 'INVALID_SECOND_FACTOR_CODE'))

    await user.click(screen.getByRole('button', { name: 'Нет телефона? Войти резервным кодом' }))
    await user.type(screen.getByLabelText('Резервный код'), 'abcd-efgh-ijkl')
    await user.click(screen.getByRole('button', { name: 'Подтвердить' }))
    expect(auth.completeSecondFactor).toHaveBeenCalledWith({ challenge: 'c-1', recoveryCode: 'abcd-efgh-ijkl' }, 'reader@example.com')
    expect((await screen.findByRole('alert')).textContent).toContain('Неверный код')
  })

  it('returns to the password when the time for the code ran out', async () => {
    const user = userEvent.setup()
    await passPassword(user)
    auth.completeSecondFactor.mockRejectedValue(apiError(401, 'LOGIN_CHALLENGE_EXPIRED'))
    await user.type(screen.getByLabelText('Код из приложения'), '123456')
    await user.click(screen.getByRole('button', { name: 'Подтвердить' }))
    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Время на ввод кода истекло')
    expect((screen.getByLabelText('Пароль') as HTMLInputElement).value).toBe('')
  })
})

describe('sign-in and security in the profile', () => {
  it('changes the password through a new session and shows a wrong current password at its field', async () => {
    const user = userEvent.setup()
    api.changePassword.mockRejectedValueOnce(apiError(400, 'INVALID_CURRENT_PASSWORD')).mockResolvedValueOnce({})
    renderProfileParts()
    const row = securityRow('Пароль')
    await user.click(within(row).getByRole('button', { name: 'Изменить пароль' }))
    await user.type(within(row).getByLabelText('Текущий пароль'), 'old-password')
    await user.type(within(row).getByLabelText('Новый пароль'), 'short')
    await user.click(within(row).getByRole('button', { name: 'Сменить пароль' }))
    expect(within(row).getByRole('alert').textContent).toContain('от 8 до 72')
    expect(api.changePassword).not.toHaveBeenCalled()

    await user.type(within(row).getByLabelText('Новый пароль'), '-but-longer')
    await user.click(within(row).getByRole('button', { name: 'Сменить пароль' }))
    expect((await within(row).findByRole('alert')).textContent).toContain('Неверный пароль')
    expect(within(row).getByLabelText('Текущий пароль').getAttribute('aria-invalid')).toBe('true')

    await user.click(within(row).getByRole('button', { name: 'Сменить пароль' }))
    expect(api.changePassword).toHaveBeenLastCalledWith(
      { currentPassword: 'old-password', newPassword: 'short-but-longer' }, { accessToken: 'jwt' })
    expect((await within(row).findByRole('status')).textContent).toContain('Пароль изменён')
    expect(auth.replaceSession).toHaveBeenCalledTimes(2)
  })

  it('sends the email change link and says the change waits for the letter', async () => {
    const user = userEvent.setup()
    api.requestEmailChange.mockResolvedValue(undefined)
    renderProfileParts()
    const row = securityRow('Почта')
    await user.click(within(row).getByRole('button', { name: 'Изменить почту' }))
    await user.type(within(row).getByLabelText('Новая почта'), 'new@example.com')
    await user.type(within(row).getByLabelText('Текущий пароль'), 'secret-password')
    await user.click(within(row).getByRole('button', { name: 'Отправить письмо' }))
    expect(api.requestEmailChange).toHaveBeenCalledWith(
      { newEmail: 'new@example.com', currentPassword: 'secret-password' }, { accessToken: 'jwt' })
    expect((await within(row).findByRole('status')).textContent).toContain('new@example.com')
    expect(within(row).getByText('reader@example.com')).toBeTruthy()
  })

  it('turns on two-step verification and shows the recovery codes once', async () => {
    const user = userEvent.setup()
    api.setupSecondFactor.mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Parallel:reader?secret=JBSWY3DPEHPK3PXP' })
    api.enableSecondFactor.mockResolvedValue({ recoveryCodes: ['aaaa-bbbb-cccc', 'dddd-eeee-ffff'] })
    renderProfileParts()
    const row = securityRow('Двухэтапная проверка')
    await user.click(await within(row).findByRole('button', { name: 'Включить' }))
    await user.type(within(row).getByLabelText('Текущий пароль'), 'secret-password')
    await user.click(within(row).getByRole('button', { name: 'Продолжить' }))
    expect(api.setupSecondFactor).toHaveBeenCalledWith('secret-password', { accessToken: 'jwt' })

    expect(await within(row).findByText('JBSW Y3DP EHPK 3PXP')).toBeTruthy()
    expect(within(row).getByRole('link', { name: 'Открыть в приложении' }).getAttribute('href')).toMatch(/^otpauth:/)
    await user.type(within(row).getByLabelText('Код из приложения'), '654321')
    await user.click(within(row).getByRole('button', { name: 'Включить' }))
    expect(api.enableSecondFactor).toHaveBeenCalledWith('654321', { accessToken: 'jwt' })

    const dialog = await screen.findByRole('dialog', { name: 'Сохраните резервные коды' })
    expect(within(dialog).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['aaaa-bbbb-cccc', 'dddd-eeee-ffff'])
    await user.click(within(dialog).getByRole('button', { name: 'Я сохранил коды' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(row).getByText('Включена')).toBeTruthy()
    expect(within(row).getByText(/Резервных кодов осталось: 2/)).toBeTruthy()
  })

  it('turns verification off with a recovery code', async () => {
    const user = userEvent.setup()
    api.getSecondFactorStatus.mockResolvedValue({ enabled: true, recoveryCodesLeft: 1 })
    api.disableSecondFactor.mockResolvedValue(undefined)
    renderProfileParts()
    const row = securityRow('Двухэтапная проверка')
    expect((await within(row).findByText(/почти закончились/))).toBeTruthy()
    await user.click(within(row).getByRole('button', { name: 'Выключить' }))
    await user.type(within(row).getByLabelText('Текущий пароль'), 'secret-password')
    await user.click(within(row).getByRole('button', { name: 'Нет телефона? Войти резервным кодом' }))
    await user.type(within(row).getByLabelText('Резервный код'), 'aaaa-bbbb-cccc')
    await user.click(within(row).getByRole('button', { name: 'Выключить' }))
    expect(api.disableSecondFactor).toHaveBeenCalledWith(
      { currentPassword: 'secret-password', recoveryCode: 'aaaa-bbbb-cccc' }, { accessToken: 'jwt' })
    expect(await within(row).findByText('Выключена')).toBeTruthy()
  })

  it('reports that two-step verification is unavailable on the server', async () => {
    const user = userEvent.setup()
    api.setupSecondFactor.mockRejectedValue(apiError(503, 'SECOND_FACTOR_UNAVAILABLE'))
    renderProfileParts()
    const row = securityRow('Двухэтапная проверка')
    await user.click(await within(row).findByRole('button', { name: 'Включить' }))
    await user.type(within(row).getByLabelText('Текущий пароль'), 'secret-password')
    await user.click(within(row).getByRole('button', { name: 'Продолжить' }))
    expect((await within(row).findByRole('alert')).textContent).toContain('сейчас недоступна')
  })
})

describe('sessions in the profile', () => {
  it('lists this session first, names unknown devices and ends another session', async () => {
    const user = userEvent.setup()
    api.listSessions.mockResolvedValue([
      { id: 's-old', device: null, created_at: hoursAgo(120), last_used_at: hoursAgo(100), expires_at: hoursAgo(-60), current: false },
      { id: 's-phone', device: 'Safari, iOS', created_at: hoursAgo(80), last_used_at: hoursAgo(1), expires_at: hoursAgo(-80), current: false },
      { id: 's-here', device: 'Chrome, macOS', created_at: hoursAgo(2), last_used_at: hoursAgo(0), expires_at: hoursAgo(-160), current: true },
    ])
    api.revokeSession.mockResolvedValueOnce(undefined).mockRejectedValueOnce(apiError(404, 'SESSION_NOT_FOUND'))
    renderProfileParts()
    const list = await screen.findByRole('list', { name: 'Сеансы' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByText(/,|устройство/, { selector: 'p' }).textContent)).toEqual([
      'Chrome, macOSЭтот сеанс', 'Safari, iOS', 'Неизвестное устройство',
    ])
    expect(within(rows[0]).queryByRole('button')).toBeNull()
    expect(rows[0].textContent).toContain('Активен сейчас')

    await user.click(within(list).getByRole('button', { name: 'Завершить сеанс: Safari, iOS' }))
    expect(api.revokeSession).toHaveBeenCalledWith('s-phone', { accessToken: 'jwt' })
    await waitFor(() => expect(within(list).queryByText('Safari, iOS')).toBeNull())

    // Уже завершённый на другом устройстве сеанс просто пропадает из списка.
    await user.click(within(list).getByRole('button', { name: 'Завершить сеанс: Неизвестное устройство' }))
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
