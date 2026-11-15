import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteResponse } from '../api/contracts/notes.ts'
import { MarginNotes, type MarginDraft } from '../components/notes/MarginNotes.tsx'
import type { NotesPanelRequest } from '../components/notes/WorkspaceNotesPanel.tsx'
import type { BookQuote } from '../notes/bookQuotes.ts'
import type { QuoteSelection } from '../notes/quoteLocator.ts'
import { NotesProvider } from '../notes/NotesProvider.tsx'
import { useNotes } from '../notes/useNotes.ts'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'

const api = vi.hoisted(() => ({
  listNotes: vi.fn(), getNote: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
  getNoteBacklinks: vi.fn(), getNoteGraph: vi.fn(), addNoteQuote: vi.fn(), deleteNoteQuote: vi.fn(),
}))
vi.mock('../api/notes.ts', () => api)
const text = vi.hoisted(() => ({ loadDocumentText: vi.fn() }))
vi.mock('../api/documentText.ts', () => text)
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }) }))

const note = (id: string, title: string, body: string): NoteResponse => ({
  id, title, body, version: 3, created_at: '', updated_at: '', tags: [], links: [], quotes: [],
})
const storm = note('n-1', 'Шторм', 'Ветер — важная деталь.\n\nВторая мысль.')
/** Цитата в ответе сервера на её добавление. */
const savedQuote = (id: string, text: string) => ({
  id, job_id: 'job-1', document_name: 'lighthouse-keepers-ledger.docx', document_available: true, side: 'TRANSLATION',
  paragraph_index: 1, quote: text, paired_text: null, source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', created_at: '',
})
const quote = (target: NoteResponse, paragraphIndex: number): BookQuote => ({
  id: `q-${target.id}`, noteId: target.id, noteTitle: target.title, side: 'TRANSLATION', paragraphIndex,
  quote: paragraphIndex === 1 ? 'Ветер дул' : 'увидел свет', pairedText: null, paragraphText: null, note: target,
})

/** Сколько раз заметки менялись: по этому числу рабочая область перечитывает цитаты и конспекты. */
function Revision() {
  return <output aria-label="Ревизия заметок">{useNotes().revision}</output>
}

/** Колонка книги в текстовом виде: абзацы с номерами, как у текста с сервера. */
function Book(props: {
  quotes: BookQuote[]
  aboutBook?: NoteResponse[]
  request?: NotesPanelRequest | null
  draft?: MarginDraft | null
  summaryQuote?: { nonce: number; selection: QuoteSelection } | null
  onSummaryQuoteDone?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <PreferencesProvider>
      <MemoryRouter>
        <NotesProvider>
          <div ref={ref} role="region" aria-label="Колонка" tabIndex={-1}>
            <article>
              <p data-paragraph-index="0">Глава первая</p>
              <p data-paragraph-index="1">Ветер дул с северо-востока.</p>
              <p data-paragraph-index="2">Незадолго до полуночи он увидел свет.</p>
            </article>
          </div>
          <MarginNotes viewportRef={ref} column="TRANSLATION" jobId="job-1" bookName="lighthouse-keepers-ledger.docx" quotes={props.quotes} aboutBook={props.aboutBook} layoutKey="translation"
            request={props.request ?? null} draft={props.draft ?? null} onDraftDone={vi.fn()}
            summaryQuote={props.summaryQuote ?? null} onSummaryQuoteDone={props.onSummaryQuoteDone} />
          <Revision />
        </NotesProvider>
      </MemoryRouter>
    </PreferencesProvider>
  )
}

/** jsdom не считает раскладку: колонка 1100px, страница — `pageWidth`. */
function mockGeometry(pageWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1100)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const width = this.tagName === 'ARTICLE' ? pageWidth : 0
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0, width, height: 0, toJSON: () => ({}) } as DOMRect
  })
}
const nextFrame = () => act(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())))

