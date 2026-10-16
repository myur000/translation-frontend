import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isProfileResponse, updateProfile } from '../api/profile.ts'
import type { ProfileResponse } from '../api/contracts/profile.ts'
import { ProfileProvider } from '../profile/ProfileProvider.tsx'
import { useProfile } from '../profile/useProfile.ts'
import { mapProfileFieldErrors, profileToValues, toProfileRequest, toProfileNameRequest, validateProfileName, validateProfileValues } from '../profile/profileForm.ts'
import { ProfilePage } from '../pages/ProfilePage.tsx'
import { UserMenu } from '../components/user/UserMenu.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'

const auth = vi.hoisted(() => ({
  session: { email: 'reader@example.com', accessToken: 'token-1' }, logout: vi.fn(),
}))
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => auth }))
vi.mock('../account/useAccount.ts', () => ({ useAccount: () => ({
  usage: { loading: false, failed: false, data: { plan_code: 'FREE', plan_display_name: 'Free' } },
}) }))
const original: ProfileResponse = {
  user_id: '00000000-0000-0000-0000-000000000001', email: 'reader@example.com',
  username: 'Reader_1', display_name: 'Reader', nickname: 'Nick', profession: 'Developer',
  bio: 'About reader', has_avatar: false, created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}
function apiError(status: number, fieldErrors: Record<string, string> = {}) {
  return json({ timestamp: '2026-10-09T00:00:00Z', status, path: '/api/profile',
    message: 'Profile request failed', fieldErrors, correlation_id: 'profile-test' }, status)
}
function installApi(options: {
  get?: () => Promise<Response>
  put?: (request: RequestInit) => Promise<Response>
} = {}) {
  let stored = { ...original }
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== '/api/profile') throw new Error('Unexpected request: ' + String(input))
    if (init?.method === 'PUT') {
      if (options.put) return options.put(init)
      stored = { ...stored, ...JSON.parse(String(init.body)), updated_at: '2026-10-09T00:00:00Z' }
      return json(stored)
    }
    return options.get ? options.get() : json(stored)
  })
  vi.stubGlobal('fetch', mock)
  return { mock, options, current: () => stored }
}
function Probe() {
  const { profile, state, reload, save } = useProfile()
  return <><span data-testid="profile-name">{profile?.display_name}</span>
    <span data-testid="profile-state">{state}</span>
    <button onClick={() => void reload()}>Reload</button>
    <button onClick={() => void save(toProfileRequest(profileToValues(original)))}>Save probe</button></>
}
function TestApp({ probe = false }: { probe?: boolean }) {
  return <PreferencesProvider><MemoryRouter initialEntries={['/profile']}>
    <ProfileProvider key={auth.session.email}>
      <UserMenu isCollapsed={false} />
      {probe ? <Probe /> : null}
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/" element={<h1>Workspace</h1>} />
      </Routes>
    </ProfileProvider>
  </MemoryRouter></PreferencesProvider>
}
const renderPage = () => render(<TestApp />)
async function ready() { return screen.findByLabelText('Имя') }
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
function submit() {
  fireEvent.submit(screen.getByRole('button', { name: 'Сохранить' }).closest('form')!)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  auth.session = { email: 'reader@example.com', accessToken: 'token-1' }
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.lang = ''
})

