import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import App from '../App.tsx'
import { AUTH_SESSION_STORAGE_KEY } from '../auth/authStorage.ts'
import { resetLanguageCatalogForTests } from '../languages/languageCatalog.ts'
import { installBrowserSessionMock } from './browserSessionMock.ts'
import { installDialogPolyfill } from './dialogPolyfill.ts'

// These tests exercise layout/upload/navigation, not the PDF rendering engine.
vi.mock('../viewer/pdfEngine.ts', () => ({ openPdf: async () => { throw new Error('Invalid test PDF') } }))

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.lang = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetLanguageCatalogForTests()
})

function createJwt(emailVerified = true) {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'user-1',
    email: 'reader@example.com',
    email_verified: emailVerified,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.signature`
}

function seedAuthenticatedSession(emailVerified = true) {
  sessionStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: createJwt(emailVerified),
      email: 'reader@example.com',
      emailVerified,
      expiresAt: Date.now() + 3_600_000,
    }),
  )
}

const languageCatalog = [
  { code: 'eng_Latn', name: 'Английский' },
  { code: 'zho_Hans', name: 'Китайский (упрощённый)' },
  { code: 'deu_Latn', name: 'Немецкий' },
  { code: 'rus_Cyrl', name: 'Русский' },
  { code: 'fra_Latn', name: 'Французский' },
]

const historyItems = [
  {
    job_id: '00000000-0000-0000-0000-000000000101',
    source_lang: 'eng_Latn',
    target_lang: 'rus_Cyrl',
    format: 'pdf',
    status: 'DONE',
    progress: 100,
    created_at: '2026-10-07T03:00:00Z',
    updated_at: '2026-10-07T03:01:00Z',
    error_code: null,
    error_message: null,
  },
  {
    job_id: '00000000-0000-0000-0000-000000000102',
    source_lang: 'eng_Latn',
    target_lang: 'rus_Cyrl',
    format: 'docx',
    status: 'DONE',
    progress: 100,
    created_at: '2026-10-07T02:00:00Z',
    updated_at: '2026-10-07T02:01:00Z',
    error_code: null,
    error_message: null,
  },
  {
    job_id: '00000000-0000-0000-0000-000000000103',
    source_lang: 'de',
    target_lang: 'ru',
    format: 'doc',
    status: 'DONE',
    progress: 100,
    created_at: '2026-10-07T01:00:00Z',
    updated_at: '2026-10-07T01:01:00Z',
    error_code: null,
    error_message: null,
  },
]

function installDefaultApiMock() {
  if (vi.isMockFunction(globalThis.fetch)) return

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (input === '/api/languages') {
        return Promise.resolve(
          new Response(JSON.stringify(languageCatalog), {
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      if (input === '/api/documents/history?page=0&size=100') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: historyItems,
              page: 0,
              size: 100,
              total_elements: historyItems.length,
              total_pages: 1,
              first: true,
              last: true,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }

      if (input === '/api/profile') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user_id: '00000000-0000-0000-0000-000000000001',
              email: 'reader@example.com',
              username: 'reader',
              display_name: 'Reader',
              nickname: null,
              profession: null,
              bio: null,
              has_avatar: false,
              created_at: '2026-10-07T00:00:00Z',
              updated_at: '2026-10-07T00:00:00Z',
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }

      return Promise.reject(new Error(`Unexpected request: ${String(input)}`))
    }),
  )
}

function seedDocumentMetadata() {
  sessionStorage.setItem(
    'doctranslate.document-metadata.v1.reader@example.com',
    JSON.stringify({
      '00000000-0000-0000-0000-000000000101': {
        name: 'english_course_book.pdf',
        documentId: 'course-book',
      },
      '00000000-0000-0000-0000-000000000102': {
        name: 'project_report.docx',
        documentId: 'project-report',
      },
      '00000000-0000-0000-0000-000000000103': {
        name: 'research_notes.doc',
        documentId: 'research-notes',
      },
    }),
  )
}

function renderApp(path = '/', emailVerified = true) {
  seedAuthenticatedSession(emailVerified)
  seedDocumentMetadata()
  installDefaultApiMock()
  installBrowserSessionMock()

  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

function mockBookViewportGeometry() {
  const size = { width: 600, height: 400 }
  for (const property of ['scrollHeight', 'clientHeight', 'scrollWidth', 'clientWidth'] as const) {
    vi.spyOn(Element.prototype, property, 'get').mockImplementation(function (this: Element) {
      const label = this.getAttribute('aria-label')
      if (!label?.startsWith('Прокрутка панели')) return 0
      const isTranslation = label.includes('Перевод')
      const zoom = Number((this as HTMLElement).dataset.zoom ?? 100) / 100
      if (property === 'clientHeight') return size.height
      if (property === 'clientWidth') return size.width
      if (property === 'scrollHeight') return (isTranslation ? 2400 : 2000) * zoom
      return (isTranslation ? 1800 : 1400) * zoom
    })
  }
  return size
}

async function findWorkspaceRegion(name: string) {
  await screen.findByRole('region', { name })
  // History mounts the workspace asynchronously. DOM availability alone does
  // not guarantee that passive keyboard listeners have been committed.
  await act(async () => {})
  return screen.getByRole('region', { name })
}

describe('workspace interactions', () => {
  it('keeps allowance information only on the plans page, not in the sidebar', async () => {
    const user = userEvent.setup()
    renderApp()
    await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    expect(screen.queryByText(/^Осталось:/)).toBeNull()
    expect(screen.queryByText('Осталось переводов: 7')).toBeNull()
    expect(screen.queryByRole('link', { name: /^Переводы/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Открыть меню пользователя' }))
    await user.click(screen.getByRole('menuitem', { name: 'Тариф и лимиты' }))
    expect(await screen.findByText('Осталось переводов: 7')).toBeTruthy()
  })

  it('preserves relative reading position when fullscreen or notes change the viewport size', async () => {
    const size = mockBookViewportGeometry()
    renderApp()
    const original = await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    original.scrollTop = 800
    original.scrollLeft = 400
    fireEvent.scroll(original)

    size.width = 1000
    size.height = 800
    fireEvent.keyDown(window, { key: 'd' })
    expect(original.scrollTop).toBeCloseTo(600)
    expect(original.scrollLeft).toBeCloseTo(200)
    fireEvent.scroll(original)

    size.width = 420
    size.height = 500
    fireEvent.contextMenu(original)
    expect(screen.getByRole('complementary', { name: 'Заметки' })).toBeTruthy()
    expect(original.scrollTop).toBeCloseTo(750)
    expect(original.scrollLeft).toBeCloseTo(490)
    fireEvent.scroll(original)

    size.width = 600
    size.height = 400
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть панель заметок' }))
    expect(original.scrollTop).toBeCloseTo(800)
    expect(original.scrollLeft).toBeCloseTo(400)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(original.scrollTop).toBeCloseTo(800)
    expect(original.scrollLeft).toBeCloseTo(400)
  })

  it('retains the horizontal bookmark when a fullscreen panel temporarily has no overflow', async () => {
    const size = mockBookViewportGeometry()
    renderApp()
    const original = await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    expect(original.scrollWidth - original.clientWidth).toBe(800)
    original.scrollLeft = 400
    fireEvent.scroll(original)
    size.width = 1400
    fireEvent.keyDown(window, { key: 'd' })
    expect(original.isConnected).toBe(true)
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' })).toBe(original)
    expect(original.scrollWidth - original.clientWidth).toBe(0)
    expect(original.scrollLeft).toBe(0)
    fireEvent.scroll(original)
    // Vertical reading must not erase a horizontal bookmark while the page fits.
    original.scrollTop = 400
    fireEvent.scroll(original)

    size.width = 600
    fireEvent.keyDown(window, { key: 'f' })
    expect(original.scrollLeft).toBeCloseTo(400)
    expect(original.scrollTop).toBeCloseTo(400)
  })

  it('retains independent zoom and both scroll axes when fullscreen panels are remounted', async () => {
    mockBookViewportGeometry()
    renderApp()
    const original = await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    const translation = screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' })
    fireEvent.keyDown(original, { key: '+' })
    original.scrollTop = 680
    original.scrollLeft = 220
    fireEvent.scroll(original)
    fireEvent.keyDown(translation, { key: '-' })
    translation.scrollTop = 370
    translation.scrollLeft = 80
    fireEvent.scroll(translation)

    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.keyDown(window, { key: 'd' })
    expect(screen.queryByRole('region', { name: 'Перевод' })).toBeNull()
    fireEvent.keyDown(window, { key: 'g' })
    const restoredTranslation = screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' })
    expect(restoredTranslation).not.toBe(translation)
    expect(restoredTranslation.dataset.zoom).toBe('90')
    expect(restoredTranslation.scrollTop).toBeCloseTo(370)
    expect(restoredTranslation.scrollLeft).toBeCloseTo(80)

    fireEvent.keyDown(window, { key: 'd' })
    const restoredOriginal = screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' })
    expect(restoredOriginal).not.toBe(original)
    expect(restoredOriginal.dataset.zoom).toBe('110')
    expect(restoredOriginal.scrollTop).toBeCloseTo(680)
    expect(restoredOriginal.scrollLeft).toBeCloseTo(220)

    fireEvent.keyDown(window, { key: 'f' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' }).scrollTop).toBeCloseTo(370)
    expect(screen.getAllByText(/^(90|110)%$/)).toHaveLength(2)
  })

  it('updates the hidden fullscreen panel bookmark when synchronized zoom and scrolling are enabled', async () => {
    const user = userEvent.setup()
    mockBookViewportGeometry()
    renderApp()
    await findWorkspaceRegion('Оригинал')
    await user.click(screen.getByRole('button', { name: 'Включить синхронную прокрутку' }))
    fireEvent.keyDown(window, { key: 'd' })
    const original = screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' })
    fireEvent.keyDown(original, { key: '+' })
    original.scrollTop = 620
    original.scrollLeft = 310
    fireEvent.scroll(original)

    fireEvent.keyDown(window, { key: 'g' })
    const translation = screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' })
    expect(translation.dataset.zoom).toBe('110')
    expect(translation.scrollTop).toBeCloseTo(620 / 1800 * 2240)
    expect(translation.scrollLeft).toBeCloseTo(310 / 940 * 1380)
    translation.scrollTop = 900
    translation.scrollLeft = 500
    fireEvent.scroll(translation)

    fireEvent.keyDown(window, { key: 'd' })
    const restoredOriginal = screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' })
    expect(restoredOriginal.dataset.zoom).toBe('110')
    expect(restoredOriginal.scrollTop).toBeCloseTo(900 / 2240 * 1800)
    expect(restoredOriginal.scrollLeft).toBeCloseTo(500 / 1380 * 940)
    fireEvent.keyDown(window, { key: 'f' })
    const restoredTranslation = screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' })
    expect(restoredTranslation.scrollTop).toBeCloseTo(900)
    expect(restoredTranslation.scrollLeft).toBeCloseTo(500)
    fireEvent.scroll(restoredTranslation)
    expect(restoredOriginal.scrollTop).toBeCloseTo(900 / 2240 * 1800)
    expect(restoredOriginal.scrollLeft).toBeCloseTo(500 / 1380 * 940)
  })

  it('does not transfer fullscreen scroll positions or zoom to a different book', async () => {
    const user = userEvent.setup()
    mockBookViewportGeometry()
    renderApp()
    const original = await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    fireEvent.keyDown(window, { key: 'd' })
    fireEvent.keyDown(original, { key: '+' })
    original.scrollTop = 650
    original.scrollLeft = 200
    fireEvent.scroll(original)
    fireEvent.keyDown(window, { key: 'Escape' })
    await user.click(screen.getByRole('button', { name: /project_report.docx/ }))
    const nextOriginal = screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' })
    expect(nextOriginal.dataset.zoom).toBe('100')
    expect(nextOriginal.scrollTop).toBe(0)
    expect(nextOriginal.scrollLeft).toBe(0)
  })

  it.each([
    ['/settings', 'Настройки', 'f'],
    ['/settings', 'Настройки', 'd'],
    ['/settings', 'Настройки', 'g'],
    ['/history', 'История переводов', 'f'],
    ['/history', 'История переводов', 'd'],
    ['/history', 'История переводов', 'g'],
  ])('restores the interface after Back/Forward from fullscreen %s (%s, %s)', async (path, heading, key) => {
    seedAuthenticatedSession()
    seedDocumentMetadata()
    installDefaultApiMock()
    installBrowserSessionMock()
    const router = createMemoryRouter([{ path: '*', element: <App /> }], {
      initialEntries: [path, '/'],
      initialIndex: 1,
    })
    render(<RouterProvider router={router} />)
    await findWorkspaceRegion('Оригинал')

    fireEvent.keyDown(window, { key })
    expect(screen.queryByText('Мои книги')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Открыть оригинал и перевод на весь экран' })).toBeNull()

    await act(async () => { await router.navigate(-1) })
    expect(screen.getByRole('heading', { name: heading, level: 1 })).toBeTruthy()
    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Добавить книгу' })).toBeTruthy()

    await act(async () => { await router.navigate(1) })
    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Открыть оригинал и перевод на весь экран' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Оригинал' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Перевод' })).toBeTruthy()

    // Fullscreen can be enabled again after returning to the workspace.
    fireEvent.keyDown(window, { key: 'f' })
    expect(screen.queryByText('Мои книги')).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByText('Мои книги')).toBeTruthy()
  })

  it('resets fullscreen between history entries with the same pathname', async () => {
    seedAuthenticatedSession()
    seedDocumentMetadata()
    installDefaultApiMock()
    installBrowserSessionMock()
    const router = createMemoryRouter([{ path: '*', element: <App /> }], {
      initialEntries: ['/', '/'],
      initialIndex: 1,
    })
    render(<RouterProvider router={router} />)
    await findWorkspaceRegion('Оригинал')
    fireEvent.keyDown(window, { key: 'd' })
    expect(screen.queryByText('Мои книги')).toBeNull()

    await act(async () => { await router.navigate(-1) })
    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Перевод' })).toBeTruthy()

    await act(async () => { await router.navigate(1) })
    expect(screen.getByRole('button', { name: 'Открыть оригинал и перевод на весь экран' })).toBeTruthy()
  })

  it('resets fullscreen on PUSH and REPLACE without losing the selected book', async () => {
    const user = userEvent.setup()
    seedAuthenticatedSession()
    seedDocumentMetadata()
    installDefaultApiMock()
    installBrowserSessionMock()
    const router = createMemoryRouter([{ path: '*', element: <App /> }], {
      initialEntries: ['/'],
    })
    render(<RouterProvider router={router} />)
    await user.click(await screen.findByRole('button', { name: /project_report.docx/ }))
    fireEvent.keyDown(window, { key: 'g' })

    await act(async () => { await router.navigate('/settings') })
    expect(screen.getByText('Мои книги')).toBeTruthy()
    await act(async () => { await router.navigate(-1) })
    expect(screen.getByRole('button', { name: 'Открыть оригинал и перевод на весь экран' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /project_report.docx/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByText('project_report.docx')).toHaveLength(2)

    fireEvent.keyDown(window, { key: 'f' })
    await act(async () => { await router.navigate('/history', { replace: true }) })
    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'История переводов', level: 1 })).toBeTruthy()
  })

  it('collapses, expands and resizes the books sidebar', async () => {
    const user = userEvent.setup()
    renderApp()

    const layout = screen.getByRole('main').parentElement as HTMLElement

    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(layout.style.getPropertyValue('--sidebar-current-width')).toBe(
      '244px',
    )

    await user.click(
      screen.getByRole('button', { name: 'Свернуть боковую панель' }),
    )
    expect(layout.style.getPropertyValue('--sidebar-current-width')).toBe(
      '72px',
    )

    await user.click(
      screen.getByRole('button', { name: 'Развернуть боковую панель' }),
    )

    const resizeHandle = screen.getByRole('separator', {
      name: 'Изменить ширину боковой панели',
    })
    resizeHandle.focus()
    await user.keyboard('{ArrowRight}')

    expect(resizeHandle.getAttribute('aria-valuenow')).toBe('260')
    expect(layout.style.getPropertyValue('--sidebar-current-width')).toBe(
      '260px',
    )
  })

  it('expands each document panel and restores the workspace', async () => {
    const user = userEvent.setup()
    renderApp()

    expect(screen.queryByRole('complementary', { name: 'Заметки' })).toBeNull()
    await user.click(await screen.findByRole('button', { name: 'Заметки' }))

    await user.click(
      screen.getByRole('button', { name: 'Развернуть панель «Оригинал»' }),
    )

    expect(screen.queryByText('Мои книги')).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Заметки' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Перевод' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Заметки' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Свернуть панель «Оригинал»' })).toBeNull()
    fireEvent.contextMenu(screen.getByRole('region', { name: 'Оригинал' }))
    expect(screen.getByRole('complementary', { name: 'Заметки' })).toBeTruthy()
    await user.keyboard('{Escape}')

    expect(screen.getByRole('region', { name: 'Перевод' })).toBeTruthy()

    await user.click(
      screen.getByRole('button', { name: 'Развернуть панель «Перевод»' }),
    )

    expect(screen.queryByRole('region', { name: 'Оригинал' })).toBeNull()

    await user.keyboard('{Escape}')

    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: 'Заметки' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Оригинал' })).toBeTruthy()
  })

  it('zooms independently and uses the last changed panel when sync is enabled', async () => {
    const user = userEvent.setup()
    renderApp()
    const original = await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    const translation = screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' })

    await user.click(screen.getByRole('button', { name: 'Увеличить масштаб «Оригинал»' }))
    expect(original.dataset.zoom).toBe('110')
    expect(translation.dataset.zoom).toBe('100')
    await user.click(screen.getByRole('button', { name: 'Уменьшить масштаб «Перевод»' }))
    expect(translation.dataset.zoom).toBe('90')
    await user.click(screen.getByRole('button', { name: 'Включить синхронную прокрутку' }))
    expect(original.dataset.zoom).toBe('90')
    expect(translation.dataset.zoom).toBe('90')

    await user.click(screen.getByRole('button', { name: 'Увеличить масштаб «Оригинал»' }))
    expect(original.dataset.zoom).toBe('100')
    expect(translation.dataset.zoom).toBe('100')
    await user.click(screen.getByRole('button', { name: 'Выключить синхронную прокрутку' }))
    fireEvent.wheel(original, { deltaY: -100, ctrlKey: true })
    await waitFor(() => expect(original.dataset.zoom).toBe('105'))
    expect(translation.dataset.zoom).toBe('100')
    await user.click(screen.getByRole('button', { name: 'Включить синхронную прокрутку' }))
    expect(translation.dataset.zoom).toBe('105')
    await user.click(screen.getByRole('button', { name: 'Сбросить масштаб «Перевод»' }))
    expect(original.dataset.zoom).toBe('100')
    expect(translation.dataset.zoom).toBe('100')
  })

  it('supports zoom gestures and switching fullscreen between one or both panels', async () => {
    const user = userEvent.setup()
    renderApp()
    const original = await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    const translation = screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' })
    fireEvent.wheel(original, { deltaY: -100 })
    expect(original.dataset.zoom).toBe('100')
    await user.click(screen.getByRole('button', { name: 'Включить синхронную прокрутку' }))
    await user.click(screen.getByRole('button', { name: 'Открыть оригинал и перевод на весь экран' }))
    fireEvent.wheel(translation, { deltaY: -100, metaKey: true })
    await waitFor(() => expect(original.dataset.zoom).toBe('105'))
    expect(translation.dataset.zoom).toBe('105')
    await user.keyboard('2')
    expect(screen.queryByRole('region', { name: 'Оригинал' })).toBeNull()
    const singleTranslation = screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' })
    fireEvent.keyDown(singleTranslation, { key: '+' })
    expect(singleTranslation.dataset.zoom).toBe('115')
    await user.keyboard('1')
    expect(screen.queryByRole('region', { name: 'Перевод' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' }).dataset.zoom).toBe('115')
    await user.keyboard('3')
    expect(screen.getByRole('region', { name: 'Перевод' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Выключить синхронную прокрутку' })).toBeTruthy()
    expect(screen.getAllByText('115%')).toHaveLength(2)
  })

  it('limits book zoom and restores 100 percent with the keyboard', async () => {
    renderApp()
    const original = await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    for (let index = 0; index < 20; index += 1) {
      fireEvent.keyDown(original, { key: '+' })
    }
    expect(original.dataset.zoom).toBe('250')
    expect((screen.getByRole('button', { name: 'Увеличить масштаб «Оригинал»' }) as HTMLButtonElement).disabled).toBe(true)
    for (let index = 0; index < 30; index += 1) {
      fireEvent.keyDown(original, { key: '-' })
    }
    expect(original.dataset.zoom).toBe('50')
    expect((screen.getByRole('button', { name: 'Уменьшить масштаб «Оригинал»' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(original, { key: '0' })
    expect(original.dataset.zoom).toBe('100')
  })

  it('shows only documents fullscreen and opens notes with right click', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(
      await screen.findByRole('button', {
        name: 'Открыть оригинал и перевод на весь экран',
      }),
    )

    expect(screen.queryByText('Мои книги')).toBeNull()
    expect(screen.getByRole('region', { name: 'Оригинал' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Перевод' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Перевести' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Заметки' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Развернуть панель «Оригинал»' }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: 'Выйти из полноэкранного режима документов',
      }),
    ).toBeNull()

    fireEvent.contextMenu(screen.getByRole('region', { name: 'Оригинал' }))

    expect(screen.getByRole('complementary', { name: 'Заметки' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Заметки' })).toBeNull()

    await user.click(
      screen.getByRole('button', { name: 'Закрыть панель заметок' }),
    )
    expect(screen.queryByRole('complementary', { name: 'Заметки' })).toBeNull()
    expect(screen.queryByText('Мои книги')).toBeNull()

    await user.keyboard('{Escape}')

    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Открыть оригинал и перевод на весь экран',
      }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Заметки' })).toBeTruthy()
  })

  it('resizes the notes panel without changing the document columns manually', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Заметки' }))

    const resizeHandle = screen.getByRole('separator', {
      name: 'Изменить ширину панели заметок',
    })
    const workArea = resizeHandle.parentElement?.parentElement as HTMLElement

    expect(resizeHandle.getAttribute('aria-valuenow')).toBe('280')
    expect(workArea.style.getPropertyValue('--notes-current-width')).toBe(
      '280px',
    )

    resizeHandle.focus()
    await user.keyboard('{ArrowLeft}')

    expect(resizeHandle.getAttribute('aria-valuenow')).toBe('296')
    expect(workArea.style.getPropertyValue('--notes-current-width')).toBe(
      '296px',
    )
  })

  it('selects a document and updates the workspace content', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Заметки' }))
    expect(screen.getByRole('complementary', { name: 'Заметки' })).toBeTruthy()

    await user.click(
      await screen.findByRole('button', { name: /project_report\.docx/i }),
    )

    expect(screen.queryByRole('complementary', { name: 'Заметки' })).toBeNull()
    expect(screen.getAllByText('project_report.docx')).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' }).getAttribute('lang')).toBe('en-Latn')
    expect(screen.queryByRole('heading', { name: 'Translation service progress' })).toBeNull()
  })

  it('marks document previews with their actual language', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(
      await screen.findByRole('button', { name: /research_notes\.doc/i }),
    )

    // research_notes.doc predates NLLB codes: legacy `de`/`ru` map to the catalog.
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' }).getAttribute('lang')).toBe('de-Latn')
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' }).getAttribute('lang')).toBe('ru-Cyrl')
    expect(screen.getByRole('button', { name: 'Исходный язык: Немецкий' })).toBeTruthy()
  })

  it('disables page navigation until real PDF metadata is available', async () => {
    renderApp()

    const previousButton = (await screen.findByRole('button', {
      name: 'Предыдущая страница',
    })) as HTMLButtonElement
    const nextButton = screen.getByRole('button', {
      name: 'Следующая страница',
    }) as HTMLButtonElement

    expect(previousButton.disabled).toBe(true)
    expect(nextButton.disabled).toBe(true)
    expect(screen.queryByText('1 / 2')).toBeNull()
  })

  it('toggles proportional synchronized scrolling for both document panels', async () => {
    const user = userEvent.setup()
    renderApp()

    const originalViewport = await screen.findByRole('region', {
      name: 'Прокрутка панели «Оригинал»',
    })
    const translationViewport = screen.getByRole('region', {
      name: 'Прокрутка панели «Перевод»',
    })
    const toggle = screen.getByRole('button', {
      name: 'Включить синхронную прокрутку',
    })

    Object.defineProperties(originalViewport, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
    })
    Object.defineProperties(translationViewport, {
      scrollHeight: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 200 },
    })

    originalViewport.scrollTop = 400
    fireEvent.scroll(originalViewport)
    expect(translationViewport.scrollTop).toBe(0)

    await user.click(toggle)
    expect(
      screen
        .getByRole('button', { name: 'Выключить синхронную прокрутку' })
        .getAttribute('aria-pressed'),
    ).toBe('true')

    originalViewport.scrollTop = 400
    fireEvent.scroll(originalViewport)
    expect(translationViewport.scrollTop).toBe(500)

    originalViewport.scrollTop = 640
    fireEvent.scroll(originalViewport)
    expect(translationViewport.scrollTop).toBe(800)

    fireEvent.scroll(translationViewport)
    expect(originalViewport.scrollTop).toBe(640)

    translationViewport.scrollTop = 250
    fireEvent.scroll(translationViewport)
    expect(originalViewport.scrollTop).toBe(200)

    await user.click(
      screen.getByRole('button', { name: 'Выключить синхронную прокрутку' }),
    )
    originalViewport.scrollTop = 640
    fireEvent.scroll(originalViewport)
    expect(translationViewport.scrollTop).toBe(250)
  })

  it('synchronizes horizontal and vertical scroll without feedback between different page sizes', async () => {
    const user = userEvent.setup()
    renderApp()
    const original = await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    const translation = screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' })
    Object.defineProperties(original, {
      scrollWidth: { configurable: true, value: 1400 },
      clientWidth: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1800 },
      clientHeight: { configurable: true, value: 200 },
    })
    Object.defineProperties(translation, {
      scrollWidth: { configurable: true, value: 900 },
      clientWidth: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
    })
    original.scrollLeft = 400
    original.scrollTop = 400
    fireEvent.scroll(original)
    expect(translation.scrollLeft).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Включить синхронную прокрутку' }))
    expect(translation.scrollLeft).toBe(200)
    expect(translation.scrollTop).toBe(200)
    fireEvent.scroll(translation)
    expect(original.scrollLeft).toBe(400)
    expect(original.scrollTop).toBe(400)

    translation.scrollLeft = 350
    fireEvent.scroll(translation)
    expect(original.scrollLeft).toBe(700)
    expect(original.scrollTop).toBe(400)
    fireEvent.scroll(original)
    expect(translation.scrollLeft).toBe(350)
    original.scrollLeft = 1000
    fireEvent.scroll(original)
    expect(translation.scrollLeft).toBe(500)
    await user.click(screen.getByRole('button', { name: 'Выключить синхронную прокрутку' }))
    translation.scrollLeft = 100
    fireEvent.scroll(translation)
    expect(original.scrollLeft).toBe(1000)
  })

  it('toggles fullscreen with F/D/G in either keyboard layout and ignores editing or modified keys', async () => {
    const user = userEvent.setup()
    renderApp()
    await findWorkspaceRegion('Оригинал')
    await user.click(screen.getByRole('button', { name: /^Исходный язык:/ }))
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Найти язык' }), { key: 'f', code: 'KeyF' })
    expect(screen.getByText('Мои книги')).toBeTruthy()
    await user.keyboard('{Escape}')
    fireEvent.keyDown(window, { key: 'f', code: 'KeyF', ctrlKey: true })
    expect(screen.getByText('Мои книги')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'f', code: 'KeyF', repeat: true })
    expect(screen.getByText('Мои книги')).toBeTruthy()

    await user.keyboard('f')
    expect(screen.queryByText('Мои книги')).toBeNull()
    expect(screen.getByRole('region', { name: 'Оригинал' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Перевод' })).toBeTruthy()
    await user.keyboard('d')
    expect(screen.queryByRole('region', { name: 'Перевод' })).toBeNull()
    await user.keyboard('g')
    expect(screen.queryByRole('region', { name: 'Оригинал' })).toBeNull()
    fireEvent.contextMenu(screen.getByRole('region', { name: 'Перевод' }))
    expect(screen.getByRole('complementary', { name: 'Заметки' })).toBeTruthy()
    await user.keyboard('g')
    expect(screen.getByText('Мои книги')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'в', code: 'KeyD' })
    expect(screen.queryByRole('region', { name: 'Перевод' })).toBeNull()
    fireEvent.keyDown(window, { key: 'п', code: 'KeyG' })
    expect(screen.queryByRole('region', { name: 'Оригинал' })).toBeNull()
    fireEvent.keyDown(window, { key: 'а', code: 'KeyF' })
    expect(screen.getByRole('region', { name: 'Оригинал' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Перевод' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.getByText('Мои книги')).toBeTruthy()
  })

  it('sends an unverified account upload to backend and keeps the draft when backend rejects it', async () => {
    const user = userEvent.setup()
    installDefaultApiMock()
    const existingFetch = globalThis.fetch
    const fetchMock = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      if (input === '/api/documents/upload') {
        return Promise.resolve(new Response(JSON.stringify({
          timestamp: '2026-10-07T00:00:00Z', status: 403,
          message: 'Access denied', path: '/api/documents/upload',
          fieldErrors: {}, correlation_id: 'upload-test',
        }), { status: 403, headers: { 'Content-Type': 'application/json' } }))
      }
      return existingFetch(input, options)
    })
    vi.stubGlobal('fetch', fetchMock)
    const { container } = renderApp('/', false)
    const file = new File(['test file'], 'unverified.pdf', { type: 'application/pdf' })
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, file)
    await user.click(screen.getByRole('button', { name: 'Перевести' }))
    expect(await screen.findByText(/Backend отклонил загрузку/)).toBeTruthy()
    const uploadCall = fetchMock.mock.calls.find(([url]) => url === '/api/documents/upload')
    expect(uploadCall).toBeTruthy()
    if (!uploadCall?.[1]) throw new Error('Expected upload request options')
    expect((uploadCall[1].body as FormData).get('file')).toBe(file)
    expect((uploadCall[1].headers as Headers).get('Authorization')).toContain('Bearer ')
    expect(screen.getByTitle('unverified.pdf').textContent).toContain('Черновик')
    expect(screen.queryByText(/Задача перевода создана/)).toBeNull()
  })

  it('keeps synchronized scrolling enabled when another book is selected', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(
      await screen.findByRole('button', { name: 'Включить синхронную прокрутку' }),
    )
    await user.click(
      await screen.findByRole('button', { name: /project_report\.docx/i }),
    )

    expect(
      screen
        .getByRole('button', { name: 'Выключить синхронную прокрутку' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('swaps languages instead of allowing an invalid equal pair', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(
      await screen.findByRole('button', { name: 'Исходный язык: Английский' }),
    )
    await user.click(
      within(screen.getByRole('listbox', { name: 'Исходный язык' })).getAllByRole('option', { name: 'Русский' })[0],
    )

    expect(screen.getByRole('button', { name: 'Исходный язык: Русский' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Язык перевода: Английский' })).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Поменять языки местами' }))
    expect(screen.getByRole('button', { name: 'Исходный язык: Английский' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Язык перевода: Русский' })).toBeTruthy()
  })

  it('loads the NLLB catalog into the language picker and searches it', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(
      await screen.findByRole('button', { name: 'Язык перевода: Русский' }),
    )
    const listbox = screen.getByRole('listbox', { name: 'Язык перевода' })
    expect(await within(listbox).findByText('Все языки · 5')).toBeTruthy()
    // Popular languages are repeated in the full alphabetical list.
    expect(within(listbox).getAllByRole('option', { name: 'Китайский (упрощённый)' })).toHaveLength(2)

    const search = screen.getByRole('combobox', { name: 'Найти язык' })
    await user.type(search, 'фран')
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual(['Французский'])

    await user.clear(search)
    await user.type(search, 'deu_')
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual(['Немецкий'])
    await user.keyboard('{Enter}')
    const trigger = screen.getByRole('button', { name: 'Язык перевода: Немецкий' })
    expect(document.activeElement).toBe(trigger)

    await user.click(trigger)
    await user.type(screen.getByRole('combobox', { name: 'Найти язык' }), 'клингонский')
    expect(screen.getByText('Такого языка нет в списке.')).toBeTruthy()
  })

  it('opens the language list towards the side that fits in the viewport', async () => {
    const user = userEvent.setup()
    renderApp()
    const trigger = await screen.findByRole('button', { name: 'Язык перевода: Русский' })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: window.innerWidth - 140, y: 10, width: 120, height: 30 }),
    )

    await user.click(trigger)

    const listbox = screen.getByRole('listbox', { name: 'Язык перевода' })
    expect(listbox.parentElement?.dataset.align).toBe('end')
    await user.keyboard('{Escape}')
    vi.mocked(trigger.getBoundingClientRect).mockReturnValue(
      DOMRect.fromRect({ x: 20, y: 10, width: 120, height: 30 }),
    )
    await user.click(trigger)
    expect(screen.getByRole('listbox', { name: 'Язык перевода' }).parentElement?.dataset.align).toBe('start')
  })

  it('keeps popular languages available when the catalog fails to load', async () => {
    const user = userEvent.setup()
    renderApp()
    const defaultFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input === '/api/languages'
        ? Promise.resolve(new Response(null, { status: 503 }))
        : defaultFetch(input, init),
    ))

    await user.click(
      await screen.findByRole('button', { name: 'Исходный язык: Английский' }),
    )

    expect(await screen.findByText('Не удалось загрузить все языки.')).toBeTruthy()
    const listbox = screen.getByRole('listbox', { name: 'Исходный язык' })
    expect(within(listbox).getByRole('option', { name: 'Французский' })).toBeTruthy()
    expect(within(listbox).queryByText(/Все языки/)).toBeNull()
  })

  it('responds to document actions and toggles notes', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Скачать' }))
    expect(await screen.findByText(/Не удалось скачать перевод/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Заметки' }))
    await user.click(
      screen.getByRole('button', { name: 'Закрыть панель заметок' }),
    )
    expect(screen.queryByRole('complementary', { name: 'Заметки' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Заметки' }))
    expect(screen.getByRole('complementary', { name: 'Заметки' })).toBeTruthy()
  })

  it('changes and persists theme and interface language', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('button', { name: 'Открыть меню пользователя' }))
    await user.click(screen.getByRole('menuitem', { name: /Настройки/ }))

    expect(screen.getByRole('heading', { name: 'Настройки' })).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: /English/ }))

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByText('My books')).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: /Dark/ }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('doctranslate.preferences.v1')).toContain(
      '"language":"en"',
    )

    await user.click(screen.getByRole('button', { name: 'Open user menu' }))
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('uses the backend profile in the user menu', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user_id: '00000000-0000-0000-0000-000000000001',
            email: 'reader@example.com',
            username: 'reader',
            display_name: 'Кирилл',
            nickname: null,
            profession: null,
            bio: null,
            has_avatar: false,
            created_at: '2026-10-07T00:00:00Z',
            updated_at: '2026-10-07T00:00:00Z',
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    renderApp()

    await user.click(
      screen.getByRole('button', { name: 'Открыть меню пользователя' }),
    )

    const accountMenu = screen.getByRole('menu', { name: 'Аккаунт' })
    expect((await screen.findAllByText('Кирилл')).length).toBeGreaterThanOrEqual(2)
    expect(accountMenu.textContent).toContain('Free')
    expect(
      screen.getByRole('menuitem', { name: 'Профиль' }).getAttribute(
        'href',
      ),
    ).toBe('/profile')
    expect(
      screen.getByRole('menuitem', { name: 'Тариф и лимиты' }).getAttribute(
        'href',
      ),
    ).toBe('/plans')
    expect(screen.getByRole('menuitem', { name: 'Настройки' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Выйти' })).toBeTruthy()
  })

  it('prepares a supported file and uploads it with the selected languages', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (input === '/api/profile') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user_id: '00000000-0000-0000-0000-000000000001',
              email: 'reader@example.com',
              username: null,
              display_name: null,
              nickname: null,
              profession: null,
              bio: null,
              has_avatar: false,
              created_at: '2026-10-07T00:00:00Z',
              updated_at: '2026-10-07T00:00:00Z',
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }

      if (input === '/api/documents/history?page=0&size=100') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [],
              page: 0,
              size: 100,
              total_elements: 0,
              total_pages: 0,
              first: true,
              last: true,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }

      if (input === '/api/documents/upload') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              job_id: '00000000-0000-0000-0000-000000000042',
            }),
            {
              status: 202,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        )
      }

      if (
        input ===
        '/api/documents/00000000-0000-0000-0000-000000000042/status'
      ) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              job_id: '00000000-0000-0000-0000-000000000042',
              status: 'DONE',
              progress: 100,
              error_code: null,
              error_message: null,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }

      return Promise.reject(new Error(`Unexpected request: ${String(input)}`))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { container } = renderApp()
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    const file = new File(['mock content'], 'new_document.pdf', {
      type: 'application/pdf',
    })

    expect(input).toBeTruthy()
    await user.upload(input as HTMLInputElement, file)

    expect(screen.getAllByText('new_document.pdf').length).toBeGreaterThanOrEqual(2)
    expect(
      screen.getByText(/готов к отправке.*нажмите «Перевести»/),
    ).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Исходный язык: Английский' }))
    await user.type(screen.getByRole('combobox', { name: 'Найти язык' }), 'немец{Enter}')
    await user.click(screen.getByRole('button', { name: 'Перевести' }))

    expect(
      await screen.findByText(/Задача перевода создана.*00000000-0000-0000-0000-000000000042/),
    ).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByTitle('new_document.pdf').textContent).toContain(
        'Готов',
      )
    })
    expect(
      (screen.getByRole('button', { name: 'Готово' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some(
        ([url]) =>
          url ===
          '/api/documents/00000000-0000-0000-0000-000000000042/status',
      ),
    ).toBe(true)

    const uploadCall = fetchMock.mock.calls.find(
      ([url]) => url === '/api/documents/upload',
    )
    expect(uploadCall).toBeTruthy()
    const uploadHeaders = uploadCall?.[1]?.headers as Headers
    const uploadBody = uploadCall?.[1]?.body as FormData
    expect(uploadHeaders.get('Authorization')).toContain('Bearer ')
    expect(uploadBody.get('file')).toBe(file)
    expect(uploadBody.get('source_lang')).toBe('deu_Latn')
    expect(uploadBody.get('target_lang')).toBe('rus_Cyrl')
  })
})

describe('history integration', () => {
  it('restores backend jobs, statuses and job ids', async () => {
    renderApp('/history')

    expect(await screen.findAllByText('english_course_book.pdf')).toHaveLength(2)
    expect(screen.getByText('00000000-0000-0000-0000-000000000101')).toBeTruthy()
    expect(screen.getAllByText(/Готов · 100%/).length).toBeGreaterThan(0)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/documents/history?page=0&size=100',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const apiErrorBody = (status: number, message: string) => ({
  timestamp: '2026-11-05T00:00:00Z', status, message, path: '/api', fieldErrors: {}, correlation_id: `c-${status}`,
})

type ApiOverride = (init?: RequestInit) => Response

/** Default API plus per-URL overrides; returns the router to inspect the URL. */
function renderDocumentRoute(path: string, overrides: Record<string, ApiOverride> = {}) {
  seedAuthenticatedSession()
  seedDocumentMetadata()
  installDefaultApiMock()
  installBrowserSessionMock()
  const defaultFetch = globalThis.fetch
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const override = overrides[String(input)]
    return override ? Promise.resolve(override(init)) : defaultFetch(input, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { router, fetchMock }
}

const callsTo = (fetchMock: ReturnType<typeof vi.fn>, url: string, method: string) =>
  fetchMock.mock.calls.filter(([input, init]) =>
    String(input) === url && ((init as RequestInit | undefined)?.method ?? 'GET') === method)

describe('document route', () => {
  it('opens a document by its link', async () => {
    renderDocumentRoute('/documents/00000000-0000-0000-0000-000000000102')

    expect(await screen.findAllByText('project_report.docx')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /project_report\.docx/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('gives a selected document its own address', async () => {
    const user = userEvent.setup()
    const { router } = renderDocumentRoute('/')

    await user.click(await screen.findByRole('button', { name: /research_notes\.doc/ }))

    expect(router.state.location.pathname).toBe('/documents/00000000-0000-0000-0000-000000000103')
  })

  it('explains a link to a deleted or foreign document', async () => {
    const missing = '00000000-0000-0000-0000-000000000404'
    renderDocumentRoute(`/documents/${missing}`, {
      [`/api/documents/${missing}/status`]: () => jsonResponse({
        timestamp: '2026-11-05T00:00:00Z', status: 404, message: 'Задача не найдена',
        path: `/api/documents/${missing}/status`, fieldErrors: {}, correlation_id: 'c-404',
      }, 404),
    })

    expect(await screen.findByRole('heading', { name: 'Документ не найден' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Вернуться к рабочей области' }).getAttribute('href')).toBe('/')
  })

  it('finds an older document beyond the first history page', async () => {
    const older = '00000000-0000-0000-0000-000000000900'
    renderDocumentRoute(`/documents/${older}`, {
      [`/api/documents/${older}/status`]: () => jsonResponse({
        job_id: older, status: 'DONE', progress: 100, error_code: null, error_message: null,
        file_name: 'Архивный договор.pdf', glossary_term_count: null,
      }),
      '/api/documents/history?page=1&size=100': () => jsonResponse({
        items: [{ ...historyItems[0], job_id: older, file_name: 'Архивный договор.pdf' }],
        page: 1, size: 100, total_elements: 101, total_pages: 2, first: false, last: true,
      }),
    })

    expect(await screen.findAllByText('Архивный договор.pdf')).toHaveLength(2)
  })

  it('prefers the file name stored by the backend', async () => {
    const named = '00000000-0000-0000-0000-000000000777'
    renderDocumentRoute(`/documents/${named}`, {
      '/api/documents/history?page=0&size=100': () => jsonResponse({
        items: [{ ...historyItems[0], job_id: named, file_name: 'Договор поставки.pdf' }],
        page: 0, size: 100, total_elements: 1, total_pages: 1, first: true, last: true,
      }),
    })

    expect(await screen.findAllByText('Договор поставки.pdf')).toHaveLength(2)
  })
})

describe('document actions', () => {
  let restoreDialog: () => void
  beforeEach(() => { restoreDialog = installDialogPolyfill() })
  // Unmount open dialogs before their methods disappear.
  afterEach(() => {
    cleanup()
    restoreDialog()
  })

  const firstJob = '00000000-0000-0000-0000-000000000101'
  const newJob = '00000000-0000-0000-0000-000000000201'
  const openActions = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Действия с документом' }))
    return screen.getByRole('menu', { name: 'Действия с документом' })
  }

  it('translates an uploaded document into another language without a new upload', async () => {
    const user = userEvent.setup()
    const { router, fetchMock } = renderDocumentRoute(`/documents/${firstJob}`, {
      '/api/terms?source_lang=eng_Latn&target_lang=deu_Latn&size=1': () =>
        jsonResponse({ items: [], page: 0, size: 1, total_elements: 3, total_pages: 3 }),
      [`/api/documents/${firstJob}/translations`]: () =>
        jsonResponse({ job_id: newJob, billed_units: 2, glossary_term_count: 3 }, 202),
      [`/api/documents/${newJob}/status`]: () => jsonResponse({
        job_id: newJob, status: 'PENDING', progress: 0, error_code: null, error_message: null,
        file_name: 'english_course_book.pdf', glossary_term_count: 3,
      }),
    })

    await user.click(within(await openActions(user)).getByRole('menuitem', { name: 'Перевести на другой язык…' }))
    const dialog = screen.getByRole('dialog', { name: 'Перевести на другой язык' })
    expect(within(dialog).getByRole('button', { name: 'Язык перевода: Немецкий' })).toBeTruthy()
    await user.click(await within(dialog).findByRole('checkbox', { name: 'Применить мой глоссарий · терминов: 3' }))
    await user.click(within(dialog).getByRole('button', { name: 'Перевести' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/documents/${newJob}`))
    const [, init] = callsTo(fetchMock, `/api/documents/${firstJob}/translations`, 'POST')[0]
    expect(JSON.parse(String(init?.body))).toEqual({ target_lang: 'deu_Latn', use_glossary: true })
    expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByRole('button', { name: 'Язык перевода: Немецкий' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /english_course_book\.pdf/ })).toHaveLength(2)
  })

  it('explains that the original has expired on the server', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${firstJob}/translations`]: () =>
        jsonResponse(apiErrorBody(410, 'Исходный файл удалён'), 410),
    })

    await user.click(within(await openActions(user)).getByRole('menuitem', { name: 'Перевести на другой язык…' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Перевести' }))

    expect((await within(screen.getByRole('dialog')).findByRole('alert')).textContent)
      .toBe('Оригинал уже удалён с сервера по сроку хранения. Добавьте файл заново.')
  })

  it('deletes a document after confirmation and opens the next one', async () => {
    const user = userEvent.setup()
    const { router, fetchMock } = renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${firstJob}`]: () => new Response(null, { status: 204 }),
    })

    await user.click(within(await openActions(user)).getByRole('menuitem', { name: 'Удалить документ…' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Удалить «english_course_book.pdf»?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /english_course_book\.pdf/ })).toBeNull())
    expect(callsTo(fetchMock, `/api/documents/${firstJob}`, 'DELETE')).toHaveLength(1)
    expect(router.state.location.pathname).toBe('/documents/00000000-0000-0000-0000-000000000102')
  })

  it('keeps a document that is still being translated', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${firstJob}`]: () => jsonResponse(apiErrorBody(409, 'Документ переводится'), 409),
    })

    await user.click(within(await openActions(user)).getByRole('menuitem', { name: 'Удалить документ…' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Удалить' }))

    expect((await within(screen.getByRole('alertdialog')).findByRole('alert')).textContent)
      .toBe('Документ ещё переводится — удалить его можно после завершения.')
    expect(screen.getAllByRole('button', { name: /english_course_book\.pdf/ }).length).toBeGreaterThan(0)
  })

  it('retries a failed translation from the server copy of the original', async () => {
    const user = userEvent.setup()
    const failedJob = '00000000-0000-0000-0000-000000000301'
    const { router, fetchMock } = renderDocumentRoute(`/documents/${failedJob}`, {
      '/api/documents/history?page=0&size=100': () => jsonResponse({
        items: [{ ...historyItems[0], job_id: failedJob, status: 'FAILED', progress: 5,
          error_code: 'TRANSLATION_FAILED', error_message: 'Не удалось перевести документ', file_name: 'Отчёт.pdf' }],
        page: 0, size: 100, total_elements: 1, total_pages: 1, first: true, last: true,
      }),
      [`/api/documents/${failedJob}/translations`]: () =>
        jsonResponse({ job_id: newJob, billed_units: 1, glossary_term_count: null }, 202),
      [`/api/documents/${newJob}/status`]: () => jsonResponse({
        job_id: newJob, status: 'PENDING', progress: 0, error_code: null, error_message: null,
        file_name: 'Отчёт.pdf', glossary_term_count: null,
      }),
    })

    await user.click(await screen.findByRole('button', { name: 'Повторить' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/documents/${newJob}`))
    const [, init] = callsTo(fetchMock, `/api/documents/${failedJob}/translations`, 'POST')[0]
    expect(JSON.parse(String(init?.body))).toEqual({ target_lang: 'rus_Cyrl' })
  })

  it('explains why actions are unavailable for a draft', async () => {
    const user = userEvent.setup()
    const { container } = renderApp()
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input as HTMLInputElement, new File(['draft'], 'draft.pdf', { type: 'application/pdf' }))

    const menu = await openActions(user)
    const retranslate = within(menu).getByRole('menuitem', { name: 'Перевести на другой язык…' })
    expect(retranslate.getAttribute('aria-disabled')).toBe('true')
    expect(retranslate.getAttribute('title')).toBe('Сначала отправьте документ на перевод')

    await user.click(within(menu).getByRole('menuitem', { name: 'Убрать черновик' }))
    expect(screen.queryByRole('button', { name: /draft\.pdf/ })).toBeNull()
  })
})

