import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App.tsx'
import { downloadTranslation } from '../api/translations.ts'
import { AUTH_SESSION_STORAGE_KEY, createAuthSession } from '../auth/authStorage.ts'
import { saveDownloadedFile, translationDownloadFileName } from '../documents/fileDownload.ts'
import { installBrowserSessionMock } from './browserSessionMock.ts'
import { accountFixture } from './accountFixtures.ts'

// Keep download tests independent of automatic preview requests/rendering.
vi.mock('../hooks/useDocumentAssets.ts', () => ({ useDocumentAssets: () => ({
  original: { status: 'message', message: 'viewer.originalMissing' },
  translation: { status: 'message', message: 'viewer.translationPending' },
  retry: () => {},
}) }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

function jwt(version = 1) {
  const encode = (value: unknown) => btoa(JSON.stringify(value))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({
    sub: 'reader-id', email: 'reader@example.com', email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 900, jti: version, sid: 'test-session',
  }) + '.signature'
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}
const jobId = '11111111-0000-0000-0000-000000000001'
const secondJobId = '22222222-0000-0000-0000-000000000002'
function historyItem(id = jobId, status = 'DONE', format = 'pdf') {
  return {
    job_id: id, status, format, progress: status === 'DONE' ? 100 : 0,
    source_lang: 'en', target_lang: 'ru',
    created_at: '2026-10-09T00:00:00Z', updated_at: '2026-10-09T00:00:00Z',
    error_code: null, error_message: null,
  }
}
function fileResponse(name: string | null = 'translation.pdf', content = '%PDF-1.4 translated') {
  const headers = new Headers({ 'Content-Type': 'application/pdf' })
  if (name) headers.set('Content-Disposition', 'attachment; filename="' + name + '"')
  return new Response(content, { headers })
}
function installFileSavingMock() {
  const createUrl = vi.fn(() => 'blob:translation-test')
  const revokeUrl = vi.fn()
  const OriginalURL = globalThis.URL
  vi.stubGlobal('URL', class extends OriginalURL {
    static createObjectURL = createUrl
    static revokeObjectURL = revokeUrl
  })
  const saved: { name: string; href: string; attached: boolean }[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, href: this.href, attached: this.isConnected })
  })
  return { createUrl, revokeUrl, saved }
}
type HistoryItem = ReturnType<typeof historyItem>
function renderWorkspace(
  download: (init: RequestInit) => Promise<Response> = async () => fileResponse(),
  items: HistoryItem[] = [historyItem()],
) {
  installBrowserSessionMock()
  const accessToken = jwt()
  sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(createAuthSession({
    accessToken, tokenType: 'Bearer', expiresIn: 900,
  }, 'reader@example.com')))
  sessionStorage.setItem('doctranslate.document-metadata.v1.reader@example.com', JSON.stringify({
    [jobId]: { name: 'book.pdf', documentId: jobId },
    [secondJobId]: { name: 'second.docx', documentId: secondJobId },
  }))
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const account = accountFixture(input)
    if (account) return json(account)
    if (url === '/api/auth/refresh') {
      return json({ accessToken: jwt(2), tokenType: 'Bearer', expiresIn: 900 })
    }
    if (url === '/api/auth/logout') return new Response(null, { status: 204 })
    if (url === '/api/profile') return json({ email: 'reader@example.com', username: 'Reader' })
    if (url.startsWith('/api/documents/history')) return json({
      items, page: 0, size: 100, total_elements: items.length, total_pages: 1, first: true, last: true,
    })
    if (url.endsWith('/download')) return download(init ?? {})
    if (url.endsWith('/status')) {
      return json(items.find((item) => url.includes(item.job_id)) ?? items[0])
    }
    throw new Error('Unexpected request: ' + url)
  })
  vi.stubGlobal('fetch', fetchMock)
  const rendered = render(<MemoryRouter><App /></MemoryRouter>)
  return { ...rendered, fetchMock, accessToken }
}