describe('profile contract and validation', () => {
  it('updates only the name while preserving exact hidden values and nulls in the full PUT', () => {
    const profile = { ...original, nickname: null, bio: '  Existing bio  ' }
    expect(toProfileNameRequest(profile, '  Кирилл  ')).toEqual({
      display_name: 'Кирилл', username: 'Reader_1', nickname: null,
      profession: 'Developer', bio: '  Existing bio  ',
    })
    expect(toProfileNameRequest(profile, '   ')).toEqual({
      display_name: null, username: 'Reader_1', nickname: null,
      profession: 'Developer', bio: '  Existing bio  ',
    })
    expect(profile.bio).toBe('  Existing bio  ')
  })
  it('validates only the editable name', () => {
    expect(validateProfileName('x'.repeat(80))).toEqual({})
    expect(validateProfileName('')).toEqual({})
    expect(validateProfileName('x'.repeat(81))).toEqual({ display_name: 'profile.tooLong' })
  })

  it('builds a full PUT body, trims optional fields and preserves username case', () => {
    const values = profileToValues(original)
    values.display_name = '  Кирилл  '
    values.username = ' Reader_2026 '
    values.nickname = ' '
    values.bio = '\n  My bio  \n'
    expect(toProfileRequest(values)).toEqual({
      display_name: 'Кирилл', username: 'Reader_2026', nickname: null,
      profession: 'Developer', bio: 'My bio',
    })
  })
  it.each(['ab', '1reader', 'имя', 'reader-name', 'reader.name', 'a'.repeat(31)])('rejects invalid username %s', (username) => {
    expect(validateProfileValues({ ...profileToValues(original), username }).username).toBe('profile.invalidUsername')
  })
  it.each(['Reader', 'reader_2', 'ABC', 'a12', ''])('accepts username %s', (username) => {
    expect(validateProfileValues({ ...profileToValues(original), username }).username).toBeUndefined()
  })
  it.each([['display_name', 80], ['nickname', 50], ['profession', 100], ['bio', 1000]] as const)(
    'matches the backend limit for %s', (field, limit) => {
      expect(validateProfileValues({ ...profileToValues(original), [field]: 'x'.repeat(limit + 1) })[field]).toBe('profile.tooLong')
      expect(validateProfileValues({ ...profileToValues(original), [field]: 'x'.repeat(limit) })[field]).toBeUndefined()
    })
  it('clears every optional field with null rather than omitting it', () => {
    const values = { username: '', display_name: '', nickname: '', profession: '', bio: '' }
    expect(toProfileRequest(values)).toEqual({ username: null, display_name: null, nickname: null, profession: null, bio: null })
    expect(validateProfileValues(values)).toEqual({})
  })
  it('maps Java validation names without trusting unrelated field names', () => {
    expect(mapProfileFieldErrors({ displayName: 'Too long', username: 'Invalid', other: 'Ignore' }))
      .toEqual({ display_name: 'Too long', username: 'Invalid' })
  })
  it.each([null, {}, { ...original, updated_at: 'invalid' }, { ...original, bio: 1 }, { ...original, has_avatar: null }])(
    'rejects an invalid profile response: %j', (value) => expect(isProfileResponse(value)).toBe(false))
  it('sends an authenticated PUT with all fields and an abort signal', async () => {
    const { mock } = installApi()
    const controller = new AbortController()
    const request = toProfileRequest(profileToValues(original))
    expect(await updateProfile(request, { accessToken: 'profile-jwt', signal: controller.signal })).toMatchObject(request)
    expect(mock).toHaveBeenCalledTimes(1)
    const call = vi.mocked(fetch).mock.calls[0]
    expect(call[0]).toBe('/api/profile')
    expect(call[1]?.method).toBe('PUT')
    expect(call[1]?.signal).toBe(controller.signal)
    expect(new Headers(call[1]?.headers).get('Authorization')).toBe('Bearer profile-jwt')
    expect(JSON.parse(String(call[1]?.body))).toEqual(request)
  })
})

