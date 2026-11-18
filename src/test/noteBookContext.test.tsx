import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteQuoteResponse, NoteResponse } from '../api/contracts/notes.ts'
import { NoteBookBar, NoteQuoteCards } from '../components/notes/NoteBookContext.tsx'
import { bookNoteHref, noteBooks } from '../notes/noteBooks.ts'
import { NotesProvider } from '../notes/NotesProvider.tsx'
import { TestQueryProvider } from './queryWrapper.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'

const api = vi.hoisted(() => ({
  listNotes: vi.fn(), getNote: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
  getNoteBacklinks: vi.fn(), getNoteGraph: vi.fn(), addNoteQuote: vi.fn(), deleteNoteQuote: vi.fn(),
  linkNoteDocument: vi.fn(), unlinkNoteDocument: vi.fn(),
}))
vi.mock('../api/notes.ts', () => api)
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }) }))

const quote = (overrides: Partial<NoteQuoteResponse>): NoteQuoteResponse => ({
  id: 'q-1', job_id: 'job-1', document_name: 'lighthouse-keepers-ledger.docx', document_available: true, side: 'TRANSLATION',
  paragraph_index: 4, quote: 'В ночь шторма ветер дул с северо-востока.', paired_text: 'On the night of the storm the wind came from the north-east.',
  source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', created_at: '', ...overrides,
})
const note = (overrides: Partial<NoteResponse>): NoteResponse => ({
  id: 'n-1', title: 'Пам пам', body: '', version: 1, created_at: '', updated_at: '', tags: [], links: [], quotes: [], ...overrides,
})

function renderWithProviders(element: React.ReactNode) {
  return render(<PreferencesProvider><MemoryRouter><TestQueryProvider><NotesProvider>{element}</NotesProvider></TestQueryProvider></MemoryRouter></PreferencesProvider>)
}

beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset()
  api.listNotes.mockResolvedValue({ items: [], page: 0, size: 50, total_elements: 0, total_pages: 0 })
})
afterEach(() => cleanup())

describe('books of a note', () => {
  it('builds a link that opens the note in the book at its quote', () => {
    expect(bookNoteHref('job 1', 'n-1')).toBe('/documents/job%201?note=n-1')
    expect(bookNoteHref('job-1', 'n-1', 'q-1')).toBe('/documents/job-1?note=n-1&quote=q-1')
  })

  it('lists each book once: quoted books first, then linked ones, deleted ones without a link', () => {
    const books = noteBooks(note({
      quotes: [quote({}), quote({ id: 'q-2', paragraph_index: 9 }), quote({ id: 'q-3', job_id: null, document_name: null, document_available: false })],
      documents: [
        { job_id: 'job-1', document_name: 'lighthouse-keepers-ledger.docx', document_available: true, linked_at: '' },
        { job_id: 'job-2', document_name: 'salt_and_iron.pdf', document_available: true, linked_at: '' },
      ],
    }))
    expect(books.map((book) => [book.jobId, book.title, book.isLinked, book.quote?.id ?? null])).toEqual([
      ['job-1', 'Lighthouse keepers ledger', true, 'q-1'],
      ['job-2', 'Salt and iron', true, null],
    ])
  })
})

describe('note page: book bar and quote cards', () => {
  it('shows the book of the note and leads to the quote in it', () => {
    renderWithProviders(<NoteBookBar note={note({ quotes: [quote({})] })} />)
    expect(screen.getByText('Lighthouse keepers ledger')).toBeTruthy()
    expect(screen.getByText('¶5 · перевод')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Открыть в книге →' }).getAttribute('href')).toBe('/documents/job-1?note=n-1&quote=q-1')
  })

  it('shows a summary as being about the whole book and hides the bar without a book', () => {
    const { unmount } = renderWithProviders(<NoteBookBar note={note({ documents: [
      { job_id: 'job-2', document_name: 'salt_and_iron.pdf', document_available: true, linked_at: '' },
    ] })} />)
    expect(screen.getByText('Конспект книги')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Открыть в книге →' }).getAttribute('href')).toBe('/documents/job-2?note=n-1')
    unmount()
    renderWithProviders(<NoteBookBar note={note({})} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('expands a quote, shows the other language and removes the quote from the note', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    api.deleteNoteQuote.mockResolvedValue(undefined)
    const current = note({ quotes: [quote({})] })
    renderWithProviders(<NoteQuoteCards note={current} onChanged={onChanged} />)

    const card = screen.getByRole('article', { name: 'Цитата из «Lighthouse keepers ledger»' })
    expect(within(card).getByRole('link', { name: 'В книге →' }).getAttribute('href')).toBe('/documents/job-1?note=n-1&quote=q-1')
    expect(within(card).queryByText(/On the night/)).toBeNull()
    await user.click(within(card).getByRole('button', { name: 'Показать оригинал' }))
    expect(within(card).getByText(/On the night/)).toBeTruthy()
    await user.click(within(card).getByRole('button', { name: 'Развернуть' }))
    expect(within(card).getByRole('button', { name: 'Свернуть' }).getAttribute('aria-expanded')).toBe('true')

    await user.click(within(card).getByRole('button', { name: 'Убрать из заметки' }))
    expect(api.deleteNoteQuote).toHaveBeenCalledWith('n-1', 'q-1', expect.objectContaining({ accessToken: 'jwt' }))
    expect(onChanged).toHaveBeenCalledWith({ ...current, quotes: [] })
  })
})
