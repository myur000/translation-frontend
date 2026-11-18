import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '../api/client.ts'
import type { NoteResponse, NoteSummary } from '../api/contracts/notes.ts'
import type { DocumentText } from '../api/documentText.ts'
import { WorkspaceNotesPanel } from '../components/notes/WorkspaceNotesPanel.tsx'
import { NoteEditSession } from '../components/notes/NoteEditSession.tsx'
import type { BookQuote } from '../notes/bookQuotes.ts'
import { DeleteDocumentDialog } from '../components/workspace/DeleteDocumentDialog.tsx'
import { NotesProvider } from '../notes/NotesProvider.tsx'
import { TestQueryProvider } from './queryWrapper.tsx'
import type { QuoteSelection } from '../notes/quoteLocator.ts'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import type { DocumentItem } from '../types/document.ts'
import { installDialogPolyfill } from './dialogPolyfill.ts'

const api = vi.hoisted(() => ({
  listNotes: vi.fn(),
  getNote: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  getNoteBacklinks: vi.fn(),
  getNoteGraph: vi.fn(),
  addNoteQuote: vi.fn(),
  deleteNoteQuote: vi.fn(),
}))
const text = vi.hoisted(() => ({ loadDocumentText: vi.fn() }))
vi.mock('../api/notes.ts', () => api)
vi.mock('../api/documentText.ts', () => text)
vi.mock('../auth/useAuth.ts', () => ({
  useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }),
}))

const book: DocumentItem = { id: 'book-1', jobId: 'job-1', name: 'ledger.docx', status: 'ready',
  pages: 3, sourceLanguage: 'eng_Latn', targetLanguage: 'rus_Cyrl' }