describe('profile editing UI', () => {
  it('preserves the latest hidden fields when saving an existing name draft after reload', async () => {
    const { options, mock } = installApi()
    render(<TestApp probe />)
    fireEvent.change(await ready(), { target: { value: 'Local name' } })
    const updated = { ...original, username: 'Updated_2', nickname: null,
      profession: 'Writer', bio: 'New server bio' }
    options.get = async () => json(updated)
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await flush()
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Local name')
    submit()
    await screen.findByText('Профиль сохранён.')
    const call = mock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      display_name: 'Local name', username: 'Updated_2', nickname: null,
      profession: 'Writer', bio: 'New server bio',
    })
  })

  it('shows a general error for hidden field validation without losing the name draft', async () => {
    installApi({ put: async () => apiError(400, { username: 'Invalid hidden field' }) })
    renderPage()
    fireEvent.change(await ready(), { target: { value: 'Draft' } })
    submit()
    await screen.findByText('Проверьте заполненные поля.')
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Draft')
    expect(screen.queryByLabelText('Имя пользователя')).toBeNull()
    expect(screen.queryByText('Профиль сохранён.')).toBeNull()
  })

  it('loads existing values, keeps email readonly and prevents unchanged saves', async () => {
    const { mock } = installApi()
    renderPage()
    await ready()
    expect((screen.getByLabelText('Email') as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(original.email)
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    for (const label of ['Имя пользователя', 'Никнейм', 'Профессия', 'О себе']) {
      expect(screen.queryByLabelText(label)).toBeNull()
    }
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Reader')
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true)
    expect(mock).toHaveBeenCalledTimes(1)
  })
  it('saves, updates the menu immediately, and restores data when the form remounts', async () => {
    const { current } = installApi()
    renderPage()
    const name = await ready()
    fireEvent.change(name, { target: { value: '  Кирилл  ' } })
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await screen.findByText('Профиль сохранён.')
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Кирилл')
    expect(screen.getByRole('button', { name: 'Открыть меню пользователя' }).textContent).toContain('Кирилл')
    expect(current().username).toBe('Reader_1')
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('link', { name: 'Вернуться к рабочей области' }))
    await userEvent.click(screen.getByRole('button', { name: 'Открыть меню пользователя' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Профиль' }))
    expect((await ready() as HTMLInputElement).value).toBe('Кирилл')
  })
  it('clears only the name and preserves hidden fields and email', async () => {
    const { current } = installApi()
    renderPage()
    await ready()
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: '' } })
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await screen.findByText('Профиль сохранён.')
    expect(current()).toMatchObject({ display_name: null, username: original.username,
      nickname: original.nickname, profession: original.profession, bio: original.bio,
      email: original.email })
  })
  it('discards only the draft without a network request', async () => {
    const { mock } = installApi()
    renderPage()
    fireEvent.change(await ready(), { target: { value: 'Draft name' } })
    await userEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Reader')
    expect(mock).toHaveBeenCalledTimes(1)
  })
  it('shows local validation and focuses the field without sending a PUT', async () => {
    const { mock } = installApi()
    renderPage()
    await ready()
    const name = screen.getByLabelText('Имя')
    fireEvent.change(name, { target: { value: 'x'.repeat(81) } })
    submit()
    expect(screen.getByRole('alert').textContent).toContain('Не больше 80 символов.')
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(name)
    expect(mock).toHaveBeenCalledTimes(1)
  })
  it('shows fieldErrors from the server and preserves the draft', async () => {
    installApi({ put: async () => apiError(400, { displayName: 'Backend field error' }) })
    renderPage()
    fireEvent.change(await ready(), { target: { value: 'Draft' } })
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Backend field error')).toBeTruthy()
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Draft')
    expect(screen.getByLabelText('Имя').getAttribute('aria-invalid')).toBe('true')
  })
  it.each([403, 429, 500])('preserves the draft on HTTP %s and allows a manual retry', async (status) => {
    const { options } = installApi({ put: async () => apiError(status) })
    renderPage()
    fireEvent.change(await ready(), { target: { value: 'Draft' } })
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await screen.findByRole('alert')
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Draft')
    expect(screen.queryByText('Профиль сохранён.')).toBeNull()
    options.put = undefined
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await screen.findByText('Профиль сохранён.')
  })
  it('does not claim success when a PUT returns malformed data', async () => {
    installApi({ put: async () => json({}) })
    renderPage()
    fireEvent.change(await ready(), { target: { value: 'Draft' } })
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось подтвердить сохранение')
    expect(screen.queryByText('Профиль сохранён.')).toBeNull()
  })
  it('prevents duplicate writes while a save is in flight', async () => {
    let finish!: (response: Response) => void
    const { mock } = installApi({ put: () => new Promise((resolve) => { finish = resolve }) })
    renderPage()
    fireEvent.change(await ready(), { target: { value: 'Saved' } })
    submit()
    fireEvent.submit(screen.getByRole('button', { name: 'Сохраняем…' }).closest('form')!)
    await flush()
    expect(mock.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1)
    expect((screen.getByLabelText('Имя') as HTMLInputElement).disabled).toBe(true)
    await act(async () => finish(json({ ...original, display_name: 'Saved' })))
    await screen.findByText('Профиль сохранён.')
  })
  it('keeps a hung save bounded to 15 seconds and preserves input', async () => {
    vi.useFakeTimers()
    installApi({ put: () => new Promise(() => {}) })
    renderPage()
    await flush()
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Draft' } })
    submit()
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001) })
    expect(screen.getByRole('alert').textContent).toContain('Не удалось подтвердить сохранение')
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Draft')
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('times out a hung initial GET and recovers through retry', async () => {
    vi.useFakeTimers()
    const { options } = installApi({ get: () => new Promise(() => {}) })
    renderPage()
    await act(async () => { await vi.advanceTimersByTimeAsync(10_001) })
    expect(screen.getByRole('alert').textContent).toContain('Не удалось получить профиль')
    options.get = async () => json(original)
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить снова' }))
    await flush()
    expect(screen.getByLabelText('Имя')).toBeTruthy()
  })
  it('hides the success message after five seconds', async () => {
    vi.useFakeTimers()
    installApi()
    renderPage()
    await flush()
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Saved' } })
    submit()
    await flush()
    expect(screen.getByText('Профиль сохранён.')).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(5_001) })
    expect(screen.queryByText('Профиль сохранён.')).toBeNull()
  })
  it('uses a new JWT without refetching the profile or losing edits', async () => {
    const { mock } = installApi()
    const view = renderPage()
    fireEvent.change(await ready(), { target: { value: 'Draft' } })
    auth.session = { ...auth.session, accessToken: 'token-2' }
    view.rerender(<TestApp />)
    expect(mock).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Draft')
    submit()
    await screen.findByText('Профиль сохранён.')
    const call = mock.mock.calls.find(([, options]) => options?.method === 'PUT')
    expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe('Bearer token-2')
  })
  it('ignores an old GET response after a successful save', async () => {
    const { options } = installApi()
    render(<TestApp probe />)
    await ready()
    let finish!: (response: Response) => void
    options.get = () => new Promise((resolve) => { finish = resolve })
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await flush()
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Saved' } })
    submit()
    await screen.findByText('Профиль сохранён.')
    await act(async () => finish(json(original)))
    expect(screen.getByTestId('profile-name').textContent).toBe('Saved')
    expect(screen.getByTestId('profile-state').textContent).toBe('ready')
  })
  it('aborts a save on page navigation and does not apply a late response', async () => {
    let finish!: (response: Response) => void
    const { mock } = installApi({ put: () => new Promise((resolve) => { finish = resolve }) })
    render(<TestApp probe />)
    fireEvent.change(await ready(), { target: { value: 'Draft' } })
    submit()
    await flush()
    await userEvent.click(screen.getByRole('link', { name: 'Вернуться к рабочей области' }))
    const call = mock.mock.calls.find(([, options]) => options?.method === 'PUT')
    expect(call?.[1]?.signal?.aborted).toBe(true)
    await act(async () => finish(json({ ...original, display_name: 'Late result' })))
    expect(screen.getByTestId('profile-name').textContent).toBe('Reader')
  })
  it('supports English and dark mode', async () => {
    localStorage.setItem('doctranslate.preferences.v1', JSON.stringify({ theme: 'dark', language: 'en' }))
    installApi()
    renderPage()
    await screen.findByLabelText('Name')
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(screen.queryByLabelText('Username')).toBeNull()
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it.each([{}, { ...original, display_name: 42 }])('does not allow editing a malformed initial profile: %j', async (value) => {
    installApi({ get: async () => json(value) })
    renderPage()
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось получить профиль')
    expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull()
  })

  it('preserves a dirty draft on reload and discards it to the latest server values', async () => {
    const { options } = installApi()
    render(<TestApp probe />)
    fireEvent.change(await ready(), { target: { value: 'Local draft' } })
    options.get = async () => json({ ...original, display_name: 'Updated remotely' })
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await screen.findByText('Updated remotely', { selector: '[data-testid="profile-name"]' })
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Local draft')
    await userEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Updated remotely')
  })

  it('ignores a late GET from the previous account', async () => {
    let finish!: (response: Response) => void
    const { options } = installApi({ get: () => new Promise((resolve) => { finish = resolve }) })
    const view = renderPage()
    await flush()
    auth.session = { email: 'another@example.com', accessToken: 'other-token' }
    options.get = async () => json({ ...original, email: auth.session.email,
      user_id: '00000000-0000-0000-0000-000000000002', display_name: 'Another reader' })
    view.rerender(<TestApp />)
    expect((await ready() as HTMLInputElement).value).toBe('Another reader')
    await act(async () => finish(json(original)))
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('another@example.com')
    expect(screen.getByRole('button', { name: 'Открыть меню пользователя' }).textContent).not.toContain('Reader')
  })

  it('never applies a late saved profile after an account switch', async () => {
    let finish!: (response: Response) => void
    const { options } = installApi({ put: () => new Promise((resolve) => { finish = resolve }) })
    const view = renderPage()
    fireEvent.change(await ready(), { target: { value: 'Old account draft' } })
    submit()
    await flush()
    auth.session = { email: 'another@example.com', accessToken: 'other-token' }
    options.get = async () => json({ ...original, email: auth.session.email,
      user_id: '00000000-0000-0000-0000-000000000002', display_name: 'Another reader' })
    view.rerender(<TestApp />)
    expect((await ready() as HTMLInputElement).value).toBe('Another reader')
    await act(async () => finish(json({ ...original, display_name: 'Old account draft' })))
    expect((screen.getByLabelText('Имя') as HTMLInputElement).value).toBe('Another reader')
    expect(screen.queryByText('Профиль сохранён.')).toBeNull()
  })
})
