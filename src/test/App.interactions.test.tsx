import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import App from '../App.tsx'
import { PREFERENCES_STORAGE_KEY } from '../preferences/PreferencesProvider.tsx'
import { AUTH_SESSION_STORAGE_KEY } from '../auth/authStorage.ts'
import { resetLanguageCatalogForTests } from '../languages/languageCatalog.ts'
import { installBrowserSessionMock } from './browserSessionMock.ts'
import { installDialogPolyfill } from './dialogPolyfill.ts'

// Эти тесты проверяют раскладку, загрузку и навигацию, а не движок отрисовки PDF.
vi.mock('../viewer/pdfEngine.ts', () => ({ openPdf: async () => { throw new Error('Invalid test PDF') } }))
// Настоящие метки ищут абзацы в отрисованной книге, а PDF в jsdom не рисуется (их
// проверяет quoteMarkers.test.tsx). Здесь метка — кнопка с тем же обработчиком.
vi.mock('../components/workspace/QuoteMarkers.tsx', () => ({
  QuoteMarkers: ({ column, quotes, onOpen }: { column: string; quotes: { noteId: string }[]; onOpen: (ids: string[]) => void }) =>
    column === 'TRANSLATION' && quotes.length
      ? <button type="button" onClick={() => onOpen([...new Set(quotes.map((quote) => quote.noteId))])}>Метка на полях</button>
      : null,
}))

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

/** `/` — главный экран; тесты рабочей области открывают первый документ из истории. */
const FIRST_DOCUMENT = '/documents/00000000-0000-0000-0000-000000000101'

/**
 * Синхронная прокрутка по умолчанию включена. Тесты, которые проверяют ручное
 * переключение и независимый масштаб, начинают с выключенной.
 */
function startWithScrollSyncOff() {
  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ theme: 'light', language: 'ru', isScrollSyncEnabled: false }))
}

function renderApp(path = FIRST_DOCUMENT, emailVerified = true) {
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

/** Добавляет локальный черновик: выбор языков есть только у черновиков (и неудачных задач). */
async function addDraft(user: ReturnType<typeof userEvent.setup>, name = 'draft.pdf') {
  await screen.findByRole('button', { name: /^English course book/ })
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  await user.upload(input as HTMLInputElement, new File(['%PDF'], name, { type: 'application/pdf' }))
}

const sidebarList = () => screen.getByRole('navigation', { name: 'Мои книги' })

/** Синхронная прокрутка — пункт-галочка в меню вида; после выбора меню закрывается. */
async function toggleScrollSync(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Вид: / }))
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Синхронная прокрутка' }))
}

/** Состояние пункта синхронной прокрутки: меню открывается, читается и закрывается по Esc. */
async function scrollSyncItem(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Вид: / }))
  const item = screen.getByRole('menuitemcheckbox', { name: 'Синхронная прокрутка' })
  const state = { checked: item.getAttribute('aria-checked'), disabled: item.getAttribute('aria-disabled'), text: item.textContent }
  await user.keyboard('{Escape}')
  return state
}

/** Открывает меню документа «⋯» в панели. */
async function openActions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Действия с документом' }))
  return screen.getByRole('menu', { name: 'Действия с документом' })
}

/** Открывает меню «+» нижней панели документа. */
async function openTools(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Инструменты' }))
  return screen.getByRole('menu', { name: 'Инструменты' })
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
  // История монтирует рабочую область асинхронно. Одного наличия в DOM мало,
  // чтобы пассивные обработчики клавиатуры уже были зафиксированы.
  await act(async () => {})
  return screen.getByRole('region', { name })
}

