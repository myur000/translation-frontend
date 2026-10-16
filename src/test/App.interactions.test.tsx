import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import App from '../App.tsx'
import { AUTH_SESSION_STORAGE_KEY } from '../auth/authStorage.ts'
import { installBrowserSessionMock } from './browserSessionMock.ts'

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

const historyItems = [
  {
    job_id: '00000000-0000-0000-0000-000000000101',
    source_lang: 'en',
    target_lang: 'ru',
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
    source_lang: 'en',
    target_lang: 'ru',
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
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' }).getAttribute('lang')).toBe('en')
    expect(screen.queryByRole('heading', { name: 'Translation service progress' })).toBeNull()
  })

  it('marks document previews with their actual language', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(
      await screen.findByRole('button', { name: /research_notes\.doc/i }),
    )

    expect(screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' }).getAttribute('lang')).toBe('de')
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' }).getAttribute('lang')).toBe('ru')
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
    fireEvent.keyDown(screen.getByLabelText('Исходный язык'), { key: 'f', code: 'KeyF' })
    expect(screen.getByText('Мои книги')).toBeTruthy()
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

    const sourceSelect = (await screen.findByRole('combobox', {
      name: 'Исходный язык',
    })) as HTMLSelectElement
    const targetSelect = screen.getByRole('combobox', {
      name: 'Язык перевода',
    }) as HTMLSelectElement

    await user.selectOptions(sourceSelect, 'ru')

    expect(sourceSelect.value).toBe('ru')
    expect(targetSelect.value).toBe('en')
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

    await user.selectOptions(
      screen.getByLabelText('Исходный язык'),
      'de',
    )
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
    expect(uploadBody.get('source_lang')).toBe('de')
    expect(uploadBody.get('target_lang')).toBe('ru')
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

describe('routing', () => {
  it('renders a useful fallback for an unknown route', () => {
    renderApp('/missing-page')

    expect(
      screen.getByRole('heading', { name: 'Страница не найдена' }),
    ).toBeTruthy()
  })
})
