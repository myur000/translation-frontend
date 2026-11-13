import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteResponse, NoteSummary } from '../api/contracts/notes.ts'
import type { DocumentText } from '../api/documentText.ts'
import { WorkspaceNotesPanel } from '../components/notes/WorkspaceNotesPanel.tsx'
import { DeleteDocumentDialog } from '../components/workspace/DeleteDocumentDialog.tsx'
import { NotesProvider } from '../notes/NotesProvider.tsx'
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
const page = (items: NoteSummary[]) => ({ items, page: 0, size: 50, total_elements: items.length, total_pages: 1 })

function renderPanel(props: Partial<Parameters<typeof WorkspaceNotesPanel>[0]> = {}) {
  const handlers = { onQuoteFinished: vi.fn(), onShowQuote: vi.fn(() => 'shown' as const), onClose: vi.fn() }
  render(
    <PreferencesProvider>
      <MemoryRouter>
        <NotesProvider>
          <WorkspaceNotesPanel document={book} pendingQuote={null} {...handlers} {...props} />
        </NotesProvider>
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
  it('lists the notes quoting this book and all notes on request', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(await screen.findByRole('button', { name: /Шторм/ })).toBeTruthy()
    expect(api.listNotes).toHaveBeenCalledWith({ job_id: 'job-1', size: 50 }, expect.objectContaining({ accessToken: 'jwt' }))
    expect(screen.getByText('К этой книге: 1')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'Все заметки' }))
    expect(await screen.findByRole('button', { name: /Общая/ })).toBeTruthy()
  })

  it('turns a selection into a bilingual quote in a new note', async () => {
    const user = userEvent.setup()
    api.createNote.mockResolvedValue({ ...storm, id: 'n-3', title: 'дул с северо-востока' })
    const handlers = renderPanel({ pendingQuote: selection })
    expect(await screen.findByText('The wind came from the north-east.')).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Название' }) as HTMLInputElement).value).toBe('дул с северо-востока')
    await user.click(screen.getByRole('button', { name: 'Создать с цитатой' }))
    expect(api.createNote).toHaveBeenCalledWith({
      title: 'дул с северо-востока', body: '',
      quote: { job_id: 'job-1', side: 'TRANSLATION', paragraph_index: 1, quote: 'дул с северо-востока', paired_text: 'The wind came from the north-east.' },
    }, expect.objectContaining({ accessToken: 'jwt' }))
    expect(handlers.onQuoteFinished).toHaveBeenCalled()
  })

  it('adds a quote to an existing note of this book', async () => {
    const user = userEvent.setup()
    api.addNoteQuote.mockResolvedValue(quoteResponse)
    renderPanel({ pendingQuote: selection })
    await screen.findByText('The wind came from the north-east.')
    await user.click(await screen.findByRole('button', { name: /Шторм/ }))
    expect(api.addNoteQuote).toHaveBeenCalledWith('n-1', expect.objectContaining({ job_id: 'job-1', paragraph_index: 1 }), expect.anything())
  })

  it('explains that a removed original can no longer be quoted', async () => {
    text.loadDocumentText.mockResolvedValue({ ...bookText, sourceAvailable: false })
    renderPanel({ pendingQuote: { ...selection, side: 'SOURCE', text: 'north-east' } })
    expect((await screen.findByRole('alert')).textContent).toContain('Оригинал уже удалён с сервера')
    expect((screen.getByRole('button', { name: 'Создать с цитатой' }) as HTMLButtonElement).disabled).toBe(true)
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

describe('deleting a quoted book', () => {
  it('warns that quotes stay in notes', async () => {
    api.listNotes.mockResolvedValue({ ...page([summary(storm)]), total_elements: 3 })
    render(
      <PreferencesProvider>
        <DeleteDocumentDialog document={book} onDelete={vi.fn()} onClose={vi.fn()} />
      </PreferencesProvider>,
    )
    await waitFor(() => expect(screen.getByRole('alertdialog').textContent).toContain('останутся в заметках (3)'))
    expect(api.listNotes).toHaveBeenCalledWith({ job_id: 'job-1', size: 1 }, expect.anything())
  })
})
