import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAvatar, getAvatar, uploadAvatar } from '../api/profile.ts'
import { logoutAll } from '../api/auth.ts'
import { ProfileProvider } from '../profile/ProfileProvider.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import { ProfilePage } from '../pages/ProfilePage.tsx'
import { UserMenu } from '../components/user/UserMenu.tsx'
import type { ProfileResponse } from '../api/contracts/profile.ts'

const auth = vi.hoisted(() => ({
  session: { email: 'reader@example.com', accessToken: 'token-1' },
  logout: vi.fn(), logoutEverywhere: vi.fn(),
}))
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => auth }))
vi.mock('../account/useAccount.ts', () => ({ useAccount: () => ({
  usage: { loading: false, failed: false, data: { plan_display_name: 'Free' } },
}) }))
const initial: ProfileResponse = {
  user_id: 'reader', email: 'reader@example.com', username: 'Reader_1', display_name: 'Reader',
  nickname: 'Nick', profession: 'Developer', bio: 'About reader', has_avatar: false,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}
function binary(type = 'image/png') {
  return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { 'Content-Type': type } })
}
function installApi(hasAvatar = false) {
  const options = {
    profile: { ...initial, has_avatar: hasAvatar },
    get: (): Promise<Response> => Promise.resolve(binary()),
    mutate: (_init: RequestInit): Promise<Response> => Promise.resolve(new Response(null, { status: 204 })),
  }
  const fetcher = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input)
    if (path === '/api/profile/avatar') {
      if (init?.method === 'GET') return options.get()
      const response = await options.mutate(init)
      if (response.ok) options.profile = { ...options.profile, has_avatar: init?.method === 'PUT' }
      return response
    }
    if (path === '/api/profile') {
      if (init?.method === 'PUT') options.profile = { ...options.profile, ...JSON.parse(String(init?.body)) }
      return json(options.profile)
    }
    if (path === '/api/auth/logout-all') return new Response(null, { status: 204 })
    throw new Error('Unexpected request ' + path)
  })
  vi.stubGlobal('fetch', fetcher)
  return { options, fetcher }
}
function TestApp() {
  return <PreferencesProvider><MemoryRouter initialEntries={['/profile']}>
    <ProfileProvider key={auth.session.email}>
      <UserMenu isCollapsed={false} />
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/" element={<h1>Workspace</h1>} />
        <Route path="/login" element={<h1>Login</h1>} />
      </Routes>
    </ProfileProvider>
  </MemoryRouter></PreferencesProvider>
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
const file = (type = 'image/png', content: BlobPart = 'png') => new File([content], 'photo.png', { type })
async function ready() { return screen.findByLabelText('Имя') }
function selectFile(image = file()) {
  fireEvent.change(screen.getByLabelText('Выбрать файл аватара'), { target: { files: [image] } })
}
const revoke = vi.fn()
const createUrl = vi.fn()
const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
beforeEach(() => {
  let id = 0
  const OriginalURL = URL
  class TestURL extends OriginalURL {
    static createObjectURL = createUrl.mockImplementation(() => 'blob:avatar-' + (++id))
    static revokeObjectURL = revoke
  }
  vi.stubGlobal('URL', TestURL)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true,
    value: function(this: HTMLDialogElement) { this.open = true } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true,
    value: function(this: HTMLDialogElement) { this.open = false } })
  auth.logoutEverywhere.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  createUrl.mockReset()
  revoke.mockReset()
  auth.session = { email: 'reader@example.com', accessToken: 'token-1' }
  localStorage.clear()
  if (showModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', showModal)
  else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>).showModal
  if (close) Object.defineProperty(HTMLDialogElement.prototype, 'close', close)
  else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>).close
})

describe('avatar API', () => {
  it('uploads multipart file without overriding the boundary, with JWT and cancellation', async () => {
    const { fetcher } = installApi()
    const image = file()
    const controller = new AbortController()
    await uploadAvatar(image, { accessToken: 'jwt', signal: controller.signal })
    const [, init] = fetcher.mock.calls[0]
    expect(init?.method).toBe('PUT')
    expect(init?.signal).toBe(controller.signal)
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt')
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
    const body = init?.body
    if (!(body instanceof FormData)) throw new Error('Expected multipart body')
    expect(body.get('file')).toBe(image)
  })
  it('downloads only supported binary images and deletes using JWT', async () => {
    const { fetcher } = installApi()
    expect((await getAvatar({ accessToken: 'jwt' })).type).toBe('image/png')
    await deleteAvatar({ accessToken: 'jwt' })
    expect(fetcher.mock.calls[1][1]?.method).toBe('DELETE')
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer jwt')
  })
  it('rejects a non-image response instead of creating a URL', async () => {
    const { options } = installApi()
    options.get = async () => binary('text/html')
    await expect(getAvatar({ accessToken: 'jwt' })).rejects.toThrow('Invalid avatar response')
  })
  it('does not wait indefinitely for logout-all when its external signal is aborted', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const controller = new AbortController()
    const result = logoutAll({ accessToken: 'jwt', signal: controller.signal })
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
  })
  it('bounds logout-all and sends JWT with credentials', async () => {
    const { fetcher } = installApi()
    await logoutAll({ accessToken: 'jwt' })
    const [, init] = fetcher.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    expect(init?.signal).toBeDefined()
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer jwt')
  })
})