const bookText: DocumentText = { sourceAvailable: true, aligned: true, truncated: false, paragraphs: [
  { index: 0, source: 'Chapter One', translation: 'Глава первая' },
  { index: 1, source: 'The wind came from the north-east.', translation: 'Ветер дул с северо-востока.' },
] }
const quoteResponse = { id: 'q-1', job_id: 'job-1', document_name: 'ledger.docx', document_available: true,
  side: 'TRANSLATION' as const, paragraph_index: 1, quote: 'Ветер дул с северо-востока.', paired_text: 'The wind came from the north-east.',
  source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', created_at: '2026-11-10T10:00:00Z' }
const storm: NoteResponse = { id: 'n-1', title: 'Шторм', body: 'Ветер — важная деталь.', version: 1,
  created_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-10T10:00:00Z', tags: [], links: [], quotes: [quoteResponse] }
const summary = (note: NoteResponse): NoteSummary => ({ id: note.id, title: note.title, excerpt: note.body, tags: [],
  quote_count: note.quotes.length, version: note.version, updated_at: note.updated_at })
const conflict = (message: string) =>
  new ApiClientError(message, 409, { timestamp: '', status: 409, message, path: '', fieldErrors: {}, correlation_id: '' } as never, null, null)
const page = (items: NoteSummary[]) => ({ items, page: 0, size: 50, total_elements: items.length, total_pages: 1 })

const bookQuote = (noteId: string, paragraphIndex: number): BookQuote => ({ id: `q-${noteId}`, noteId, noteTitle: '', side: 'TRANSLATION',
  paragraphIndex, quote: '', pairedText: null, paragraphText: null, note: storm })

function renderPanel(props: Partial<Parameters<typeof WorkspaceNotesPanel>[0]> = {}) {
  const handlers = { onQuoteFinished: vi.fn(), onShowQuote: vi.fn(() => 'shown' as const), onClose: vi.fn() }
  render(
    <PreferencesProvider>
      <MemoryRouter>
        <TestQueryProvider><NotesProvider>
          <WorkspaceNotesPanel document={book} bookQuotes={[bookQuote('n-1', 1)]} pendingQuote={null} {...handlers} {...props} />
        </NotesProvider></TestQueryProvider>
      </MemoryRouter>
    </PreferencesProvider>,
  )
  return handlers
}
const selection: QuoteSelection = { side: 'TRANSLATION', text: 'дул с северо-востока', blockText: 'Ветер дул с северо-востока.', paragraphIndex: null }

let restoreDialog: () => void
beforeEach(() => {
  restoreDialog = installDialogPolyfill()
  for (const mock of [...Object.values(api), text.loadDocumentText]) mock.mockReset()
  api.listNotes.mockImplementation(async (query: { job_id?: string }) => page(query.job_id ? [summary(storm)] : [summary(storm), summary({ ...storm, id: 'n-2', title: 'Общая', quotes: [] })]))
  api.getNote.mockResolvedValue(storm)
  api.getNoteBacklinks.mockResolvedValue([])
  text.loadDocumentText.mockResolvedValue(bookText)
})
afterEach(() => {
  cleanup()
  restoreDialog()
})

describe('notes next to the book', () => {
  it('lists the notes of this book in reading order with the paragraph number', async () => {
    const user = userEvent.setup()
    api.listNotes.mockResolvedValue(page([summary(storm), summary({ ...storm, id: 'n-2', title: 'Маяк' }),
      summary({ ...storm, id: 'n-3', title: 'Конспект', quotes: [] })]))
    const handlers = renderPanel({ bookQuotes: [bookQuote('n-1', 4), bookQuote('n-2', 1), bookQuote('n-1', 7)] })

    const panel = screen.getByRole('complementary', { name: 'Заметки' })
    await within(panel).findByRole('button', { name: /Шторм/ })
    expect(api.listNotes).toHaveBeenCalledWith({ job_id: 'job-1', size: 50 }, expect.objectContaining({ accessToken: 'jwt' }))
    // Сначала заметка о книге целиком, затем по первому процитированному абзацу (с единицы).
    expect(within(panel).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '§КонспектВетер — важная деталь.', '¶2МаякВетер — важная деталь.', '¶5ШтормВетер — важная деталь.',
    ])
    // Вкладок и поиска больше нет: все заметки — в разделе «Заметки».
    expect(within(panel).queryByRole('tab')).toBeNull()
    expect(within(panel).getByRole('link', { name: 'Открыть раздел «Заметки»' }).getAttribute('href')).toBe('/notes')
    await user.click(within(panel).getByRole('button', { name: 'Закрыть заметки' }))
    expect(handlers.onClose).toHaveBeenCalledOnce()
    await user.click(within(panel).getByRole('button', { name: 'Новая заметка' }))
    expect(await screen.findByRole('textbox', { name: 'Название' })).toBeTruthy()
  })

  it('writes a thought right away and saves it with the bilingual quote', async () => {
    const user = userEvent.setup()
    api.createNote.mockResolvedValue({ ...storm, id: 'n-3', title: 'дул с северо-востока' })
    const handlers = renderPanel({ pendingQuote: selection })
    const composer = await screen.findByRole('group', { name: 'Новая цитата' })
    // Курсор сразу в тексте мысли; второй язык и поле названия не занимают место.
    const thought = within(composer).getByRole('textbox', { name: 'Текст заметки' })
    expect(document.activeElement).toBe(thought)
    expect(within(composer).queryByText('The wind came from the north-east.')).toBeNull()
    expect(within(composer).getByText('Название: дул с северо-востока')).toBeTruthy()
    await user.click(await within(composer).findByRole('button', { name: 'Показать оригинал' }))
    expect(within(composer).getByText('The wind came from the north-east.')).toBeTruthy()

    await user.type(thought, 'Ветер как предвестник')
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(api.createNote).toHaveBeenCalledWith({
      title: 'дул с северо-востока', body: 'Ветер как предвестник',
      quote: { job_id: 'job-1', side: 'TRANSLATION', paragraph_index: 1, quote: 'дул с северо-востока', paired_text: 'The wind came from the north-east.' },
    }, expect.objectContaining({ accessToken: 'jwt' }))
    expect(handlers.onQuoteFinished).toHaveBeenCalled()
  })

  it('opens the title field when the title from the quote is already taken', async () => {
    const user = userEvent.setup()
    api.createNote.mockRejectedValueOnce(conflict('Заметка с таким названием уже есть'))
    renderPanel({ pendingQuote: selection })
    const composer = await screen.findByRole('group', { name: 'Новая цитата' })
    await within(composer).findByRole('button', { name: 'Показать оригинал' })
    await user.click(within(composer).getByRole('button', { name: 'Сохранить' }))

    const title = await within(composer).findByRole('textbox', { name: 'Название' })
    expect(document.activeElement).toBe(title)
    expect(within(composer).getByRole('alert').textContent).toContain('Заметка с таким названием уже есть')
    await user.clear(title)
    await user.type(title, 'Северо-восточный ветер')
    api.createNote.mockResolvedValue({ ...storm, id: 'n-3' })
    await user.click(within(composer).getByRole('button', { name: 'Сохранить' }))
    expect(api.createNote).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Северо-восточный ветер' }), expect.anything())
  })

  it('adds the quote and the thought to a note of the same paragraph in one click', async () => {
    const user = userEvent.setup()
    api.addNoteQuote.mockResolvedValue(quoteResponse)
    api.updateNote.mockResolvedValue({ ...storm, version: 2 })
    renderPanel({ pendingQuote: selection })
    const composer = await screen.findByRole('group', { name: 'Новая цитата' })
    await within(composer).findByRole('button', { name: 'Показать оригинал' })
    await user.type(within(composer).getByRole('textbox', { name: 'Текст заметки' }), 'И снова ветер')
    await user.click(within(composer).getByRole('button', { name: 'Добавить к «Шторм»' }))

    expect(api.addNoteQuote).toHaveBeenCalledWith('n-1', expect.objectContaining({ job_id: 'job-1', paragraph_index: 1 }), expect.anything())
    // Текст дописан в конец заметки отдельным абзацем, с её текущей версией.
    expect(api.updateNote).toHaveBeenCalledWith('n-1',
      { title: 'Шторм', body: 'Ветер — важная деталь.\n\nИ снова ветер', version: 1 }, expect.anything())
  })

  it('finds another note to add the quote to on request', async () => {
    const user = userEvent.setup()
    api.addNoteQuote.mockResolvedValue(quoteResponse)
    renderPanel({ pendingQuote: selection, bookQuotes: [] })
    const composer = await screen.findByRole('group', { name: 'Новая цитата' })
    await within(composer).findByRole('button', { name: 'Показать оригинал' })
    // У абзаца нет заметок — поиск свёрнут в одну ссылку.
    expect(within(composer).queryByRole('searchbox')).toBeNull()
    await user.click(within(composer).getByRole('button', { name: 'Добавить к другой заметке…' }))
    await user.click(await within(composer).findByRole('button', { name: /Общая/ }))
    expect(api.addNoteQuote).toHaveBeenCalledWith('n-2', expect.objectContaining({ paragraph_index: 1 }), expect.anything())
    // Без текста заметка не переписывается.
    expect(api.updateNote).not.toHaveBeenCalled()
  })

  it('writes an excerpt into the current summary of the book in the column', async () => {
    const user = userEvent.setup()
    const summary: NoteResponse = { ...storm, id: 's-1', title: 'Конспект — Ledger', body: '', quotes: [] }
    api.addNoteQuote.mockResolvedValue(quoteResponse)
    api.getNote.mockResolvedValue(summary)
    const stormQuote = { ...bookQuote('n-1', 1), noteTitle: 'Шторм', quote: 'Ветер дул с северо-востока.' }
    renderPanel({ pendingQuote: selection, pendingQuoteKind: 'summary', summaries: [summary], bookQuotes: [stormQuote] })
    const composer = await screen.findByRole('group', { name: 'Выписка в конспект' })
    await within(composer).findByRole('button', { name: 'Показать оригинал' })
    // Без полей «В конспект» пишется в колонке, в тот же текущий конспект, что у закладки.
    expect(composer.textContent).toContain('В «Конспект — Ledger»')
    // Заметка «Шторм» цитирует этот абзац — та же мысль уже записана, подсказка ведёт к ней.
    expect(within(composer).getByRole('button', { name: 'Уже в заметке «Шторм»' })).toBeTruthy()
    await user.click(within(composer).getByRole('button', { name: 'В конспект' }))
    expect(api.addNoteQuote).toHaveBeenCalledWith('s-1', expect.objectContaining({ paragraph_index: 1 }), expect.anything())
  })

  it('explains that a removed original can no longer be quoted', async () => {
    text.loadDocumentText.mockResolvedValue({ ...bookText, sourceAvailable: false })
    renderPanel({ pendingQuote: { ...selection, side: 'SOURCE', text: 'north-east' } })
    expect((await screen.findByRole('alert')).textContent).toContain('Оригинал уже удалён с сервера')
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('opens a note in the panel, shows its quote in the book and removes it', async () => {
    const user = userEvent.setup()
    api.deleteNoteQuote.mockResolvedValue(undefined)
    const handlers = renderPanel()
    handlers.onShowQuote.mockReturnValueOnce('shown').mockReturnValueOnce('notFound' as never)
    await user.click(await screen.findByRole('button', { name: /Шторм/ }))
    expect(await screen.findByRole('heading', { name: 'Шторм' })).toBeTruthy()
    const quotes = screen.getByRole('region', { name: 'Цитаты из книг' })
    await user.click(within(quotes).getByRole('button', { name: 'Показать в книге' }))
    expect(handlers.onShowQuote).toHaveBeenCalledWith(quoteResponse)
    await user.click(within(quotes).getByRole('button', { name: 'Показать в книге' }))
    expect(screen.getByText('Не удалось найти этот фрагмент на странице книги.')).toBeTruthy()
    await user.click(within(quotes).getByRole('button', { name: 'Убрать цитату из заметки' }))
    expect(api.deleteNoteQuote).toHaveBeenCalledWith('n-1', 'q-1', expect.anything())
  })
})

describe('opening notes from a margin marker', () => {
  it('opens the only note of the paragraph right away', async () => {
    renderPanel({ request: { nonce: 1, noteIds: ['n-1'] } })
    expect(await screen.findByRole('heading', { name: 'Шторм' })).toBeTruthy()
  })

  it('narrows the book list to the notes of the paragraph', async () => {
    const user = userEvent.setup()
    api.listNotes.mockImplementation(async () => page([summary(storm), summary({ ...storm, id: 'n-2', title: 'Маяк' }),
      summary({ ...storm, id: 'n-3', title: 'Погода' })]))
    renderPanel({ request: { nonce: 1, noteIds: ['n-1', 'n-3'] } })

    expect((await screen.findByRole('status')).textContent).toContain('К этому абзацу: 2')
    expect(screen.getByRole('button', { name: /Шторм/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Погода/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Маяк/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Все заметки книги' }))
    expect(screen.getByRole('button', { name: /Маяк/ })).toBeTruthy()
  })

  it('names a list narrowed to the summaries of the book as summaries, not paragraph notes', async () => {
    api.listNotes.mockImplementation(async () => page([summary(storm), summary({ ...storm, id: 'n-3', title: 'Конспект' })]))
    renderPanel({ request: { nonce: 1, noteIds: ['n-1', 'n-3'], about: true } })
    expect((await screen.findByRole('status')).textContent).toContain('Конспекты книги: 2')
  })
})

describe('deleting a quoted book', () => {
  it('warns that quotes stay in notes', async () => {
    api.listNotes.mockResolvedValue({ ...page([summary(storm)]), total_elements: 3 })
    render(
      <PreferencesProvider>
        <TestQueryProvider>
          <DeleteDocumentDialog document={book} onDelete={vi.fn()} onClose={vi.fn()} />
        </TestQueryProvider>
      </PreferencesProvider>,
    )
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toContain('останутся в заметках (3)'))
    expect(api.listNotes).toHaveBeenCalledWith({ job_id: 'job-1', size: 1 }, expect.anything())
  })
})

describe('closing the note editor before autosave', () => {
  const renderSession = (onSaved = vi.fn()) => render(
    <PreferencesProvider>
      <MemoryRouter>
        <TestQueryProvider><NotesProvider>
          <NoteEditSession note={storm} knownLinks={[]} compact onSaved={onSaved} onLatest={vi.fn()} onClose={vi.fn()} />
        </NotesProvider></TestQueryProvider>
      </MemoryRouter>
    </PreferencesProvider>,
  )

  it('saves the last edit right away instead of dropping it', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    api.updateNote.mockResolvedValue({ ...storm, body: 'Ветер — важная деталь. Шторм', version: 2 })
    const { unmount } = renderSession(onSaved)
    await user.type(screen.getByRole('textbox', { name: 'Текст заметки' }), ' Шторм')
    // Клик мимо карточки закрывает редактор раньше, чем пройдёт секунда автосохранения.
    expect(api.updateNote).not.toHaveBeenCalled()
    unmount()
    await waitFor(() => expect(api.updateNote).toHaveBeenCalledWith('n-1',
      { title: 'Шторм', body: 'Ветер — важная деталь. Шторм', version: 1 }, expect.anything()))
  })

  it('sends nothing when nothing was edited', async () => {
    const { unmount } = renderSession()
    unmount()
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(api.updateNote).not.toHaveBeenCalled()
  })
})