describe('download filenames and Blob lifecycle', () => {
  it.each([
    ['attachment; filename="translation.pdf"', 'translation.pdf'],
    ["attachment; filename*=UTF-8''%D0%BA%D0%BD%D0%B8%D0%B3%D0%B0.pdf", 'книга.pdf'],
    ["attachment; filename=\"fallback.pdf\"; filename*=UTF-8'en'%D0%BA%D0%BD%D0%B8%D0%B3%D0%B0.pdf", 'книга.pdf'],
    ['attachment; filename="part;one.pdf"', 'part;one.pdf'],
    ["attachment; filename=\"fallback.pdf\"; filename*=UTF-8''%ZZ", 'fallback.pdf'],
    [null, null],
  ])('reads filename metadata: %s', async (header, expected) => {
    const headers = new Headers({ 'Content-Type': 'application/pdf' })
    if (header) headers.set('Content-Disposition', header)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('translated', { headers })))
    const result = await downloadTranslation(jobId, { accessToken: 'test-token' })
    expect(result.fileName).toBe(expected)
  })

  it('uses the server filename or a safe original-name fallback', () => {
    expect(translationDownloadFileName('translation-123.docx', 'book.docx', 'ru')).toBe('translation-123.docx')
    expect(translationDownloadFileName(null, 'Моя книга.pdf', 'ru')).toBe('Моя книга_ru.pdf')
    expect(translationDownloadFileName('../../unsafe.pdf', 'book.pdf', 'ru')).toBe('unsafe.pdf')
    expect(translationDownloadFileName('C:\\folder\\result.doc', 'book.doc', 'ru')).toBe('result.doc')
    expect(translationDownloadFileName('..\u0000', 'book.pdf', 'ru')).toBe('book_ru.pdf')
    const longName = translationDownloadFileName('a'.repeat(250) + '.docx', 'book.docx', 'ru')
    expect(longName.length).toBe(200)
    expect(longName.endsWith('.docx')).toBe(true)
  })

  it('saves through an attached link, removes it and releases its URL after a delay', () => {
    vi.useFakeTimers()
    const { createUrl, revokeUrl, saved } = installFileSavingMock()
    const blob = new Blob(['translated'])
    saveDownloadedFile(blob, 'result.pdf')
    expect(createUrl).toHaveBeenCalledWith(blob)
    expect(saved).toEqual([{ name: 'result.pdf', href: 'blob:translation-test', attached: true }])
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revokeUrl).not.toHaveBeenCalled()
    vi.advanceTimersByTime(30_000)
    expect(revokeUrl).toHaveBeenCalledWith('blob:translation-test')
  })
})