describe('workspace interactions', () => {
  it('keeps allowance information only on the plans page, not in the sidebar', async () => {
    const user = userEvent.setup()
    renderApp()
    await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    expect(screen.queryByText(/^Осталось:/)).toBeNull()
    expect(screen.queryByText('Осталось страниц: 7')).toBeNull()
    expect(screen.queryByRole('link', { name: /^Переводы/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Открыть меню пользователя' }))
    await user.click(screen.getByRole('menuitem', { name: 'Тариф и лимиты' }))
    expect(await screen.findByText('Осталось страниц: 7')).toBeTruthy()
  })

  it('preserves relative reading position when fullscreen changes the viewport size', async () => {
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

    size.width = 600
    size.height = 400
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
    // Вертикальное чтение не должно стирать горизонтальную закладку, пока страница помещается.
    original.scrollTop = 400
    fireEvent.scroll(original)

    size.width = 600
    fireEvent.keyDown(window, { key: 'f' })
    expect(original.scrollLeft).toBeCloseTo(400)
    expect(original.scrollTop).toBeCloseTo(400)
  })

  it('retains independent zoom and both scroll axes when fullscreen panels are remounted', async () => {
    startWithScrollSyncOff()
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
    startWithScrollSyncOff()
    const user = userEvent.setup()
    mockBookViewportGeometry()
    renderApp()
    await findWorkspaceRegion('Оригинал')
    await toggleScrollSync(user)
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
    await user.click(screen.getByRole('button', { name: /^Project report/ }))
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
      initialEntries: [path, FIRST_DOCUMENT],
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

    // Полноэкранный режим снова включается после возврата в рабочую область.
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
      initialEntries: [FIRST_DOCUMENT, FIRST_DOCUMENT],
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
      initialEntries: [FIRST_DOCUMENT],
    })
    render(<RouterProvider router={router} />)
    await user.click(await screen.findByRole('button', { name: /^Project report/ }))
    fireEvent.keyDown(window, { key: 'g' })

    await act(async () => { await router.navigate('/settings') })
    expect(screen.getByText('Мои книги')).toBeTruthy()
    await act(async () => { await router.navigate(-1) })
    expect(screen.getByRole('button', { name: 'Открыть оригинал и перевод на весь экран' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Project report/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByText('project_report.docx')).toHaveLength(1)
    expect(within(sidebarList()).getByText('Project report')).toBeTruthy()

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
      '304px',
    )

    await user.click(
      screen.getByRole('button', { name: 'Свернуть боковую панель' }),
    )
    expect(layout.style.getPropertyValue('--sidebar-current-width')).toBe(
      '56px',
    )
    // Свёрнутая панель — один рельс; иконка «Книги» разворачивает её обратно.
    const booksSection = screen.getByRole('button', { name: 'Книги' })
    expect(booksSection.getAttribute('aria-expanded')).toBe('false')
    await user.click(booksSection)
    expect(booksSection.getAttribute('aria-expanded')).toBe('true')

    const resizeHandle = screen.getByRole('separator', {
      name: 'Изменить ширину боковой панели',
    })
    resizeHandle.focus()
    await user.keyboard('{ArrowRight}')

    expect(resizeHandle.getAttribute('aria-valuenow')).toBe('320')
    expect(layout.style.getPropertyValue('--sidebar-current-width')).toBe(
      '320px',
    )
  })

  it('expands each document panel and restores the workspace', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(
      await screen.findByRole('button', { name: 'Развернуть панель «Оригинал»' }),
    )

    expect(screen.queryByText('Мои книги')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Перевод' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Свернуть панель «Оригинал»' })).toBeNull()
    await user.keyboard('{Escape}')

    expect(screen.getByRole('region', { name: 'Перевод' })).toBeTruthy()

    await user.click(
      screen.getByRole('button', { name: 'Развернуть панель «Перевод»' }),
    )

    expect(screen.queryByRole('region', { name: 'Оригинал' })).toBeNull()

    await user.keyboard('{Escape}')

    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Оригинал' })).toBeTruthy()
  })

  it('zooms independently and uses the last changed panel when sync is enabled', async () => {
    startWithScrollSyncOff()
    const user = userEvent.setup()
    renderApp()
    const original = await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    const translation = screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' })

    await user.click(screen.getByRole('button', { name: 'Увеличить масштаб «Оригинал»' }))
    expect(original.dataset.zoom).toBe('110')
    expect(translation.dataset.zoom).toBe('100')
    await user.click(screen.getByRole('button', { name: 'Уменьшить масштаб «Перевод»' }))
    expect(translation.dataset.zoom).toBe('90')
    await toggleScrollSync(user)
    expect(original.dataset.zoom).toBe('90')
    expect(translation.dataset.zoom).toBe('90')

    await user.click(screen.getByRole('button', { name: 'Увеличить масштаб «Оригинал»' }))
    expect(original.dataset.zoom).toBe('100')
    expect(translation.dataset.zoom).toBe('100')
    await toggleScrollSync(user)
    fireEvent.wheel(original, { deltaY: -100, ctrlKey: true })
    await waitFor(() => expect(original.dataset.zoom).toBe('105'))
    expect(translation.dataset.zoom).toBe('100')
    await toggleScrollSync(user)
    expect(translation.dataset.zoom).toBe('105')
    await user.click(screen.getByRole('button', { name: 'Сбросить масштаб «Перевод»' }))
    expect(original.dataset.zoom).toBe('100')
    expect(translation.dataset.zoom).toBe('100')
  })

  it('supports zoom gestures and switching fullscreen between one or both panels', async () => {
    startWithScrollSyncOff()
    const user = userEvent.setup()
    renderApp()
    const original = await findWorkspaceRegion('Прокрутка панели «Оригинал»')
    const translation = screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' })
    fireEvent.wheel(original, { deltaY: -100 })
    expect(original.dataset.zoom).toBe('100')
    await toggleScrollSync(user)
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
    expect((await scrollSyncItem(user)).checked).toBe('true')
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

  it('shows only documents fullscreen', async () => {
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
    expect(
      screen.queryByRole('button', { name: 'Развернуть панель «Оригинал»' }),
    ).toBeNull()

    await user.keyboard('{Escape}')

    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Открыть оригинал и перевод на весь экран',
      }),
    ).toBeTruthy()
  })

  it('selects a document and updates the workspace content', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(
      await screen.findByRole('button', { name: /^Project report/i }),
    )

    expect(screen.getAllByText('project_report.docx')).toHaveLength(1)
    expect(within(sidebarList()).getByText('Project report')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' }).getAttribute('lang')).toBe('en-Latn')
    expect(screen.queryByRole('heading', { name: 'Translation service progress' })).toBeNull()
  })

  it('marks document previews with their actual language', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(
      await screen.findByRole('button', { name: /^Research notes/i }),
    )

    // research_notes.doc старше кодов NLLB: старые `de`/`ru` сопоставляются с каталогом.
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' }).getAttribute('lang')).toBe('de-Latn')
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' }).getAttribute('lang')).toBe('ru-Cyrl')
    // Коды языков — в имени кнопки вида и на картинках меню.
    expect(screen.getByRole('button', { name: 'Вид: Сравнение DE и RU' })).toBeTruthy()
  })

  it('hides page navigation until real PDF metadata is available', async () => {
    renderApp()
    await findWorkspaceRegion('Оригинал')

    // Пока число страниц неизвестно, стрелкам нечего листать — их нет вовсе.
    expect(screen.queryByRole('button', { name: 'Предыдущая страница' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Следующая страница' })).toBeNull()
    expect(screen.queryByText('1 / 2')).toBeNull()
  })

  it('toggles proportional synchronized scrolling for both document panels', async () => {
    startWithScrollSyncOff()
    const user = userEvent.setup()
    renderApp()

    const originalViewport = await screen.findByRole('region', {
      name: 'Прокрутка панели «Оригинал»',
    })
    const translationViewport = screen.getByRole('region', {
      name: 'Прокрутка панели «Перевод»',
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

    await toggleScrollSync(user)
    expect((await scrollSyncItem(user)).checked).toBe('true')

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

    await toggleScrollSync(user)
    originalViewport.scrollTop = 640
    fireEvent.scroll(originalViewport)
    expect(translationViewport.scrollTop).toBe(250)
  })

  it('synchronizes horizontal and vertical scroll without feedback between different page sizes', async () => {
    startWithScrollSyncOff()
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
    await toggleScrollSync(user)
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
    await toggleScrollSync(user)
    translation.scrollLeft = 100
    fireEvent.scroll(translation)
    expect(original.scrollLeft).toBe(1000)
  })

  it('toggles fullscreen with F/D/G in either keyboard layout and ignores editing or modified keys', async () => {
    const user = userEvent.setup()
    renderApp()
    await findWorkspaceRegion('Оригинал')
    // Ввод в поле не должен переключать виды.
    const field = document.createElement('input')
    document.body.append(field)
    fireEvent.keyDown(field, { key: 'f', code: 'KeyF' })
    expect(screen.getByText('Мои книги')).toBeTruthy()
    field.remove()
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

  it('focuses the document column on F without a focus ring until it loses focus', async () => {
    const user = userEvent.setup()
    renderApp()
    await findWorkspaceRegion('Оригинал')

    await user.keyboard('f')
    const viewport = screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' })
    expect(document.activeElement).toBe(viewport)
    expect(viewport.hasAttribute('data-quiet-focus')).toBe(true)

    // Дальнейшая навигация по Tab снова показывает обычное кольцо фокуса.
    act(() => viewport.blur())
    expect(viewport.hasAttribute('data-quiet-focus')).toBe(false)
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
    expect(await screen.findByText(/Подтвердите email, чтобы переводить документы/)).toBeTruthy()
    const uploadCall = fetchMock.mock.calls.find(([url]) => url === '/api/documents/upload')
    expect(uploadCall).toBeTruthy()
    if (!uploadCall?.[1]) throw new Error('Expected upload request options')
    expect((uploadCall[1].body as FormData).get('file')).toBe(file)
    expect((uploadCall[1].headers as Headers).get('Authorization')).toContain('Bearer ')
    expect(within(sidebarList()).getByTitle('unverified.pdf').textContent).toContain('Черновик')
    expect(screen.queryByText(/отправлен на перевод/)).toBeNull()
  })

  it('keeps synchronized scrolling enabled when another book is selected', async () => {
    startWithScrollSyncOff()
    const user = userEvent.setup()
    renderApp()

    await screen.findByRole('button', { name: /^Вид: / })
    await toggleScrollSync(user)
    await user.click(
      await screen.findByRole('button', { name: /^Project report/i }),
    )

    expect((await scrollSyncItem(user)).checked).toBe('true')
  })

  it('swaps languages instead of allowing an invalid equal pair', async () => {
    const user = userEvent.setup()
    renderApp()
    await addDraft(user)

    await user.click(
      await screen.findByRole('button', { name: 'Исходный язык: Английский (EN)' }),
    )
    await user.click(
      within(screen.getByRole('listbox', { name: 'Исходный язык' })).getAllByRole('option', { name: 'Русский' })[0],
    )

    expect(screen.getByRole('button', { name: 'Исходный язык: Русский (RU)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Язык перевода: Английский (EN)' })).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Поменять языки местами' }))
    expect(screen.getByRole('button', { name: 'Исходный язык: Английский (EN)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Язык перевода: Русский (RU)' })).toBeTruthy()
  })

  it('loads the NLLB catalog into the language picker and searches it', async () => {
    const user = userEvent.setup()
    renderApp()
    await addDraft(user)

    await user.click(
      await screen.findByRole('button', { name: 'Язык перевода: Русский (RU)' }),
    )
    const listbox = screen.getByRole('listbox', { name: 'Язык перевода' })
    expect(await within(listbox).findByText('Все языки · 5')).toBeTruthy()
    // Популярные языки повторяются в полном алфавитном списке.
    expect(within(listbox).getAllByRole('option', { name: 'Китайский (упрощённый)' })).toHaveLength(2)

    const search = screen.getByRole('combobox', { name: 'Найти язык' })
    await user.type(search, 'фран')
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual(['Французский'])

    await user.clear(search)
    await user.type(search, 'deu_')
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual(['Немецкий'])
    await user.keyboard('{Enter}')
    const trigger = screen.getByRole('button', { name: 'Язык перевода: Немецкий (DE)' })
    expect(document.activeElement).toBe(trigger)

    await user.click(trigger)
    await user.type(screen.getByRole('combobox', { name: 'Найти язык' }), 'клингонский')
    expect(screen.getByText('Такого языка нет в списке.')).toBeTruthy()
  })

  it('opens the language list towards the side that fits in the viewport', async () => {
    const user = userEvent.setup()
    renderApp()
    await addDraft(user)
    const trigger = await screen.findByRole('button', { name: 'Язык перевода: Русский (RU)' })
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

  it('keeps the language list inside the viewport vertically', async () => {
    const user = userEvent.setup()
    renderApp()
    await addDraft(user)
    const trigger = await screen.findByRole('button', { name: 'Язык перевода: Русский (RU)' })
    const height = window.innerHeight

    // Кнопка у нижнего края: снизу места нет, список раскрывается вверх.
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 20, y: height - 60, width: 120, height: 30 }),
    )
    await user.click(trigger)
    let listbox = screen.getByRole('listbox', { name: 'Язык перевода' })
    expect(listbox.parentElement?.dataset.side).toBe('top')
    expect(parseFloat(listbox.style.maxHeight)).toBeLessThanOrEqual(280)
    await user.keyboard('{Escape}')

    // Места мало с обеих сторон: список укорачивается, а не уходит за край.
    vi.mocked(trigger.getBoundingClientRect).mockReturnValue(
      DOMRect.fromRect({ x: 20, y: 200, width: 120, height: 30 }),
    )
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(450)
    await user.click(trigger)
    listbox = screen.getByRole('listbox', { name: 'Язык перевода' })
    const freeBelow = 450 - 230 - 6 - 16
    expect(listbox.parentElement?.dataset.side).toBe('bottom')
    expect(parseFloat(listbox.style.maxHeight)).toBeLessThanOrEqual(freeBelow)
    expect(parseFloat(listbox.style.maxHeight)).toBeGreaterThanOrEqual(120)
  })

  it('keeps popular languages available when the catalog fails to load', async () => {
    const user = userEvent.setup()
    renderApp()
    await addDraft(user)
    const defaultFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      input === '/api/languages'
        ? Promise.resolve(new Response(null, { status: 503 }))
        : defaultFetch(input, init),
    ))

    await user.click(
      await screen.findByRole('button', { name: 'Исходный язык: Английский (EN)' }),
    )

    expect(await screen.findByText('Не удалось загрузить все языки.')).toBeTruthy()
    const listbox = screen.getByRole('listbox', { name: 'Исходный язык' })
    expect(within(listbox).getByRole('option', { name: 'Французский' })).toBeTruthy()
    expect(within(listbox).queryByText(/Все языки/)).toBeNull()
  })

  it('reports a failed download', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: 'Действия с документом' }))
    await user.click(screen.getByRole('menuitem', { name: 'Скачать перевод' }))
    expect(await screen.findByText(/Не удалось скачать перевод/)).toBeTruthy()
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

    expect(screen.getAllByText('new_document.pdf').length).toBeGreaterThanOrEqual(1)
    expect(within(sidebarList()).getByText('New document')).toBeTruthy()
    expect(
      screen.getByText(/готов к отправке.*нажмите «Перевести»/),
    ).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Исходный язык: Английский (EN)' }))
    await user.type(screen.getByRole('combobox', { name: 'Найти язык' }), 'немец{Enter}')
    await user.click(screen.getByRole('button', { name: 'Перевести' }))

    expect(
      await screen.findByText(/«new_document\.pdf» отправлен на перевод/),
    ).toBeTruthy()
    await waitFor(() => {
      // Готовую книгу ещё не открывали для чтения: вместо «Готов» — прогресс чтения.
      expect(within(sidebarList()).getByTitle('new_document.pdf').textContent).toContain(
        'Не начата',
      )
    })
    // У готового перевода нечего запускать: «Перевести» уходит, скачивание — в меню «⋯».
    expect(screen.queryByRole('button', { name: 'Перевести' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Действия с документом' }))
    expect(screen.getByRole('menuitem', { name: 'Скачать перевод' })).toBeTruthy()
    await user.keyboard('{Escape}')
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

    expect(await screen.findAllByText('english_course_book.pdf')).toHaveLength(1)
    expect(within(sidebarList()).getByText('English course book')).toBeTruthy()
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

const apiErrorBody = (status: number, message: string, code?: string) => ({
  timestamp: '2026-11-05T00:00:00Z', status, code, message, path: '/api', fieldErrors: {}, correlation_id: `c-${status}`,
})

type ApiOverride = (init?: RequestInit) => Response

/** API по умолчанию плюс подмены по URL; возвращает роутер, чтобы проверить адрес. */
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

    expect(await screen.findAllByText('project_report.docx')).toHaveLength(1)
    expect(within(sidebarList()).getByText('Project report')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Project report/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows notes as a tree by book in the sidebar outside a book', async () => {
    const user = userEvent.setup()
    const graph = {
      truncated: false,
      nodes: [
        { id: 'note:n-1', type: 'note', label: 'Шторм', ref: 'n-1', deleted: false },
        { id: 'note:n-2', type: 'note', label: 'Маяк', ref: 'n-2', deleted: false },
        { id: 'note:n-3', type: 'note', label: 'Идеи', ref: 'n-3', deleted: false },
        { id: 'document:j-1', type: 'document', label: 'lighthouse-keepers-ledger.docx', ref: 'j-1', deleted: false },
        { id: 'tag:сюжет', type: 'tag', label: 'сюжет', ref: null, deleted: false },
        { id: 'missing:морская лексика', type: 'missing', label: 'Морская лексика', ref: null, deleted: false },
      ],
      edges: [
        { source: 'note:n-1', target: 'document:j-1', type: 'quotes', weight: 2 },
        { source: 'note:n-2', target: 'document:j-1', type: 'quotes', weight: 1 },
        { source: 'note:n-1', target: 'tag:сюжет', type: 'tagged', weight: 1 },
        { source: 'note:n-3', target: 'missing:морская лексика', type: 'links', weight: 1 },
      ],
    }
    const summary = (id: string, title: string) =>
      ({ id, title, excerpt: `Текст «${title}»`, tags: [], quote_count: 0, version: 1, updated_at: '2026-11-10T10:00:00Z' })
    const page = (items: unknown[]) => () => jsonResponse({ items, page: 0, size: 100, total_elements: items.length, total_pages: 1 })
    const { fetchMock } = renderDocumentRoute('/history', {
      '/api/notes/graph?types=document%2Ctag%2Cmissing': () => jsonResponse(graph),
      '/api/notes?page=0&size=100': page([summary('n-3', 'Идеи'), summary('n-1', 'Шторм'), summary('n-2', 'Маяк')]),
      [`/api/notes?${new URLSearchParams({ q: 'маяк', page: '0', size: '100' })}`]: page([summary('n-2', 'Маяк')]),
      [`/api/notes?${new URLSearchParams({ tag: 'сюжет', page: '0', size: '100' })}`]: page([summary('n-1', 'Шторм')]),
    })
    const rail = await screen.findByRole('navigation', { name: 'Разделы' })
    // Граф не запрашивается, пока раздел заметок ни разу не открыли.
    expect(callsTo(fetchMock, '/api/notes/graph?types=document%2Ctag%2Cmissing', 'GET')).toHaveLength(0)

    const notesSection = within(rail).getByRole('button', { name: 'Заметки' })
    await user.click(notesSection)
    expect(notesSection.getAttribute('aria-expanded')).toBe('true')
    const book = await screen.findByRole('button', { name: /Lighthouse keepers ledger/, expanded: false })
    expect(book.textContent).toContain('2')
    await user.click(book)
    expect(screen.getByRole('link', { name: /^Маяк/ }).getAttribute('href')).toBe('/notes/n-2')
    expect(screen.getByRole('link', { name: /^Шторм/ }).getAttribute('href')).toBe('/notes/n-1')
    // Заметка без цитат — в «Без книги»; ссылка на несозданную заметку её создаёт.
    expect(screen.getByRole('button', { name: /Без книги/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Создать заметку «Морская лексика»' }).getAttribute('href'))
      .toBe('/notes/new?title=%D0%9C%D0%BE%D1%80%D1%81%D0%BA%D0%B0%D1%8F%20%D0%BB%D0%B5%D0%BA%D1%81%D0%B8%D0%BA%D0%B0')

    await user.click(screen.getByRole('button', { name: 'Недавние' }))
    expect(screen.getByRole('link', { name: /^Идеи/ })).toBeTruthy()

    // Тег сужает список, крестик возвращает дерево.
    await user.click(screen.getByRole('button', { name: /#сюжет/ }))
    expect(await screen.findByRole('link', { name: /^Шторм/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^Маяк/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Сбросить фильтр #сюжет' }))

    await user.type(screen.getByRole('searchbox', { name: 'Поиск по заметкам' }), 'маяк')
    // Поиск ждёт паузу во вводе и показывает найденное сервером, а не дерево.
    expect(await screen.findByRole('link', { name: /^Маяк/ })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^Идеи/ })).toBeNull()

    // Второй клик по открытому разделу сворачивает панель, как в редакторах кода.
    await user.click(notesSection)
    expect(notesSection.getAttribute('aria-expanded')).toBe('false')
  })

  it('gives a selected document its own address', async () => {
    const user = userEvent.setup()
    const { router } = renderDocumentRoute('/')

    await user.click(await screen.findByRole('button', { name: /^Research notes/ }))

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

    expect(await screen.findAllByText('Архивный договор.pdf')).toHaveLength(1)
    expect(within(sidebarList()).getByText('Архивный договор')).toBeTruthy()
  })

  it('prefers the file name stored by the backend', async () => {
    const named = '00000000-0000-0000-0000-000000000777'
    renderDocumentRoute(`/documents/${named}`, {
      '/api/documents/history?page=0&size=100': () => jsonResponse({
        items: [{ ...historyItems[0], job_id: named, file_name: 'Договор поставки.pdf' }],
        page: 0, size: 100, total_elements: 1, total_pages: 1, first: true, last: true,
      }),
    })

    expect(await screen.findAllByText('Договор поставки.pdf')).toHaveLength(1)
    expect(within(sidebarList()).getByText('Договор поставки')).toBeTruthy()
  })
})

describe('workspace layout', () => {
  const firstJob = '00000000-0000-0000-0000-000000000101'
  // Вид спрятан в меню: имя кнопки называет текущий вид с кодом языка — «Вид: Перевод RU».
  const viewMenuButton = () => screen.getByRole('button', { name: /^Вид: / })
  const isLayout = (layout: string) => viewMenuButton().getAttribute('aria-label')!.startsWith(`Вид: ${layout} `)
  const chooseLayout = async (user: ReturnType<typeof userEvent.setup>, layout: string) => {
    await user.click(viewMenuButton())
    await user.click(screen.getByRole('menuitemradio', { name: new RegExp(`^${layout} `) }))
  }
  const region = (name: string) => screen.queryByRole('region', { name })

  it('opens in comparison and remembers the chosen layout for each document', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`)
    await findWorkspaceRegion('Оригинал')

    // Первое открытие — сравнение: оригинал и перевод рядом.
    expect(isLayout('Сравнение')).toBe(true)
    // В меню вида — языки этого документа: страница перевода, книга «оригинал | перевод», страница оригинала.
    await user.click(viewMenuButton())
    const menu = screen.getByRole('menu', { name: 'Раскладка' })
    expect(within(menu).getAllByRole('menuitemradio').map((item) => [item.getAttribute('aria-label'), item.getAttribute('aria-checked')]))
      .toEqual([['Перевод RU', 'false'], ['Сравнение EN и RU', 'true'], ['Оригинал EN', 'false']])
    // Esc закрывает меню и возвращает фокус на кнопку, не трогая вид.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(viewMenuButton())
    expect(region('Перевод')).toBeTruthy()

    await chooseLayout(user, 'Перевод')
    expect(region('Оригинал')).toBeNull()
    expect(region('Перевод')).toBeTruthy()
    // Синхронной прокрутке нечего связывать, а полный экран откроет то, что видно.
    expect((await scrollSyncItem(user)).disabled).toBe('true')
    expect(screen.getByRole('button', { name: 'Открыть перевод на весь экран' })).toBeTruthy()

    // У другого документа своя раскладка: он, как новый, открывается в сравнении.
    await user.click(within(sidebarList()).getByRole('button', { name: /^Project report/ }))
    expect(isLayout('Сравнение')).toBe(true)
    expect(await findWorkspaceRegion('Оригинал')).toBeTruthy()

    await user.click(within(sidebarList()).getByRole('button', { name: /^English course book/ }))
    expect(isLayout('Перевод')).toBe(true)
    expect(region('Оригинал')).toBeNull()
  })

  it('scrolls the compared columns together by default and remembers turning it off', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`)
    await findWorkspaceRegion('Оригинал')

    // Пункт — в меню вида, под режимами: прокрутка нужна только в сравнении.
    await toggleScrollSync(user)

    cleanup()
    renderDocumentRoute(`/documents/${firstJob}`)
    await findWorkspaceRegion('Оригинал')
    expect((await scrollSyncItem(user)).checked).toBe('false')

    // В одной колонке связывать нечего: пункт виден, но недоступен, объясняет почему
    // и настройку не меняет.
    await chooseLayout(user, 'Перевод')
    const unavailable = await scrollSyncItem(user)
    expect(unavailable.disabled).toBe('true')
    expect(unavailable.text).toContain('Только в сравнении')
    await user.click(screen.getByRole('button', { name: /^Вид: / }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Синхронная прокрутка' }))
    expect(screen.getByRole('menuitemcheckbox', { name: 'Синхронная прокрутка' }).getAttribute('aria-checked')).toBe('false')
    await user.keyboard('{Escape}')

    await chooseLayout(user, 'Сравнение')
    const available = await scrollSyncItem(user)
    expect(available.disabled).toBeNull()
    expect(available.checked).toBe('false')
  })

  it('turns quote highlighting off and on from the view menu and remembers it', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`)
    await findWorkspaceRegion('Оригинал')
    const highlightItem = () => screen.getByRole('menuitemcheckbox', { name: 'Подсвечивать цитаты' })

    await user.click(viewMenuButton())
    expect(highlightItem().getAttribute('aria-checked')).toBe('true')
    await user.click(highlightItem())
    // Настройка чтения, а не документа: хранится в настройках интерфейса.
    expect(JSON.parse(localStorage.getItem('doctranslate.preferences.v1')!)).toMatchObject({ isQuoteHighlightEnabled: false })

    cleanup()
    renderDocumentRoute(`/documents/${firstJob}`)
    await findWorkspaceRegion('Оригинал')
    await user.click(viewMenuButton())
    expect(highlightItem().getAttribute('aria-checked')).toBe('false')
  })

  it('keeps the dock of a finished document short', async () => {
    renderDocumentRoute(`/documents/${firstJob}`)
    await findWorkspaceRegion('Оригинал')
    const dock = within(screen.getByRole('toolbar'))

    // Языки уже написаны на страницах переключателя вида — второй раз их не повторяем.
    // Запускать нечего, а скачивание — в меню «⋯».
    expect(dock.getByRole('group', { name: 'Вид документа' })).toBeTruthy()
    expect(dock.queryByRole('button', { name: /Языки перевода|Исходный язык|Язык перевода/ })).toBeNull()
    expect(dock.queryByRole('button', { name: /Скачать/ })).toBeNull()
    expect(dock.queryByRole('button', { name: 'Перевести' })).toBeNull()
  })

  it('keeps the chosen layout after a reload', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`)
    await findWorkspaceRegion('Оригинал')
    await chooseLayout(user, 'Оригинал')
    expect(region('Перевод')).toBeNull()

    cleanup()
    renderDocumentRoute(`/documents/${firstJob}`)

    expect(await findWorkspaceRegion('Оригинал')).toBeTruthy()
    expect(isLayout('Оригинал')).toBe(true)
    expect(region('Перевод')).toBeNull()
  })

  it('returns to the document layout when fullscreen ends', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`)
    await findWorkspaceRegion('Оригинал')
    await chooseLayout(user, 'Перевод')

    // D временно показывает оригинал на весь экран, не трогая выбор документа.
    await user.keyboard('d')
    expect(screen.queryByText('Мои книги')).toBeNull()
    expect(region('Оригинал')).toBeTruthy()
    expect(region('Перевод')).toBeNull()

    await user.keyboard('{Escape}')
    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(region('Оригинал')).toBeNull()
    expect(isLayout('Перевод')).toBe(true)

    // Кнопка в нижней панели открывает на весь экран именно текущую раскладку.
    await user.click(screen.getByRole('button', { name: 'Открыть перевод на весь экран' }))
    expect(screen.queryByText('Мои книги')).toBeNull()
    expect(region('Перевод')).toBeTruthy()
    expect(region('Оригинал')).toBeNull()
  })
})

describe('workspace notes', () => {
  const firstJob = '00000000-0000-0000-0000-000000000101'
  const stormSummary = { id: 'n-1', title: 'Шторм', excerpt: 'Ветер — важная деталь.', tags: [], quote_count: 1, version: 1, updated_at: '2026-11-10T10:00:00Z' }
  const bookNotes = () => jsonResponse({ items: [stormSummary], page: 0, size: 50, total_elements: 1, total_pages: 1 })
  const stormNote = () => jsonResponse({
    ...stormSummary, body: 'Ветер — важная деталь.', created_at: '2026-11-10T10:00:00Z', links: [],
    quotes: [{ id: 'q-1', job_id: firstJob, document_name: 'english_course_book.pdf', document_available: true,
      side: 'TRANSLATION', paragraph_index: 1, quote: 'Ветер дул с северо-востока.', paired_text: 'The wind came from the north-east.',
      source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', created_at: '2026-11-10T10:00:00Z' }],
  })
  const renderWithNotes = (overrides: Record<string, ApiOverride> = {}) => renderDocumentRoute(`/documents/${firstJob}`, {
    [`/api/notes?job_id=${firstJob}&size=50`]: bookNotes,
    ...overrides,
  })
  // Заметки, на которые ссылаются метки на полях: список книги и сами заметки с цитатами.
  const withBookQuotes = {
    [`/api/notes?job_id=${firstJob}&size=100`]: bookNotes,
    '/api/notes/n-1': stormNote,
    '/api/notes/n-1/backlinks': () => jsonResponse([]),
  }
  const notesButton = () => within(screen.getByRole('group', { name: 'Вид документа' })).getByRole('button', { name: 'Заметки' })
  const notesWindow = () => screen.queryByRole('dialog', { name: 'Заметки' })
  const notesColumn = () => screen.queryByRole('complementary', { name: 'Заметки' })
  // У пилюли видимое имя «Заметки · N»; от кнопки в доке её отличает aria-expanded.
  const pill = () => screen.queryByRole('button', { name: /^Заметки/, expanded: false })

  it('opens the notes window of the book from the sidebar rail', async () => {
    const user = userEvent.setup()
    renderWithNotes()
    await findWorkspaceRegion('Оригинал')
    const rail = screen.getByRole('navigation', { name: 'Разделы' })
    const railNotes = within(rail).getByRole('button', { name: 'Заметки' })
    expect(railNotes.getAttribute('aria-pressed')).toBe('false')

    await user.click(railNotes)
    expect(await screen.findByRole('dialog', { name: 'Заметки' })).toBeTruthy()
    expect(within(rail).getByRole('button', { name: 'Заметки' }).getAttribute('aria-pressed')).toBe('true')
    expect(notesButton().getAttribute('aria-pressed')).toBe('true')
    // Боковая панель продолжает показывать книги: второго списка заметок рядом с окном нет.
    expect(screen.getByRole('navigation', { name: 'Мои книги' })).toBeTruthy()

    await user.click(within(rail).getByRole('button', { name: 'Заметки' }))
    expect(notesWindow()).toBeNull()
  })

  it('switches between the window, the pill and the column', async () => {
    const user = userEvent.setup()
    renderWithNotes()
    await findWorkspaceRegion('Оригинал')
    expect(notesWindow()).toBeNull()

    // Новый аккаунт: заметки открываются окном над книгой, а не колонкой.
    await user.click(notesButton())
    const dialog = await screen.findByRole('dialog', { name: 'Заметки' })
    expect(dialog.getAttribute('aria-modal')).toBe('false')
    expect(notesButton().getAttribute('aria-pressed')).toBe('true')
    expect(await within(dialog).findByRole('button', { name: /Шторм/ })).toBeTruthy()
    // Окно лежит поверх книги: обе колонки на месте.
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Оригинал»' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' })).toBeTruthy()

    await user.click(within(dialog).getByRole('button', { name: 'Свернуть заметки' }))
    expect(notesWindow()).toBeNull()
    expect(document.activeElement).toBe(pill())
    expect(notesButton().getAttribute('aria-pressed')).toBe('false')

    await user.click(pill()!)
    expect(notesWindow()).toBeTruthy()
    expect(document.activeElement).toBe(notesWindow())
    expect(pill()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Закрепить колонкой' }))
    expect(notesWindow()).toBeNull()
    expect(notesColumn()).toBeTruthy()
    expect(screen.getByRole('separator', { name: 'Изменить ширину панели заметок' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Открепить в окно' }))
    expect(notesColumn()).toBeNull()
    expect(notesWindow()).toBeTruthy()

    // Вид и место переживают перезагрузку.
    cleanup()
    renderWithNotes()
    expect(await screen.findByRole('dialog', { name: 'Заметки' })).toBeTruthy()
  })

  it('opens notes in the last chosen view with N and the dock button', async () => {
    const user = userEvent.setup()
    renderWithNotes()
    await findWorkspaceRegion('Оригинал')

    await user.keyboard('n')
    expect(notesWindow()).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Закрепить колонкой' }))
    // N закрывает показанные заметки и возвращает их в том виде, в каком их оставили.
    await user.keyboard('n')
    expect(notesColumn()).toBeNull()
    await user.keyboard('n')
    expect(notesColumn()).toBeTruthy()
    expect(notesWindow()).toBeNull()

    await user.click(notesButton())
    expect(notesColumn()).toBeNull()
    await user.click(notesButton())
    expect(notesColumn()).toBeTruthy()

    cleanup()
    renderWithNotes()
    expect(await screen.findByRole('complementary', { name: 'Заметки' })).toBeTruthy()
  })

  it('expands the pill from a margin marker and opens the note', async () => {
    const user = userEvent.setup()
    renderWithNotes(withBookQuotes)
    await findWorkspaceRegion('Оригинал')
    await user.keyboard('n')
    await user.click(screen.getByRole('button', { name: 'Свернуть заметки' }))
    // Пилюля считает заметки книги.
    expect((await screen.findByRole('button', { name: 'Заметки · 1', expanded: false }))).toBeTruthy()

    await user.click(await screen.findByRole('button', { name: 'Метка на полях' }))
    const dialog = await screen.findByRole('dialog', { name: 'Заметки' })
    expect(await within(dialog).findByRole('heading', { name: 'Шторм' })).toBeTruthy()
    expect(pill()).toBeNull()
  })

  it('opens closed notes from a margin marker', async () => {
    const user = userEvent.setup()
    renderWithNotes(withBookQuotes)
    await findWorkspaceRegion('Оригинал')
    expect(notesWindow()).toBeNull()
    await user.click(await screen.findByRole('button', { name: 'Метка на полях' }))
    expect(await within(await screen.findByRole('dialog', { name: 'Заметки' })).findByRole('heading', { name: 'Шторм' })).toBeTruthy()
  })

  it('moves and resizes the window from the keyboard inside the workspace', async () => {
    // jsdom не считает раскладку: рабочая область 1000×700 без верхней и нижней панелей.
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700)
    try {
      const user = userEvent.setup()
      renderWithNotes()
      await findWorkspaceRegion('Оригинал')
      await user.keyboard('n')
      const dialog = await screen.findByRole('dialog', { name: 'Заметки' })
      // По умолчанию — правый верхний угол: 12px от краёв.
      expect(dialog.style).toMatchObject({ left: '688px', top: '12px', width: '300px', height: '520px' })

      const handle = within(dialog).getByRole('button', { name: 'Переместить окно заметок' })
      handle.focus()
      await user.keyboard('{ArrowLeft}{ArrowDown}')
      expect(dialog.style).toMatchObject({ left: '672px', top: '28px' })
      // Вправо дальше края не уйти.
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
      expect(dialog.style.left).toBe('688px')
      await user.keyboard('{Shift>}{ArrowLeft}{ArrowDown}{/Shift}')
      expect(dialog.style).toMatchObject({ width: '284px', height: '536px', left: '688px' })
      // Вниз окно растёт только до нижнего края области.
      await user.keyboard('{Shift>}' + '{ArrowDown}'.repeat(20) + '{/Shift}')
      expect(dialog.style.height).toBe(`${700 - 12 - 28}px`)

      cleanup()
      renderWithNotes()
      expect((await screen.findByRole('dialog', { name: 'Заметки' })).style).toMatchObject({ left: '688px', top: '28px', width: '284px' })
    } finally {
      width.mockRestore()
      height.mockRestore()
    }
  })

  it('keeps the window in fullscreen and returns to the book with Esc', async () => {
    const user = userEvent.setup()
    renderWithNotes()
    await findWorkspaceRegion('Оригинал')
    await user.keyboard('n')
    expect(notesWindow()).toBeTruthy()

    await user.keyboard('g')
    expect(screen.queryByText('Мои книги')).toBeNull()
    // «Читаю только перевод и заметки»: окно остаётся поверх книги.
    expect(notesWindow()).toBeTruthy()
    // N в полноэкранном режиме прячет и возвращает окно.
    await user.keyboard('n')
    expect(notesWindow()).toBeNull()
    await user.keyboard('n')
    expect(notesWindow()).toBeTruthy()

    // Esc в окне возвращает фокус в книгу, не закрывая окно и не выходя из режима.
    within(notesWindow()!).getByRole('button', { name: 'Переместить окно заметок' }).focus()
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Прокрутка панели «Перевод»' }))
    expect(notesWindow()).toBeTruthy()
    expect(screen.queryByText('Мои книги')).toBeNull()
    // Esc в книге, как и раньше, выходит из полноэкранного режима.
    await user.keyboard('{Escape}')
    expect(screen.getByText('Мои книги')).toBeTruthy()
    expect(notesWindow()).toBeTruthy()
  })

  it('hides the column in fullscreen and brings it back afterwards', async () => {
    const user = userEvent.setup()
    renderWithNotes()
    await findWorkspaceRegion('Оригинал')
    await user.click(notesButton())
    await user.click(await screen.findByRole('button', { name: 'Закрепить колонкой' }))
    expect(notesColumn()).toBeTruthy()

    await user.keyboard('f')
    expect(notesColumn()).toBeNull()
    // Колонка — часть раскладки: в полноэкранном режиме N её не возвращает.
    await user.keyboard('n')
    expect(notesColumn()).toBeNull()
    expect(notesWindow()).toBeNull()

    await user.keyboard('{Escape}')
    expect(notesColumn()).toBeTruthy()
  })

  it('moves the column to the other edge and keeps its width', async () => {
    const user = userEvent.setup()
    renderWithNotes()
    await findWorkspaceRegion('Оригинал')
    await user.click(notesButton())
    await user.click(await screen.findByRole('button', { name: 'Закрепить колонкой' }))
    await user.click(await screen.findByRole('button', { name: 'Перенести панель заметок влево' }))

    // У левого края «к книге» — стрелка вправо: колонка становится шире.
    const handle = screen.getByRole('separator', { name: 'Изменить ширину панели заметок' })
    expect(handle.getAttribute('aria-valuenow')).toBe('360')
    handle.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(handle.getAttribute('aria-valuenow')).toBe('392')

    cleanup()
    renderWithNotes()
    expect(await screen.findByRole('button', { name: 'Перенести панель заметок вправо' })).toBeTruthy()
    expect(screen.getByRole('separator', { name: 'Изменить ширину панели заметок' }).getAttribute('aria-valuenow')).toBe('392')
  })
})

describe('document actions', () => {
  let restoreDialog: () => void
  beforeEach(() => { restoreDialog = installDialogPolyfill() })
  // Размонтируем открытые диалоги до того, как исчезнут их методы.
  afterEach(() => {
    cleanup()
    restoreDialog()
  })

  const firstJob = '00000000-0000-0000-0000-000000000101'
  const newJob = '00000000-0000-0000-0000-000000000201'

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

    await user.click(within(await openTools(user)).getByRole('menuitem', { name: 'На другой язык' }))
    const dialog = screen.getByRole('dialog', { name: 'Перевести на другой язык' })
    expect(within(dialog).getByRole('button', { name: 'Язык перевода: Немецкий' })).toBeTruthy()
    await user.click(await within(dialog).findByRole('checkbox', { name: 'Применить мой глоссарий · терминов: 3' }))
    await user.click(within(dialog).getByRole('button', { name: 'Перевести' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/documents/${newJob}`))
    const [, init] = callsTo(fetchMock, `/api/documents/${firstJob}/translations`, 'POST')[0]
    expect(JSON.parse(String(init?.body))).toEqual({ target_lang: 'deu_Latn', use_glossary: true })
    expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByRole('button', { name: /^Вид: .* DE$/ })).toBeTruthy()
    expect(within(sidebarList()).getAllByRole('button', { name: /^English course book/ })).toHaveLength(2)
  })

  it('filters the shelf by search and clears the search with Escape', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`)
    await within(sidebarList()).findAllByRole('button', { name: /^English course book/ })
    const search = screen.getByRole('searchbox', { name: 'Найти книгу' })

    await user.type(search, 'REPORT')
    expect(within(sidebarList()).getByRole('button', { name: /^Project report/ })).toBeTruthy()
    expect(within(sidebarList()).queryByRole('button', { name: /^English course book/ })).toBeNull()

    await user.clear(search)
    await user.type(search, 'нет такой книги')
    expect(screen.getByText('Ничего не найдено')).toBeTruthy()

    await user.keyboard('{Escape}')
    expect((search as HTMLInputElement).value).toBe('')
    expect(within(sidebarList()).getAllByRole('button', { name: /^English course book/ }).length).toBeGreaterThan(0)
  })

  it('shows how much of a book is read and marks it as read or unread from the menu', async () => {
    const user = userEvent.setup()
    localStorage.setItem('parallel.reading-progress.v1.reader@example.com',
      JSON.stringify({ [firstJob]: { position: 0.3, furthest: 0.384, markedRead: false, openedAt: 1 } }))
    renderDocumentRoute(`/documents/${firstJob}`)

    const book = await within(sidebarList()).findByRole('button', { name: /^English course book/, pressed: true })
    expect(book.textContent).toContain('Прочитано 38%')
    await user.click(within(await openActions(user)).getByRole('menuitem', { name: 'Отметить прочитанной' }))
    expect(book.textContent).toContain('Прочитана')
    // Снятая отметка сбрасывает подсчёт: книга снова «не начата».
    await user.click(within(await openActions(user)).getByRole('menuitem', { name: 'Отметить непрочитанной' }))
    expect(book.textContent).toContain('Не начата')
  })

  it('shows the document menu with icons', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`)

    const menu = await openActions(user)
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent))
      .toEqual(['Скачать перевод', 'Закрепить', 'Отметить прочитанной', 'Оценить перевод', 'На другой язык', 'Удалить'])
    expect(within(menu).getAllByRole('menuitem').every((item) => item.querySelector('svg'))).toBe(true)
  })

  it('explains that the original has expired on the server', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${firstJob}/translations`]: () =>
        jsonResponse(apiErrorBody(410, 'Исходный файл удалён'), 410),
    })

    await user.click(within(await openTools(user)).getByRole('menuitem', { name: 'На другой язык' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Перевести' }))

    expect((await within(screen.getByRole('dialog')).findByRole('alert')).textContent)
      .toBe('Оригинал уже удалён с сервера по сроку хранения. Добавьте файл заново.')
  })

  const openBookActions = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(await screen.findByRole('button', { name: `Действия: ${name}` }))
    return screen.getByRole('menu', { name: `Действия: ${name}` })
  }

  it('deletes a document from the sidebar after confirmation and opens the next one', async () => {
    const user = userEvent.setup()
    const { router, fetchMock } = renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${firstJob}`]: () => new Response(null, { status: 204 }),
    })

    await user.click(within(await openBookActions(user, 'english_course_book.pdf'))
      .getByRole('menuitem', { name: 'Удалить' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Удалить «english_course_book.pdf»?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /^English course book/ })).toBeNull())
    expect(callsTo(fetchMock, `/api/documents/${firstJob}`, 'DELETE')).toHaveLength(1)
    expect(router.state.location.pathname).toBe('/documents/00000000-0000-0000-0000-000000000102')
  })

  it('keeps a document that is still being translated', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${firstJob}`]: () =>
        jsonResponse(apiErrorBody(409, 'Документ переводится', 'DOCUMENT_STILL_PROCESSING'), 409),
    })

    await user.click(within(await openBookActions(user, 'english_course_book.pdf'))
      .getByRole('menuitem', { name: 'Удалить' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Удалить' }))

    expect((await within(screen.getByRole('alertdialog')).findByRole('alert')).textContent)
      .toBe('Документ ещё переводится — удалить его можно после завершения или отмены перевода.')
    expect(screen.getAllByRole('button', { name: /^English course book/ }).length).toBeGreaterThan(0)
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

  it('offers a draft nothing but removal and removes it from the sidebar', async () => {
    const user = userEvent.setup()
    renderApp()
    await addDraft(user)

    // Черновик ещё нечего переводить заново, оценивать или закреплять.
    expect(within(await openActions(user)).getAllByRole('menuitem').map((item) => item.textContent))
      .toEqual(['Убрать черновик'])
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Инструменты' })).toBeNull()
    await user.click(within(await openBookActions(user, 'draft.pdf'))
      .getByRole('menuitem', { name: 'Убрать черновик' }))
    expect(screen.queryByRole('button', { name: /^draft\.pdf/ })).toBeNull()
  })

  it('deletes the open document from its own menu after confirmation', async () => {
    const user = userEvent.setup()
    const { router, fetchMock } = renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${firstJob}`]: () => new Response(null, { status: 204 }),
    })

    await user.click(within(await openActions(user)).getByRole('menuitem', { name: 'Удалить' }))
    await user.click(within(screen.getByRole('alertdialog', { name: 'Удалить «english_course_book.pdf»?' }))
      .getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/documents/00000000-0000-0000-0000-000000000102'))
    expect(callsTo(fetchMock, `/api/documents/${firstJob}`, 'DELETE')).toHaveLength(1)
  })

  it('pins a document to its own sidebar section and unpins it', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`)

    await user.click(within(await openActions(user)).getByRole('menuitem', { name: 'Закрепить' }))

    const pinned = screen.getByRole('navigation', { name: 'Закреплённые' })
    expect(within(pinned).getByRole('button', { name: /^English course book/ })).toBeTruthy()
    expect(within(sidebarList()).queryByRole('button', { name: /^English course book/ })).toBeNull()
    expect(screen.getByRole('img', { name: 'Закреплён' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('parallel.pinned-documents.v1.reader@example.com') ?? '[]'))
      .toEqual([firstJob])

    await user.click(within(await openBookActions(user, 'english_course_book.pdf'))
      .getByRole('menuitem', { name: 'Открепить' }))
    expect(screen.queryByRole('navigation', { name: 'Закреплённые' })).toBeNull()
    expect(within(sidebarList()).getByRole('button', { name: /^English course book/ })).toBeTruthy()
  })

  it('disables deleting a document that is being translated', async () => {
    const user = userEvent.setup()
    renderDocumentRoute('/', {
      '/api/documents/history?page=0&size=100': () => jsonResponse({
        items: [{ ...historyItems[0], status: 'PROCESSING', progress: 30 }],
        page: 0, size: 100, total_elements: 1, total_pages: 1, first: true, last: true,
      }),
    })

    const menu = within(await openBookActions(user, 'english_course_book.pdf'))
    const item = menu.getByRole('menuitem', { name: 'Удалить' })
    expect(item.getAttribute('aria-disabled')).toBe('true')
    expect(item.getAttribute('title')).toBe('Сначала отмените перевод или дождитесь его завершения')
    // Вместо удаления меню предлагает то, что сейчас доступно, — отмену.
    expect(menu.getByRole('menuitem', { name: 'Отменить перевод' }).getAttribute('aria-disabled')).toBe('false')
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
    await screen.findAllByText('English course book')
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
    await screen.findAllByText('English course book')
    await uploadDraft(user, document.body)

    const glossary = within(await openTools(user))
      .getByRole('menuitemcheckbox', { name: 'Применить мой глоссарий · терминов: 4' })
    expect(glossary.getAttribute('aria-checked')).toBe('false')
    await user.click(glossary)
    expect(within(await openTools(user)).getByRole('menuitemcheckbox').getAttribute('aria-checked')).toBe('true')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Перевести' }))

    expect(await screen.findByText(/списано 2 стр\. · глоссарий: 4/)).toBeTruthy()
    const [, init] = callsTo(fetchMock, '/api/documents/upload', 'POST')[0]
    const body = init?.body as FormData
    expect(body.get('use_glossary')).toBe('true')
    expect(body.get('source_lang')).toBe('eng_Latn')
  })

  const feedbackResponse = (rating: number, comment: string | null) => jsonResponse({
    job_id: firstJob, rating, comment, created_at: '2026-11-05T00:00:00Z', updated_at: '2026-11-05T00:00:00Z',
  })

  it('offers a rating once an open translation finishes and remembers "Not now"', async () => {
    const user = userEvent.setup()
    renderDocumentRoute(`/documents/${firstJob}`, {
      '/api/documents/history?page=0&size=100': () => jsonResponse({
        items: [{ ...historyItems[0], status: 'PROCESSING', progress: 90 }],
        page: 0, size: 100, total_elements: 1, total_pages: 1, first: true, last: true,
      }),
      // Первая проверка статуса сообщает, что задача завершена.
      [`/api/documents/${firstJob}/status`]: () => jsonResponse({
        job_id: firstJob, status: 'DONE', progress: 100, error_code: null, error_message: null,
        file_name: null, glossary_term_count: null,
      }),
      [`/api/documents/${firstJob}/feedback`]: () => jsonResponse(apiErrorBody(404, 'Перевод ещё не оценён'), 404),
    })

    const prompt = await screen.findByRole('dialog', { name: 'Как вам перевод?' })
    expect(within(prompt).getByText('english_course_book.pdf')).toBeTruthy()
    await user.click(within(prompt).getByRole('button', { name: 'Не сейчас' }))

    expect(screen.queryByRole('dialog', { name: 'Как вам перевод?' })).toBeNull()
    expect(JSON.parse(localStorage.getItem('parallel.feedback-prompt.dismissed.v1') ?? '[]')).toEqual([firstJob])
  })

  it('rates a translation from the menu and adds a comment', async () => {
    const user = userEvent.setup()
    let saved: unknown = null
    const { fetchMock } = renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${firstJob}/feedback`]: (init) => {
        if (init?.method !== 'PUT') return jsonResponse(apiErrorBody(404, 'Перевод ещё не оценён'), 404)
        saved = JSON.parse(String(init.body))
        const body = saved as { rating: number; comment: string | null }
        return feedbackResponse(body.rating, body.comment)
      },
    })

    await user.click(within(await openActions(user)).getByRole('menuitem', { name: 'Оценить перевод' }))
    const prompt = await screen.findByRole('dialog', { name: 'Как вам перевод?' })
    await user.click(within(prompt).getByRole('radio', { name: '4 из 5' }))

    await waitFor(() => expect(saved).toEqual({ rating: 4, comment: null }))
    await user.type(within(prompt).getByLabelText('Что стоит улучшить в переводе?'), 'Термины не те')
    await user.click(within(prompt).getByRole('button', { name: 'Отправить' }))

    await waitFor(() => expect(saved).toEqual({ rating: 4, comment: 'Термины не те' }))
    expect(await within(prompt).findByText('Спасибо за отзыв!')).toBeTruthy()
    expect(callsTo(fetchMock, `/api/documents/${firstJob}/feedback`, 'PUT')).toHaveLength(2)
  })

  it('rates a document from its sidebar menu and opens it first', async () => {
    const user = userEvent.setup()
    const secondJob = '00000000-0000-0000-0000-000000000102'
    const { router } = renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${secondJob}/feedback`]: () => jsonResponse(apiErrorBody(404, 'Перевод ещё не оценён'), 404),
    })
    const secondName = 'project_report.docx'

    await user.click(await screen.findByRole('button', { name: `Действия: ${secondName}` }))
    await user.click(within(screen.getByRole('menu', { name: `Действия: ${secondName}` }))
      .getByRole('menuitem', { name: 'Оценить перевод' }))

    const prompt = await screen.findByRole('dialog', { name: 'Как вам перевод?' })
    expect(within(prompt).getByText(secondName)).toBeTruthy()
    expect(router.state.location.pathname).toBe(`/documents/${secondJob}`)
    // Отметка о запросе оценки снимается, чтобы «Назад» не открывал оценку повторно.
    await waitFor(() => expect(router.state.location.state).toBeNull())
  })

  it('shows an existing rating and keeps its comment when the rating changes', async () => {
    const user = userEvent.setup()
    let saved: unknown = null
    renderDocumentRoute(`/documents/${firstJob}`, {
      [`/api/documents/${firstJob}/feedback`]: (init) => {
        if (init?.method !== 'PUT') return feedbackResponse(5, 'Хорошо')
        saved = JSON.parse(String(init.body))
        return feedbackResponse(2, 'Хорошо')
      },
    })

    await user.click(within(await openActions(user)).getByRole('menuitem', { name: 'Оценить перевод' }))
    const prompt = await screen.findByRole('dialog', { name: 'Как вам перевод?' })
    expect(within(prompt).getByRole('radio', { name: '5 из 5' }).getAttribute('aria-checked')).toBe('true')
    await user.click(within(prompt).getByRole('radio', { name: '2 из 5' }))

    await waitFor(() => expect(saved).toEqual({ rating: 2, comment: 'Хорошо' }))
  })
})

describe('document status events', () => {
  const job = '00000000-0000-0000-0000-000000000101'
  const processingHistory = () => jsonResponse({
    items: [{ ...historyItems[0], status: 'PROCESSING', progress: 10, file_name: 'Книга.pdf' }],
    page: 0, size: 100, total_elements: 1, total_pages: 1, first: true, last: true,
  })
  const statusResponse = (status: string, progress: number, quotaRefund: string | null = null) => () => jsonResponse({
    job_id: job, status, progress, error_code: null, error_message: null,
    file_name: 'Книга.pdf', glossary_term_count: null, quota_refund: quotaRefund,
  })

  /** Открытый поток text/event-stream, в который пишет тест. */
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
    // Состояние сервера, которое возвращает эндпоинт статуса; события сообщают о его изменениях.
    let server: [string, number] = ['PROCESSING', 10]
    renderDocumentRoute(`/documents/${job}`, {
      '/api/documents/history?page=0&size=100': processingHistory,
      '/api/documents/events': stream.response,
      [`/api/documents/${job}/status`]: () => statusResponse(...server)(),
    })
    expect(await within(sidebarList()).findByText(/Переводится · 10%/)).toBeTruthy()

    await stream.send('ready', { expires_at: '2026-11-05T01:00:00Z' })
    server = ['PROCESSING', 60]
    await stream.send('job', { job_id: job, status: 'PROCESSING', progress: 60 })
    expect(await within(sidebarList()).findByText(/Переводится · 60%/)).toBeTruthy()

    server = ['DONE', 100]
    await stream.send('job', { job_id: job, status: 'DONE', progress: 100 })
    expect(await within(sidebarList()).findByText(/Не начата · /)).toBeTruthy()
    // Готовый результат можно скачать из меню документа.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Действия с документом' }))
    expect(screen.getByRole('menuitem', { name: 'Скачать перевод' })).toBeTruthy()
  })

  it('falls back to polling when the server has no event stream', async () => {
    const { fetchMock } = renderDocumentRoute(`/documents/${job}`, {
      '/api/documents/history?page=0&size=100': processingHistory,
      '/api/documents/events': () => jsonResponse(apiErrorBody(404, 'Not found'), 404),
      [`/api/documents/${job}/status`]: statusResponse('DONE', 100),
    })

    expect(await screen.findByText(/Не начата · /)).toBeTruthy()
    expect(callsTo(fetchMock, '/api/documents/events', 'GET')).toHaveLength(1)
  })

  describe('cancellation', () => {
    let restoreDialog: () => void
    beforeEach(() => { restoreDialog = installDialogPolyfill() })
    // Размонтируем открытые диалоги до того, как исчезнут их методы.
    afterEach(() => {
      cleanup()
      restoreDialog()
    })

    type ServerState = [status: string, progress: number, quotaRefund: string | null]
    const historyWith = (status: string, progress: number) => () => jsonResponse({
      items: [{ ...historyItems[0], status, progress, file_name: 'Книга.pdf' }],
      page: 0, size: 100, total_elements: 1, total_pages: 1, first: true, last: true,
    })
    const noEvents = () => jsonResponse(apiErrorBody(404, 'Not found'), 404)
    // Сообщение — живая область `status`; текст в ней лежит рядом со значком, поэтому ищем область по содержимому.
    const notice = (text: string) => waitFor(() => {
      const region = screen.getAllByRole('status').find((element) => element.textContent?.trim() === text)
      if (!region) throw new Error(`Нет сообщения «${text}»`)
      return region
    })

    it('cancels a running translation after warning that its pages stay spent', async () => {
      const user = userEvent.setup()
      let server: ServerState = ['PROCESSING', 40, null]
      const { fetchMock } = renderDocumentRoute(`/documents/${job}`, {
        '/api/documents/history?page=0&size=100': historyWith('PROCESSING', 40),
        '/api/documents/events': noEvents,
        [`/api/documents/${job}/status`]: () => statusResponse(...server)(),
        [`/api/documents/${job}/cancel`]: () => {
          server = ['CANCELED', 40, 'NONE']
          return statusResponse(...server)()
        },
      })

      await user.click(await screen.findByRole('button', { name: 'Отменить перевод' }))
      const dialog = screen.getByRole('alertdialog', { name: 'Отменить перевод «Книга.pdf»?' })
      expect(dialog.textContent).toContain('работа остановится, но списанные страницы не вернутся')
      await user.click(within(dialog).getByRole('button', { name: 'Отменить перевод' }))

      expect(await notice('Перевод отменён. Он уже начался, поэтому списанные страницы не вернутся.')).toBeTruthy()
      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(within(sidebarList()).getByText(/^Отменён/).textContent).not.toContain('%')
      // Отменённый документ можно отправить снова, а кнопки отмены больше нет.
      expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Отменить перевод' })).toBeNull()
      expect(callsTo(fetchMock, `/api/documents/${job}/cancel`, 'POST')).toHaveLength(1)
    })

    it('replaces the "sent for translation" notice with the result of the cancellation', async () => {
      const user = userEvent.setup()
      const newJob = '00000000-0000-0000-0000-000000000601'
      let server: ServerState = ['PENDING', 0, null]
      const status = () => jsonResponse({
        job_id: newJob, status: server[0], progress: server[1], error_code: null, error_message: null,
        file_name: 'Договор.pdf', glossary_term_count: null, quota_refund: server[2],
      })
      renderDocumentRoute('/', {
        '/api/documents/events': noEvents,
        '/api/documents/upload': () => jsonResponse({ job_id: newJob, billed_units: 2, glossary_term_count: null }, 202),
        [`/api/documents/${newJob}/status`]: status,
        [`/api/documents/${newJob}/cancel`]: () => {
          server = ['CANCELED', 0, 'REFUNDED']
          return status()
        },
      })
      await screen.findAllByText('English course book')
      const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')
      await user.upload(input as HTMLInputElement, new File(['%PDF'], 'Договор.pdf', { type: 'application/pdf' }))
      await user.click(await screen.findByRole('button', { name: 'Перевести' }))
      expect(await screen.findByText(/«Договор\.pdf» отправлен на перевод/)).toBeTruthy()

      await user.click(screen.getByRole('button', { name: 'Отменить перевод' }))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Отменить перевод' }))

      expect(await notice('Перевод отменён. Списанные страницы вернулись на счёт.')).toBeTruthy()
      expect(screen.queryByText(/отправлен на перевод/)).toBeNull()
      // Возвращённые страницы больше не показываются как списанные.
      expect(screen.queryByText(/списано 2 стр\./)).toBeNull()
    })

    it('keeps translating when the user changes their mind', async () => {
      const user = userEvent.setup()
      const { fetchMock } = renderDocumentRoute(`/documents/${job}`, {
        '/api/documents/history?page=0&size=100': historyWith('PROCESSING', 40),
        '/api/documents/events': noEvents,
        [`/api/documents/${job}/status`]: statusResponse('PROCESSING', 40),
      })

      await user.click(await screen.findByRole('button', { name: 'Отменить перевод' }))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Продолжить перевод' }))

      expect(screen.queryByRole('alertdialog')).toBeNull()
      expect(callsTo(fetchMock, `/api/documents/${job}/cancel`, 'POST')).toHaveLength(0)
    })

    it('shows the page refund once the translation service confirms it', async () => {
      const user = userEvent.setup()
      const stream = eventStream()
      let server: ServerState = ['PENDING', 0, null]
      renderDocumentRoute(`/documents/${job}`, {
        '/api/documents/history?page=0&size=100': historyWith('PENDING', 0),
        '/api/documents/events': stream.response,
        [`/api/documents/${job}/status`]: () => statusResponse(...server)(),
        [`/api/documents/${job}/cancel`]: () => {
          server = ['CANCELED', 0, 'PENDING']
          return statusResponse(...server)()
        },
      })
      await stream.send('ready', { expires_at: '2026-11-05T01:00:00Z' })

      await user.click(await screen.findByRole('button', { name: 'Отменить перевод' }))
      const dialog = screen.getByRole('alertdialog')
      expect(dialog.textContent).toContain('страницы вернутся на счёт')
      await user.click(within(dialog).getByRole('button', { name: 'Отменить перевод' }))
      expect(await notice('Перевод отменён. Возврат страниц уточняется — обычно это несколько секунд.')).toBeTruthy()

      // Сервис перевода подтвердил, что не начинал: событие CANCELED просит перечитать статус.
      server = ['CANCELED', 0, 'REFUNDED']
      await stream.send('job', { job_id: job, status: 'CANCELED', progress: 0 })
      expect(await notice('Перевод отменён. Списанные страницы вернулись на счёт.')).toBeTruthy()
    })

    it('explains that a finished translation can no longer be canceled and shows the result', async () => {
      const user = userEvent.setup()
      let server: ServerState = ['PROCESSING', 90, null]
      renderDocumentRoute(`/documents/${job}`, {
        '/api/documents/history?page=0&size=100': historyWith('PROCESSING', 90),
        '/api/documents/events': noEvents,
        [`/api/documents/${job}/status`]: () => statusResponse(...server)(),
        [`/api/documents/${job}/cancel`]: () => {
          server = ['DONE', 100, null]
          return jsonResponse(apiErrorBody(409, 'Перевод уже завершён', 'DOCUMENT_ALREADY_FINISHED'), 409)
        },
      })

      await user.click(await screen.findByRole('button', { name: 'Отменить перевод' }))
      await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Отменить перевод' }))

      expect((await within(screen.getByRole('alertdialog')).findByRole('alert')).textContent)
        .toBe('Перевод уже завершён — отменить его нельзя.')
      expect(await within(sidebarList()).findByText(/Не начата · /)).toBeTruthy()
    })
  })
})

describe('home screen', () => {
  const pdf = (name = 'Глава 1.pdf') => new File(['%PDF'], name, { type: 'application/pdf' })
  const fileInput = () => screen.getByLabelText(/Перетащите документ сюда/) as HTMLInputElement

  it('greets on entry instead of opening the last document', async () => {
    renderDocumentRoute('/')

    expect(await screen.findByRole('heading', { name: 'Что полистаем сегодня?' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Оригинал' })).toBeNull()
    expect(within(sidebarList()).queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })

  it('opens a chosen file as a draft with the language pair picked on the home screen', async () => {
    const user = userEvent.setup()
    const { router } = renderDocumentRoute('/')
    await user.click(await screen.findByRole('button', { name: 'Язык перевода: Русский' }))
    await user.type(screen.getByRole('combobox', { name: 'Найти язык' }), 'немец{Enter}')

    await user.upload(fileInput(), pdf())

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/drafts\/local-/))
    expect(await screen.findByRole('button', { name: 'Язык перевода: Немецкий (DE)' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('parallel.home-languages.v1') ?? '{}'))
      .toEqual({ source: 'eng_Latn', target: 'deu_Latn' })
  })

  it('opens a document dropped onto the page', async () => {
    const { router } = renderDocumentRoute('/')
    const heading = await screen.findByRole('heading', { name: 'Что полистаем сегодня?' })
    const dataTransfer = { files: [pdf('Перетащенный.pdf')], types: ['Files'] }

    fireEvent.dragEnter(heading, { dataTransfer })
    expect(screen.getByText('Отпустите, чтобы открыть')).toBeTruthy()
    fireEvent.drop(heading, { dataTransfer })

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/drafts\//))
    expect(within(sidebarList()).getByRole('button', { name: /^Перетащенный/ })).toBeTruthy()
  })

  it('explains an unsupported file and stays home', async () => {
    const { router } = renderDocumentRoute('/')
    await screen.findByRole('heading', { name: 'Что полистаем сегодня?' })

    // Перетаскивание обходит фильтр accept у input, как и настоящее перетаскивание.
    fireEvent.drop(screen.getByRole('heading', { name: 'Что полистаем сегодня?' }), {
      dataTransfer: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })], types: ['Files'] },
    })

    expect((await screen.findByRole('alert')).textContent).toMatch(/PDF|DOC/)
    expect(router.state.location.pathname).toBe('/')
  })

  it('offers upload and recent documents in the "+" menu', async () => {
    const user = userEvent.setup()
    const { router } = renderDocumentRoute('/')
    await within(await screen.findByRole('navigation', { name: 'Мои книги' })).findByRole('button', { name: /^English course book/ })
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})

    await user.click(screen.getByRole('button', { name: 'Добавить документ' }))
    await user.click(screen.getByRole('menuitem', { name: 'Загрузить с устройства…' }))
    expect(click).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Добавить документ' }))
    await user.click(screen.getByRole('menuitem', { name: 'Открыть «project_report.docx» · Готов' }))
    expect(router.state.location.pathname).toBe('/documents/00000000-0000-0000-0000-000000000102')
  })

  it('returns home from the logo and from a draft lost on reload', async () => {
    const user = userEvent.setup()
    const { router } = renderDocumentRoute('/drafts/local-gone')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await user.click(within(sidebarList()).getAllByRole('button')[0])
    expect(router.state.location.pathname).toMatch(/^\/documents\//)
    await user.click(screen.getByRole('link', { name: 'На главную' }))
    expect(router.state.location.pathname).toBe('/')
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