describe('profile avatar UI', () => {
  it('does not request an absent avatar', async () => {
    const { fetcher } = installApi()
    render(<TestApp />)
    await ready()
    expect(screen.getByRole('button', { name: 'Загрузить фото' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Удалить фото' })).toBeNull()
    expect(fetcher.mock.calls).toHaveLength(1)
  })
  it('shows one authenticated avatar in both menu and profile, and releases its URL', async () => {
    const { fetcher } = installApi(true)
    const view = render(<TestApp />)
    await screen.findByAltText('Аватар пользователя')
    expect(document.querySelectorAll('img[src="blob:avatar-1"]')).toHaveLength(2)
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/avatar'))).toHaveLength(1)
    view.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:avatar-1')
  })
  it('uploads and replaces photos without resetting an unsaved name', async () => {
    const { options, fetcher } = installApi()
    render(<TestApp />)
    fireEvent.change(await ready(), { target: { value: 'Local draft' } })
    selectFile()
    await screen.findByText('Фото профиля обновлено.')
    await screen.findByAltText('Аватар пользователя')
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Local draft')
    expect(options.profile.has_avatar).toBe(true)
    selectFile()
    await waitFor(() => expect(createUrl).toHaveBeenCalledTimes(2))
    expect(revoke).toHaveBeenCalledWith('blob:avatar-1')
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(2)
    expect(document.querySelectorAll('img[src="blob:avatar-2"]')).toHaveLength(2)
    expect((screen.getByLabelText('Выбрать файл аватара') as HTMLInputElement).value).toBe('')
  })
  it('removes a photo, updates the menu and keeps hidden profile fields intact', async () => {
    const { options } = installApi(true)
    render(<TestApp />)
    await screen.findByAltText('Аватар пользователя')
    fireEvent.click(screen.getByRole('button', { name: 'Удалить фото' }))
    await screen.findByText('Фото профиля удалено.')
    expect(screen.queryByAltText('Аватар пользователя')).toBeNull()
    expect(options.profile).toMatchObject({ ...initial, has_avatar: false })
    expect(revoke).toHaveBeenCalledWith('blob:avatar-1')
  })
  it.each([file('image/gif'), file('image/svg+xml'), file('image/png', '')])(
    'rejects an unsupported or empty image without a request', async (image) => {
      const { fetcher } = installApi()
      render(<TestApp />)
      await ready()
      selectFile(image)
      expect(screen.getByRole('alert').textContent).toContain('JPEG или PNG')
      expect(fetcher).toHaveBeenCalledTimes(1)
    })
  it('rejects files larger than two MiB before uploading', async () => {
    const { fetcher } = installApi()
    render(<TestApp />)
    await ready()
    selectFile(file('image/png', new Uint8Array(2 * 1024 * 1024 + 1)))
    expect(screen.getByRole('alert').textContent).toContain('2 МБ')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([400, 413, 429, 500])('preserves the existing photo when the server rejects upload: %s', async (status) => {
    const { options } = installApi(true)
    render(<TestApp />)
    await screen.findByAltText('Аватар пользователя')
    options.mutate = async () => json({}, status)
    selectFile()
    await screen.findByRole('alert')
    expect(document.querySelectorAll('img[src="blob:avatar-1"]')).toHaveLength(2)
    expect(screen.queryByText('Фото профиля обновлено.')).toBeNull()
    expect((screen.getByRole('button', { name: 'Заменить фото' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('preserves the photo on a failed delete', async () => {
    const { options } = installApi(true)
    render(<TestApp />)
    await screen.findByAltText('Аватар пользователя')
    options.mutate = async () => json({}, 500)
    fireEvent.click(screen.getByRole('button', { name: 'Удалить фото' }))
    await screen.findByRole('alert')
    expect(screen.getByAltText('Аватар пользователя')).toBeTruthy()
    expect(screen.queryByText('Фото профиля удалено.')).toBeNull()
  })
  it('blocks duplicate uploads and name writes during an avatar mutation', async () => {
    let finish!: (response: Response) => void
    const { options, fetcher } = installApi()
    options.mutate = () => new Promise((resolve) => { finish = resolve })
    render(<TestApp />)
    fireEvent.change(await ready(), { target: { value: 'Draft' } })
    selectFile()
    selectFile()
    await flush()
    expect((screen.getByLabelText('Имя') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true)
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
    await act(async () => finish(new Response(null, { status: 204 })))
    await screen.findByText('Фото профиля обновлено.')
  })
  it('times out a hung mutation after 15 seconds without a false success', async () => {
    vi.useFakeTimers()
    const { options } = installApi()
    options.mutate = () => new Promise(() => {})
    render(<TestApp />)
    await flush()
    selectFile()
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001) })
    expect(screen.getByRole('alert').textContent).toContain('Не удалось подтвердить изменение')
    expect((screen.getByRole('button', { name: 'Загрузить фото' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText('Фото профиля обновлено.')).toBeNull()
  })
  it('times out a hung avatar GET after 10 seconds and retries without changing the profile', async () => {
    vi.useFakeTimers()
    const { options } = installApi(true)
    options.get = () => new Promise(() => {})
    render(<TestApp />)
    await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_001) })
    expect(screen.getByRole('alert').textContent).toContain('Не удалось показать аватар')
    options.get = async () => binary()
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    await flush()
    expect(screen.getByAltText('Аватар пользователя')).toBeTruthy()
    expect(options.profile.display_name).toBe('Reader')
  })
  it('treats 404 as no photo, and falls back to initials if an image cannot decode', async () => {
    const { options } = installApi(true)
    options.get = async () => new Response(null, { status: 404 })
    render(<TestApp />)
    await ready()
    await flush()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByAltText('Аватар пользователя')).toBeNull()
    cleanup()
    installApi(true)
    render(<TestApp />)
    const image = await screen.findByAltText('Аватар пользователя')
    fireEvent.error(image)
    expect(screen.queryByAltText('Аватар пользователя')).toBeNull()
  })
  it('ignores a late mutation after leaving the profile page', async () => {
    let finish!: (response: Response) => void
    const { options, fetcher } = installApi()
    options.mutate = () => new Promise((resolve) => { finish = resolve })
    render(<TestApp />)
    await ready()
    selectFile()
    await flush()
    fireEvent.click(screen.getByRole('link', { name: 'Вернуться к рабочей области' }))
    const put = fetcher.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(put?.[1]?.signal?.aborted).toBe(true)
    await act(async () => finish(new Response(null, { status: 204 })))
    expect(createUrl).not.toHaveBeenCalled()
  })
  it('ignores avatar responses from a previous account', async () => {
    let finish!: (response: Response) => void
    const { options } = installApi(true)
    options.get = () => new Promise((resolve) => { finish = resolve })
    const view = render(<TestApp />)
    await ready()
    await flush()
    auth.session = { email: 'another@example.com', accessToken: 'other-token' }
    options.profile = { ...initial, user_id: 'another', email: auth.session.email }
    view.rerender(<TestApp />)
    await waitFor(() => expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(auth.session.email))
    await act(async () => finish(binary()))
    expect(createUrl).not.toHaveBeenCalled()
  })
})

describe('sign out on all devices', () => {
  it('asks for confirmation, focuses cancel, and cancels without sending a request', async () => {
    installApi()
    render(<TestApp />)
    await ready()
    const trigger = screen.getByRole('button', { name: 'Выйти на всех устройствах' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('alertdialog')
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(auth.logoutEverywhere).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
  it('closes on Escape without logging out', async () => {
    installApi()
    render(<TestApp />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Выйти на всех устройствах' }))
    fireEvent(screen.getByRole('alertdialog'), new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(auth.logoutEverywhere).not.toHaveBeenCalled()
  })
  it('calls the existing session logic once and navigates to login after success', async () => {
    let finish!: () => void
    auth.logoutEverywhere.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    installApi()
    render(<TestApp />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Выйти на всех устройствах' }))
    fireEvent.click(screen.getByRole('button', { name: 'Выйти везде' }))
    fireEvent.click(screen.getByRole('button', { name: 'Завершаем сессии…' }))
    expect(auth.logoutEverywhere).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Отмена' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => finish())
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeTruthy()
  })
  it('keeps the session and offers retry when logout fails', async () => {
    auth.logoutEverywhere.mockRejectedValueOnce(new Error('Network unavailable'))
    installApi()
    render(<TestApp />)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Выйти на всех устройствах' }))
    fireEvent.click(screen.getByRole('button', { name: 'Выйти везде' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось завершить все сессии')
    expect(screen.getByLabelText('Имя')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Выйти везде' }))
    expect(await screen.findByRole('heading', { name: 'Login' })).toBeTruthy()
  })
})