beforeEach(() => {
  // Текущий конспект книги запоминается в localStorage: тесты не делят его между собой.
  localStorage.clear()
  for (const mock of Object.values(api)) mock.mockReset()
  api.listNotes.mockResolvedValue({ items: [], page: 0, size: 50, total_elements: 0, total_pages: 0 })
  text.loadDocumentText.mockResolvedValue({ sourceAvailable: true, aligned: true, truncated: false, paragraphs: [
    { index: 0, source: 'Chapter One', translation: 'Глава первая' },
    { index: 1, source: 'The wind came from the north-east.', translation: 'Ветер дул с северо-востока.' },
    { index: 2, source: 'Shortly before midnight he saw a light.', translation: 'Незадолго до полуночи он увидел свет.' },
  ] })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('margin notes', () => {
  it('puts a collapsed card next to its paragraph and frees the margin for it', async () => {
    mockGeometry(560)
    render(<Book quotes={[quote(storm, 1)]} />)
    await nextFrame()

    const card = await screen.findByRole('region', { name: 'Шторм' })
    expect(card.textContent).toContain('Ветер — важная деталь.')
    // Справа освобождено место под карточку полной ширины: 260 + 2 × 16.
    expect(screen.getByRole('region', { name: 'Колонка' }).style.getPropertyValue('--margin-notes-space')).toBe('292px')
    expect(card.style.width).toBe('260px')
  })

  it('keeps the freed margin while the quotes change, so the page does not jump', async () => {
    mockGeometry(560)
    const { rerender, unmount } = render(<Book quotes={[quote(storm, 1)]} />)
    await nextFrame()
    const column = screen.getByRole('region', { name: 'Колонка' })
    expect(column.style.getPropertyValue('--margin-notes-space')).toBe('292px')

    // Новая цитата приходит сразу после сохранения, до следующего кадра: отступ на месте.
    rerender(<Book quotes={[quote(storm, 1), { ...quote(storm, 2), id: 'q-2' }]} />)
    expect(column.style.getPropertyValue('--margin-notes-space')).toBe('292px')
    await nextFrame()
    expect(column.style.getPropertyValue('--margin-notes-space')).toBe('292px')

    unmount()
    expect(column.style.getPropertyValue('--margin-notes-space')).toBe('')
  })

  it('opens a card and edits the note in place with the caret at the end', async () => {
    mockGeometry(560)
    const user = userEvent.setup()
    api.updateNote.mockResolvedValue({ ...storm, body: `${storm.body} Третья мысль.`, version: 4 })
    render(<Book quotes={[quote(storm, 1)]} />)
    await nextFrame()

    await user.click(within(await screen.findByRole('region', { name: 'Шторм' })).getByRole('button'))
    const card = screen.getByRole('region', { name: 'Шторм' })
    expect(within(card).getByText('Вторая мысль.')).toBeTruthy()
    expect(within(card).getByText('¶2')).toBeTruthy()
    // В шапке — номер абзаца и две иконки: правка и раздел заметок.
    expect(within(card).getByRole('link', { name: 'Открыть заметку «Шторм» в разделе «Заметки»' }).getAttribute('href')).toBe('/notes/n-1')
    expect(within(card).getByRole('button', { name: 'Изменить заметку «Шторм»' })).toBeTruthy()

    // «Дописать…» открывает правку всей заметки, курсор — в конце текста.
    await user.click(within(card).getByRole('button', { name: 'Дописать…' }))
    const body = within(card).getByRole('textbox', { name: 'Текст заметки' }) as HTMLTextAreaElement
    expect(document.activeElement).toBe(body)
    expect(body.selectionStart).toBe(storm.body.length)
    await user.type(body, ' Третья мысль.', { skipClick: true })
    await user.click(within(card).getByRole('button', { name: 'Готово' }))
    expect(api.updateNote).toHaveBeenCalledWith('n-1', {
      title: 'Шторм', body: 'Ветер — важная деталь.\n\nВторая мысль. Третья мысль.', version: 3,
    }, expect.objectContaining({ accessToken: 'jwt' }))
    // После сохранения — снова чтение, уже с новым текстом.
    expect(await within(card).findByText(/Третья мысль\./)).toBeTruthy()

    // Esc сворачивает карточку.
    await user.keyboard('{Escape}')
    expect(within(screen.getByRole('region', { name: 'Шторм' })).queryByRole('link')).toBeNull()
  })

  it('opens the editor by clicking the note text', async () => {
    mockGeometry(560)
    const user = userEvent.setup()
    render(<Book quotes={[quote(storm, 1)]} />)
    await nextFrame()
    await user.click(within(await screen.findByRole('region', { name: 'Шторм' })).getByRole('button'))
    await user.click(screen.getByText('Вторая мысль.'))
    expect(screen.getByRole('textbox', { name: 'Название' })).toBeTruthy()
    // «Готово» возвращает к чтению.
    await user.click(screen.getByRole('button', { name: 'Готово' }))
    expect(screen.queryByRole('textbox', { name: 'Название' })).toBeNull()
  })

  it('shows the notes of one paragraph as a thread and collapses on a click outside', async () => {
    mockGeometry(560)
    const user = userEvent.setup()
    const lighthouse = note('n-2', 'Маяк', 'Свет за рифом.')
    render(<Book quotes={[quote(storm, 1), quote(lighthouse, 1)]} />)
    await nextFrame()

    const card = await screen.findByRole('region', { name: 'Заметки к абзацу: 2' })
    expect(card.textContent).toContain('Заметок: 2 · ¶2')
    expect(card.textContent).toContain('Шторм · Маяк')
    await user.click(within(card).getByRole('button'))
    // Ветка: первая заметка раскрыта, вторая — строкой; клик по строке раскрывает её.
    expect(within(card).getByRole('heading', { name: 'Шторм' })).toBeTruthy()
    await user.click(within(card).getByRole('button', { name: /^Маяк/ }))
    expect(within(card).getByRole('heading', { name: 'Маяк' })).toBeTruthy()
    expect(within(card).queryByRole('heading', { name: 'Шторм' })).toBeNull()

    // Клик мимо — по тексту книги — сворачивает карточку.
    await user.click(screen.getByText('Глава первая'))
    expect(within(screen.getByRole('region', { name: 'Заметки к абзацу: 2' })).queryByRole('heading')).toBeNull()
  })

  it('hides the cards when there is no room and shows the requested one as a popover', async () => {
    // Страница почти во всю колонку: на полях места нет.
    mockGeometry(1000)
    const user = userEvent.setup()
    const { rerender } = render(<Book quotes={[quote(storm, 1)]} />)
    await nextFrame()
    expect(screen.queryByRole('region', { name: 'Шторм' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Колонка' }).style.getPropertyValue('--margin-notes-space')).toBe('0px')

    // Метка у абзаца открывает заметку всплывающей карточкой.
    rerender(<Book quotes={[quote(storm, 1)]} request={{ nonce: 1, noteIds: ['n-1'] }} />)
    expect(await screen.findByRole('heading', { name: 'Шторм' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Шторм' })).toBeNull()
  })

  it('opens a new note draft on the margin', async () => {
    mockGeometry(560)
    render(<Book quotes={[]} draft={{ nonce: 1, kind: 'new', anchor: 300 }} />)
    await nextFrame()
    const draft = await screen.findByRole('region', { name: 'Новая заметка' })
    expect(within(draft).getByRole('textbox', { name: 'Название' })).toBeTruthy()
    expect(draft.style.top).toBe('300px')
  })

  it('opens a short quote card with the caret in the thought and the notes of this paragraph first', async () => {
    mockGeometry(600)
    const selection = { side: 'TRANSLATION' as const, text: 'дул', blockText: 'Ветер дул с северо-востока.', paragraphIndex: 1 }
    render(<Book quotes={[quote(storm, 1)]} draft={{ nonce: 4, kind: 'quote', selection, anchor: 240 }} />)

    const draft = await screen.findByRole('region', { name: 'Цитата в заметку' })
    const thought = within(draft).getByRole('textbox', { name: 'Текст заметки' })
    expect(document.activeElement).toBe(thought)
    // Абзац уже с заметкой — дописать в неё можно одним кликом; поиск остальных свёрнут.
    expect(await within(draft).findByRole('button', { name: 'Добавить к «Шторм»' })).toBeTruthy()
    expect(within(draft).getByRole('button', { name: 'ещё…' }).getAttribute('aria-expanded')).toBe('false')
    expect(within(draft).queryByRole('searchbox')).toBeNull()
  })

  it('keeps an open draft at its place in the text when notes are turned off and on', async () => {
    // Слой заметок создаётся заново, книга тем временем прокручена: черновик не переезжает.
    mockGeometry(560)
    const { unmount } = render(<Book quotes={[]} draft={{ nonce: 2, kind: 'new', anchor: 1125 }} />)
    await nextFrame()
    unmount()
    render(<Book quotes={[]} draft={{ nonce: 2, kind: 'new', anchor: 1125 }} />)
    await nextFrame()
    expect((await screen.findByRole('region', { name: 'Новая заметка' })).style.top).toBe('1125px')
  })

  it('keeps the summary at hand: a bookmark at the top of the margin that stays while reading', async () => {
    mockGeometry(560)
    const summaries = [note('n-9', 'Конспект — Lighthouse keepers ledger', 'О чём книга.'), note('n-8', 'Персонажи', 'Элиас.')]
    render(<Book quotes={[quote(storm, 1)]} aboutBook={summaries} />)
    await nextFrame()

    const bookmark = await screen.findByRole('region', { name: 'Конспект книги' })
    expect(bookmark.textContent).toContain('Конспекты · 2')
    // Закладка «липкая»: в начале книги — у верха страницы, дальше держится под шапкой.
    // Её ведёт браузер (position: sticky) в одном кадре с прокруткой — скрипт её не двигает,
    // поэтому ей и дёргаться нечему.
    expect(bookmark.style.position).toBe('sticky')
    expect(bookmark.style.top).toBe('12px')
    expect((bookmark.parentElement as HTMLElement).style.top).toBe('12px')
    const column = screen.getByRole('region', { name: 'Колонка' })
    column.scrollTop = 900
    column.dispatchEvent(new Event('scroll'))
    expect(bookmark.style.top).toBe('12px')
  })

  it('opens the current summary, switches between summaries and remembers the choice', async () => {
    mockGeometry(560)
    const user = userEvent.setup()
    const summaries = [note('n-9', 'Конспект — Lighthouse keepers ledger', 'О чём книга.'), note('n-8', 'Персонажи', 'Элиас.')]
    const { unmount } = render(<Book quotes={[]} aboutBook={summaries} />)
    await nextFrame()

    const bookmark = await screen.findByRole('region', { name: 'Конспект книги' })
    await user.click(within(bookmark).getByRole('button', { expanded: false }))
    // На вкладке книга не повторяется: «Конспект — Lighthouse keepers ledger» → «Конспект».
    expect(within(bookmark).getByRole('tab', { name: 'Конспект' }).getAttribute('aria-selected')).toBe('true')
    expect(within(bookmark).getByRole('heading', { name: 'Конспект — Lighthouse keepers ledger' })).toBeTruthy()

    await user.click(within(bookmark).getByRole('tab', { name: 'Персонажи' }))
    expect(within(bookmark).getByRole('heading', { name: 'Персонажи' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('parallel.current-summary.v1.reader@example.com')!)).toEqual({ 'job-1': 'n-8' })
    await user.click(within(bookmark).getByRole('button', { name: 'Свернуть конспект' }))
    unmount()

    // Текущий конспект запомнился для книги: свёрнутая закладка показывает его.
    render(<Book quotes={[]} aboutBook={summaries} />)
    await nextFrame()
    expect((await screen.findByRole('region', { name: 'Конспект книги' })).textContent).toContain('Персонажи')
  })

  it('starts a new summary with a free title, links it to the book and makes it current', async () => {
    mockGeometry(560)
    const user = userEvent.setup()
    api.createNote.mockResolvedValue(note('n-10', 'Конспект 2 — Lighthouse keepers ledger', ''))
    const summaries = [note('n-9', 'Конспект — Lighthouse keepers ledger', 'О чём книга.')]
    render(<Book quotes={[]} aboutBook={summaries} request={{ nonce: 7, noteIds: [], about: true, aboutAction: 'new' }} />)
    await nextFrame()

    const bookmark = await screen.findByRole('region', { name: 'Конспект книги' })
    expect(within(bookmark).getByRole('button', { name: '+ Новый' }).getAttribute('aria-pressed')).toBe('true')
    // «Конспект — …» уже занят: у названий заметок уникальность.
    expect((within(bookmark).getByRole('textbox', { name: 'Название' }) as HTMLInputElement).value).toBe('Конспект 2 — Lighthouse keepers ledger')
    await user.type(within(bookmark).getByRole('textbox', { name: 'Текст заметки' }), 'Вторая мысль о книге.')
    await user.click(within(bookmark).getByRole('button', { name: 'Создать заметку' }))
    expect(api.createNote).toHaveBeenCalledWith(
      { title: 'Конспект 2 — Lighthouse keepers ledger', body: 'Вторая мысль о книге.', job_ids: ['job-1'] },
      expect.objectContaining({ accessToken: 'jwt' }),
    )
    // Заметки перечитываются, новый конспект — текущий.
    expect(screen.getByRole('status', { name: 'Ревизия заметок' }).textContent).toBe('1')
    expect(JSON.parse(localStorage.getItem('parallel.current-summary.v1.reader@example.com')!)).toEqual({ 'job-1': 'n-10' })
  })

  it('invites to start a summary when the book has none and toggles from the K key request', async () => {
    mockGeometry(560)
    const user = userEvent.setup()
    const { rerender } = render(<Book quotes={[]} />)
    await nextFrame()

    const bookmark = await screen.findByRole('region', { name: 'Конспект книги' })
    expect(bookmark.textContent).toContain('+ Начать конспект')
    rerender(<Book quotes={[]} request={{ nonce: 1, noteIds: [], about: true, aboutAction: 'toggle' }} />)
    expect((await within(bookmark).findByRole('textbox', { name: 'Название' }) as HTMLInputElement).value).toBe('Конспект — Lighthouse keepers ledger')
    // Тот же K ещё раз сворачивает закладку.
    rerender(<Book quotes={[]} request={{ nonce: 2, noteIds: [], about: true, aboutAction: 'toggle' }} />)
    expect(within(bookmark).queryByRole('textbox', { name: 'Название' })).toBeNull()
    await user.keyboard('{Escape}')
  })


  it('adds an excerpt with a thought to the current summary from «To summary»', async () => {
    mockGeometry(560)
    const user = userEvent.setup()
    const summary = note('n-9', 'Конспект — Lighthouse keepers ledger', 'О чём книга.')
    api.addNoteQuote.mockResolvedValue(savedQuote('q-9', 'северо-востока'))
    api.getNote.mockResolvedValue(summary)
    api.updateNote.mockResolvedValue({ ...summary, version: 4 })
    const onDone = vi.fn()
    const selection: QuoteSelection = { side: 'TRANSLATION', text: 'северо-востока', blockText: 'Ветер дул с северо-востока.', paragraphIndex: 1 }
    render(<Book quotes={[]} aboutBook={[summary]} summaryQuote={{ nonce: 1, selection }} onSummaryQuoteDone={onDone} />)
    await nextFrame()

    const bookmark = await screen.findByRole('region', { name: 'Конспект книги' })
    const composer = within(bookmark).getByRole('group', { name: 'Выписка в конспект' })
    // Пишется сразу в текущий конспект — название не спрашивается, видно только куда.
    expect(composer.textContent).toContain('В «Конспект — Lighthouse keepers ledger»')
    const thought = within(composer).getByRole('textbox', { name: 'Текст заметки' })
    expect(document.activeElement).toBe(thought)
    await within(composer).findByRole('button', { name: 'Показать оригинал' })
    await user.type(thought, 'Ветер — предвестник')
    await user.keyboard('{Control>}{Enter}{/Control}')

    expect(api.addNoteQuote).toHaveBeenCalledWith('n-9', expect.objectContaining({ paragraph_index: 1, quote: 'северо-востока' }), expect.anything())
    // Цитата встаёт в текст конспекта, мысль — сразу под ней.
    expect(api.updateNote).toHaveBeenCalledWith('n-9', {
      title: summary.title,
      body: 'О чём книга.\n\n> северо-востока\n> — [¶2 · перевод](quote:q-9)\n\nВетер — предвестник',
      version: 3,
    }, expect.anything())
    expect(onDone).toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('parallel.current-summary.v1.reader@example.com')!)).toEqual({ 'job-1': 'n-9' })
  })

  it('starts a summary with the excerpt when the book has none and hints that the passage is already in a note', async () => {
    mockGeometry(560)
    const user = userEvent.setup()
    api.createNote.mockResolvedValue({ ...note('n-10', 'Конспект — Lighthouse keepers ledger', ''), quotes: [savedQuote('q-10', 'дул')] })
    api.updateNote.mockImplementation(async (_id: string, request: { body: string }) => ({ ...note('n-10', 'Конспект — Lighthouse keepers ledger', request.body), version: 4 }))
    const selection: QuoteSelection = { side: 'TRANSLATION', text: 'дул', blockText: 'Ветер дул с северо-востока.', paragraphIndex: 1 }
    render(<Book quotes={[quote(storm, 1)]} summaryQuote={{ nonce: 1, selection }} />)
    await nextFrame()

    const composer = await screen.findByRole('group', { name: 'Выписка в конспект' })
    // То же место уже в заметке «Шторм» — подсказка со ссылкой, записать всё равно можно.
    expect(await within(composer).findByRole('button', { name: 'Уже в заметке «Шторм»' })).toBeTruthy()
    expect(within(composer).getByText('Название: Конспект — Lighthouse keepers ledger')).toBeTruthy()
    await user.click(within(composer).getByRole('button', { name: 'Начать конспект' }))
    expect(api.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Конспект — Lighthouse keepers ledger', job_ids: ['job-1'], quote: expect.objectContaining({ quote: 'дул' }) }),
      expect.anything(),
    )
    // Первая выписка тоже встаёт в текст нового конспекта.
    await waitFor(() => expect(api.updateNote).toHaveBeenCalledWith('n-10',
      { title: 'Конспект — Lighthouse keepers ledger', body: '> дул\n> — [¶2 · перевод](quote:q-10)', version: 3 }, expect.anything()))
  })
})
