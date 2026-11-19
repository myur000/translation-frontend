import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../pages/SettingsPage.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import { TestQueryProvider } from './queryWrapper.tsx'

const api = vi.hoisted(() => ({ getNotificationSettings: vi.fn(), updateNotificationSettings: vi.fn() }))
vi.mock('../api/notifications.ts', () => api)
const auth = vi.hoisted(() => ({
  session: { email: 'reader@example.com', accessToken: 'jwt', emailVerified: true, expiresAt: Date.now() + 600_000 },
}))
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => auth }))

function renderSettings() {
  return render(<PreferencesProvider><MemoryRouter><TestQueryProvider><SettingsPage /></TestQueryProvider></MemoryRouter></PreferencesProvider>)
}
const toggle = () => screen.findByRole('switch', { name: /Перевод готов/ })

beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset()
  auth.session = { ...auth.session, emailVerified: true }
  api.getNotificationSettings.mockResolvedValue({ document_ready: true })
})
afterEach(cleanup)

describe('email notifications in settings', () => {
  it('shows the saved choice and saves a change right away', async () => {
    const user = userEvent.setup()
    api.updateNotificationSettings.mockImplementation(async (settings: unknown) => settings)
    renderSettings()
    expect(screen.getByText(/Письма на reader@example.com/)).toBeTruthy()
    const control = await toggle()
    expect((control as HTMLInputElement).checked).toBe(true)

    await user.click(control)
    expect((control as HTMLInputElement).checked).toBe(false)
    expect(api.updateNotificationSettings).toHaveBeenCalledWith({ document_ready: false }, { accessToken: 'jwt' })
    expect(await screen.findByText('Сохранено.')).toBeTruthy()
  })

  it('puts the switch back when saving fails and saves on retry', async () => {
    const user = userEvent.setup()
    api.updateNotificationSettings.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(async (settings: unknown) => settings)
    renderSettings()
    const control = await toggle()
    await user.click(control)

    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось сохранить')
    await waitFor(() => expect((control as HTMLInputElement).checked).toBe(true))

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect((control as HTMLInputElement).checked).toBe(false))
    expect(api.updateNotificationSettings).toHaveBeenLastCalledWith({ document_ready: false }, { accessToken: 'jwt' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('warns that letters need a confirmed email', async () => {
    auth.session = { ...auth.session, emailVerified: false }
    renderSettings()
    await toggle()
    expect(screen.getByText(/только на подтверждённую почту/)).toBeTruthy()
  })

  it('offers a retry when the settings cannot be loaded', async () => {
    const user = userEvent.setup()
    api.getNotificationSettings.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderSettings()
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить настройки писем')
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await toggle()).toBeTruthy()
  })
})