describe('cost, glossary and rating', () => {
  const firstJob = '00000000-0000-0000-0000-000000000101'
  const uploadDraft = async (user: ReturnType<typeof userEvent.setup>, container: HTMLElement) => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    await user.upload(input as HTMLInputElement, new File(['%PDF'], 'Договор.pdf', { type: 'application/pdf' }))
  }

  it('shows the cost of a draft and warns when the quota is not enough', async () => {
    const user = userEvent.setup()
    renderDocumentRoute('/', {
      '/api/documents/estimate': () => jsonResponse({
        format: 'pdf', characters: 54210, billed_units: 31, unlimited: false,
        remaining_units: 12, enough_quota: false,
      }),
    })
    await screen.findAllByText('english_course_book.pdf')
    await uploadDraft(user, document.body)

    expect(await screen.findByText(/≈ 31 стр\. к списанию/)).toBeTruthy()
    expect(screen.getByText(/Не хватает страниц: документ займёт 31 стр\., осталось 12/)).toBeTruthy()
  })

  it('uploads with the glossary when the pair has terms', async () => {
    const user = userEvent.setup()
    const newJob = '00000000-0000-0000-0000-000000000501'
    const { fetchMock } = renderDocumentRoute('/', {
      '/api/terms?source_lang=eng_Latn&target_lang=rus_Cyrl&size=1': () =>
        jsonResponse({ items: [], page: 0, size: 1, total_elements: 4, total_pages: 4 }),
      '/api/documents/upload': () => jsonResponse({ job_id: newJob, billed_units: 2, glossary_term_count: 4 }, 202),
      [`/api/documents/${newJob}/status`]: () => jsonResponse({
        job_id: newJob, status: 'PENDING', progress: 0, error_code: null, error_message: null,
        file_name: 'Договор.pdf', glossary_term_count: 4,
      }),
    })
    await screen.findAllByText('english_course_book.pdf')
    await uploadDraft(user, document.body)

    await user.click(await screen.findByRole('checkbox', { name: 'Глоссарий · 4' }))
    await user.click(screen.getByRole('button', { name: 'Перевести' }))

    expect(await screen.findByText(/списано 2 стр\. · глоссарий: 4/)).toBeTruthy()
    const [, init] = callsTo(fetchMock, '/api/documents/upload', 'POST')[0]
    const body = init?.body as FormData
    expect(body.get('use_glossary')).toBe('true')
    expect(body.get('source_lang')).toBe('eng_Latn')
  })

  it('rates a finished translation and adds a comment', async () => {
    const user = userEvent.setup()
    let saved: unknown = null
    const { fetchMock } = renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${firstJob}/feedback`]: (init) => {
        if (init?.method !== 'PUT') return jsonResponse(apiErrorBody(404, 'Перевод ещё не оценён'), 404)
        saved = JSON.parse(String(init.body))
        return jsonResponse({ job_id: firstJob, ...(saved as object), created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z' })
      },
    })

    const rating = await screen.findByRole('radiogroup', { name: 'Оценка перевода' })
    await user.click(within(rating).getByRole('radio', { name: '4 из 5' }))

    await waitFor(() => expect(saved).toEqual({ rating: 4, comment: null }))
    expect(within(rating).getByRole('radio', { name: '4 из 5' }).getAttribute('aria-checked')).toBe('true')

    await user.click(screen.getByRole('button', { name: 'Комментарий' }))
    await user.type(screen.getByLabelText('Что стоит улучшить в переводе?'), 'Термины не те')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(saved).toEqual({ rating: 4, comment: 'Термины не те' }))
    expect(await screen.findByRole('button', { name: 'Изменить комментарий' })).toBeTruthy()
    expect(callsTo(fetchMock, `/api/documents/${firstJob}/feedback`, 'PUT')).toHaveLength(2)
  })

  it('shows an existing rating and keeps its comment when the rating changes', async () => {
    const user = userEvent.setup()
    let saved: unknown = null
    renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${firstJob}/feedback`]: (init) => {
        if (init?.method === 'PUT') saved = JSON.parse(String(init.body))
        return jsonResponse({ job_id: firstJob, rating: init?.method === 'PUT' ? 2 : 5,
          comment: 'Хорошо', created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z' })
      },
    })

    const rating = await screen.findByRole('radiogroup', { name: 'Оценка перевода' })
    expect(within(rating).getByRole('radio', { name: '5 из 5' }).getAttribute('aria-checked')).toBe('true')
    await user.click(within(rating).getByRole('radio', { name: '2 из 5' }))

    await waitFor(() => expect(saved).toEqual({ rating: 2, comment: 'Хорошо' }))
  })
})