describe('translation download UI', () => {
  it('downloads the DONE result with Bearer authentication and the server filename', async () => {
    const files = installFileSavingMock()
    const { fetchMock, accessToken } = renderWorkspace(async () => new Response('%PDF translated', {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': "attachment; filename*=UTF-8''%D0%BA%D0%BD%D0%B8%D0%B3%D0%B0.pdf",
      },
    }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Скачать' }))
    expect(await screen.findByText('Скачивание книга.pdf началось.')).toBeTruthy()
    expect(files.saved[0].name).toBe('книга.pdf')
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/download'))
    if (!call?.[1]) throw new Error('Expected an authenticated download request')
    expect(call?.[0]).toBe('/api/documents/' + jobId + '/download')
    expect((call[1].headers as Headers).get('Authorization')).toBe('Bearer ' + accessToken)
    expect(files.createUrl).toHaveBeenCalledTimes(1)
  })

  it('uses a fallback name when backend omits Content-Disposition', async () => {
    const files = installFileSavingMock()
    renderWorkspace(async () => fileResponse(null))
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Скачать' }))
    await screen.findByText('Скачивание book_ru.pdf началось.')
    expect(files.saved[0].name).toBe('book_ru.pdf')
  })

  it('blocks double clicks while a download is pending', async () => {
    let resolve!: (value: Response) => void
    const files = installFileSavingMock()
    const pending = vi.fn(() => new Promise<Response>((finish) => { resolve = finish }))
    renderWorkspace(pending)
    const button = await screen.findByRole('button', { name: 'Скачать' })
    fireEvent.click(button)
    fireEvent.click(button)
    const busy = screen.getByRole('button', { name: 'Скачиваем…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect(busy.getAttribute('aria-busy')).toBe('true')
    await waitFor(() => expect(pending).toHaveBeenCalledTimes(1))
    await act(async () => resolve(fileResponse()))
    await screen.findByText('Скачивание translation.pdf началось.')
    expect((screen.getByRole('button', { name: 'Скачать' }) as HTMLButtonElement).disabled).toBe(false)
    expect(files.createUrl).toHaveBeenCalledTimes(1)
  })

  it.each(['PENDING', 'PROCESSING', 'FAILED'])('disables download for %s jobs', async (status) => {
    const handler = vi.fn(async () => fileResponse())
    renderWorkspace(handler, [historyItem(jobId, status)])
    const button = await screen.findByRole('button', { name: 'Скачать' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(handler).not.toHaveBeenCalled()
  })

  it('disables download for a local draft with no job_id', async () => {
    const handler = vi.fn(async () => fileResponse())
    const { container } = renderWorkspace(handler, [])
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.setup().upload(input, new File(['document'], 'draft.pdf', { type: 'application/pdf' }))
    const button = await screen.findByRole('button', { name: 'Скачать' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toContain('черновик')
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    [403, 'Нет доступа к этому результату перевода.'],
    [404, 'Результат перевода не найден или недоступен для вашего аккаунта.'],
    [409, 'Результат ещё обрабатывается и пока недоступен для скачивания.'],
    [410, 'Срок хранения результата истёк.'],
    [429, 'Повторите скачивание через 12 сек.'],
    [503, 'Не удалось скачать перевод.'],
  ])('explains backend HTTP %s without saving the error response', async (status, message) => {
    const files = installFileSavingMock()
    renderWorkspace(async () => new Response(JSON.stringify({ message: 'Backend error' }), {
      status, headers: { 'Content-Type': 'application/json', 'Retry-After': '12' },
    }))
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Скачать' }))
    await waitFor(() => {
      expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes(message))).toBe(true)
    })
    expect(files.createUrl).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Скачать' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('allows retry after a network error', async () => {
    const files = installFileSavingMock()
    const handler = vi.fn()
      .mockRejectedValueOnce(new TypeError('Network failed'))
      .mockImplementationOnce(async () => fileResponse())
    renderWorkspace(handler)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Скачать' }))
    expect(await screen.findByText(/Не удалось скачать перевод/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Скачать' }))
    await screen.findByText('Скачивание translation.pdf началось.')
    expect(files.createUrl).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['', 'application/pdf', 'Backend вернул пустой файл.'],
    ['<html>not a file</html>', 'text/html', 'Вместо файла получен некорректный ответ.'],
    ['{"message":"error"}', 'application/problem+json', 'Вместо файла получен некорректный ответ.'],
  ])('rejects empty or invalid successful responses', async (body, contentType, message) => {
    const files = installFileSavingMock()
    renderWorkspace(async () => new Response(body, { headers: { 'Content-Type': contentType } }))
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Скачать' }))
    expect(await screen.findByText(new RegExp(message.replace('.', '\\.')))).toBeTruthy()
    expect(files.createUrl).not.toHaveBeenCalled()
  })

  it('cancels download on book change, even if fetch ignores the abort signal', async () => {
    let resolve!: (value: Response) => void
    let signal: AbortSignal | undefined
    const files = installFileSavingMock()
    renderWorkspace((init) => {
      signal = init.signal ?? undefined
      return new Promise((finish) => { resolve = finish })
    }, [historyItem(), historyItem(secondJobId, 'DONE', 'docx')])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Скачать' }))
    await waitFor(() => expect(signal).toBeDefined())
    await user.click(screen.getByTitle('second.docx'))
    expect(signal?.aborted).toBe(true)
    await act(async () => resolve(fileResponse()))
    expect(files.createUrl).not.toHaveBeenCalled()
    expect(screen.queryByText('Скачивание translation.pdf началось.')).toBeNull()
    expect((screen.getByRole('button', { name: 'Скачать' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('cancels a pending download when signing out', async () => {
    let resolve!: (value: Response) => void
    const files = installFileSavingMock()
    renderWorkspace(() => new Promise((finish) => { resolve = finish }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Скачать' }))
    await waitFor(() => expect(resolve).toBeTypeOf('function'))
    await user.click(screen.getByRole('button', { name: 'Открыть меню пользователя' }))
    await user.click(screen.getByRole('menuitem', { name: 'Выйти' }))
    await screen.findByRole('heading', { name: 'Вход' })
    await act(async () => resolve(fileResponse()))
    expect(files.createUrl).not.toHaveBeenCalled()
  })

  it('continues the binary download after one successful JWT refresh', async () => {
    const files = installFileSavingMock()
    const { fetchMock, accessToken } = renderWorkspace(async (init) => {
      const authorization = (init.headers as Headers).get('Authorization')
      return authorization === 'Bearer ' + accessToken ? new Response(null, { status: 401 }) : fileResponse()
    })
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Скачать' }))
    await screen.findByText('Скачивание translation.pdf началось.')
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/download'))).toHaveLength(2)
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1)
    expect(files.createUrl).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: 'Вход' })).toBeNull()
  })
})