describe('document status events', () => {
  const job = '00000000-0000-0000-0000-000000000101'
  const processingHistory = () => jsonResponse({
    items: [{ ...historyItems[0], status: 'PROCESSING', progress: 10, file_name: 'Книга.pdf' }],
    page: 0, size: 100, total_elements: 1, total_pages: 1, first: true, last: true,
  })
  const statusResponse = (status: string, progress: number) => () => jsonResponse({
    job_id: job, status, progress, error_code: null, error_message: null,
    file_name: 'Книга.pdf', glossary_term_count: null,
  })

  /** An open text/event-stream the test writes to. */
  function eventStream() {
    const encoder = new TextEncoder()
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start(value) { controller = value } })
    return {
      response: () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
      send: (event: string, data: unknown) =>
        act(async () => { controller.enqueue(encoder.encode(`event:${event}\ndata:${JSON.stringify(data)}\n\n`)) }),
    }
  }

  it('applies status events from the stream', async () => {
    const stream = eventStream()
    // The server state the status endpoint reports; events announce its changes.
    let server: [string, number] = ['PROCESSING', 10]
    renderDocumentRoute(`/documents/${job}`, {
      '/api/documents/history?page=0&size=100': processingHistory,
      '/api/documents/events': stream.response,
      [`/api/documents/${job}/status`]: () => statusResponse(...server)(),
    })
    expect(await screen.findByText(/Переводится · 10%/)).toBeTruthy()

    await stream.send('ready', { expires_at: '2026-11-05T01:00:00Z' })
    server = ['PROCESSING', 60]
    await stream.send('job', { job_id: job, status: 'PROCESSING', progress: 60 })
    expect(await screen.findByText(/Переводится · 60%/)).toBeTruthy()

    server = ['DONE', 100]
    await stream.send('job', { job_id: job, status: 'DONE', progress: 100 })
    expect(await screen.findByText(/Готов · 100%/)).toBeTruthy()
  })

  it('falls back to polling when the server has no event stream', async () => {
    const { fetchMock } = renderDocumentRoute(`/documents/${job}`, {
      '/api/documents/history?page=0&size=100': processingHistory,
      '/api/documents/events': () => jsonResponse(apiErrorBody(404, 'Not found'), 404),
      [`/api/documents/${job}/status`]: statusResponse('DONE', 100),
    })

    expect(await screen.findByText(/Готов · 100%/)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/documents/events', 'GET')).toHaveLength(1)
  })
})

describe('routing', () => {
  it('renders a useful fallback for an unknown route', () => {
    renderApp('/missing-page')

    expect(
      screen.getByRole('heading', { name: 'Страница не найдена' }),
    ).toBeTruthy()
  })
})
