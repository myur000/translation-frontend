import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteGraphResponse, NoteSummary } from '../api/contracts/notes.ts'
import { translateCount } from '../i18n/translations.ts'
import { bookOfNote, noteDay } from '../notes/notesOverview.ts'
import { buildNotesTree } from '../notes/notesTree.ts'
import { NotesProvider } from '../notes/NotesProvider.tsx'
import { NotesPage } from '../pages/NotesPage.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'

const api = vi.hoisted(() => ({
  listNotes: vi.fn(), getNote: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
  getNoteBacklinks: vi.fn(), getNoteGraph: vi.fn(),
}))
vi.mock('../api/notes.ts', () => api)
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }) }))

const summary = (id: string, title: string, overrides: Partial<NoteSummary> = {}): NoteSummary => ({
  id, title, excerpt: '', tags: [], quote_count: 0, version: 1, updated_at: '2026-11-01T10:00:00Z', ...overrides,
})
const page = (items: NoteSummary[]) => ({ items, page: 0, size: 50, total_elements: items.length, total_pages: 1 })

/** Две книги: у маяка конспект и заметка с цитатой, вторая книга удалена. */
const graph: NoteGraphResponse = {
  nodes: [
    { id: 'note:n-1', type: 'note', label: 'Конспект', ref: 'n-1', deleted: false },
    { id: 'note:n-2', type: 'note', label: 'Ветер', ref: 'n-2', deleted: false },
    { id: 'note:n-3', type: 'note', label: 'Соль', ref: 'n-3', deleted: false },
    { id: 'note:n-4', type: 'note', label: 'Мысли', ref: 'n-4', deleted: false },
    { id: 'document:job-1', type: 'document', label: 'lighthouse-keepers-ledger.docx', ref: 'job-1', deleted: false },
    { id: 'document:job-2', type: 'document', label: 'salt_and_iron.pdf', ref: 'job-2', deleted: true },
    { id: 'tag:море', type: 'tag', label: '#море', ref: null, deleted: false },
  ],
  edges: [
    { source: 'note:n-1', target: 'document:job-1', type: 'about', weight: 1 },
    { source: 'note:n-2', target: 'document:job-1', type: 'quotes', weight: 1 },
    { source: 'note:n-3', target: 'document:job-2', type: 'quotes', weight: 1 },
    { source: 'note:n-2', target: 'tag:море', type: 'tagged', weight: 1 },
  ],
  truncated: false,
}

function renderHome(path = '/notes') {
  return render(
    <PreferencesProvider>
      <MemoryRouter initialEntries={[path]}>
        <NotesProvider>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:noteId" element={<NotesPage />} />
          </Routes>
        </NotesProvider>
      </MemoryRouter>
    </PreferencesProvider>,
  )
}

beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset()
  api.listNotes.mockResolvedValue(page([
    summary('n-2', 'Ветер', { excerpt: 'Северо-восточный', updated_at: new Date().toISOString() }),
    summary('n-1', 'Конспект'),
    summary('n-3', 'Соль'),
    summary('n-4', 'Мысли'),
  ]))
  api.getNoteGraph.mockResolvedValue(graph)
})
afterEach(() => cleanup())

describe('notes home: overview by books', () => {
  it('continues from recent notes and shows the book of each one', async () => {
    renderHome()
    const list = await screen.findByRole('list', { name: 'Продолжить' })
    const wind = within(list).getByRole('link', { name: /Ветер/ })
    expect(wind.getAttribute('href')).toBe('/notes/n-2')
    expect(await within(wind).findByText('Lighthouse keepers ledger')).toBeTruthy()
    expect(within(wind).getByText('сегодня')).toBeTruthy()
    // Заметка без книги — без подписи книги.
    expect(within(list).getByRole('link', { name: /Мысли/ }).textContent).not.toContain('Lighthouse')
  })

  it('lists books with notes, their summary and a way into the book', async () => {
    renderHome()
    // Книги и теги — из одного графа: отдельных запросов под теги или обзор нет.
    await screen.findByRole('article', { name: 'Lighthouse keepers ledger' })
    expect(api.getNoteGraph).toHaveBeenCalledTimes(1)
    expect(api.getNoteGraph).toHaveBeenCalledWith(['document', 'tag', 'missing'], expect.objectContaining({ accessToken: 'jwt' }))
    const lighthouse = await screen.findByRole('article', { name: 'Lighthouse keepers ledger' })
    expect(lighthouse.textContent).toContain('2 заметки · конспект')
    expect(within(lighthouse).getByRole('link', { name: 'Конспект книги «Lighthouse keepers ledger»' }).getAttribute('href')).toBe('/notes/n-1')
    expect(within(lighthouse).getByRole('link', { name: 'Открыть книгу «Lighthouse keepers ledger»' }).getAttribute('href')).toBe('/documents/job-1')

    // Удалённую книгу открыть нельзя, но её заметки на месте.
    const salt = screen.getByRole('article', { name: 'Salt and iron' })
    expect(salt.textContent).toContain('1 заметка')
    expect(salt.textContent).toContain('Книга удалена')
    expect(within(salt).queryByRole('link')).toBeNull()

    expect(screen.getByRole('link', { name: /#море\s*1/ }).getAttribute('href')).toBe(`/notes?tag=${encodeURIComponent('море')}`)
  })

  it('shows only the latest notes until the reader asks for all of them', async () => {
    const user = userEvent.setup()
    api.listNotes.mockResolvedValue(page(Array.from({ length: 7 }, (_, index) => summary(`m-${index}`, `Заметка ${index + 1}`))))
    renderHome()
    const list = await screen.findByRole('list', { name: 'Продолжить' })
    expect(within(list).getAllByRole('link')).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: 'Все заметки · 7' }))
    expect(within(screen.getByRole('list', { name: 'Все заметки' })).getAllByRole('link')).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Только последние' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('invites to start when there are no notes yet', async () => {
    api.listNotes.mockResolvedValue(page([]))
    renderHome()
    expect(await screen.findByRole('heading', { name: 'Заметок пока нет' })).toBeTruthy()
    expect(screen.getByText(/выделите фрагмент и нажмите «В заметку»/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Новая заметка' }).getAttribute('href')).toBe('/notes/new')
  })

  it('offers a retry when books cannot be loaded, the notes stay', async () => {
    const user = userEvent.setup()
    api.getNoteGraph.mockRejectedValue(new Error('offline'))
    renderHome()
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить книги с заметками.')
    expect(screen.getByRole('list', { name: 'Продолжить' })).toBeTruthy()

    api.getNoteGraph.mockResolvedValue(graph)
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('article', { name: 'Lighthouse keepers ledger' })).toBeTruthy()
  })
})

describe('notes overview helpers', () => {
  it('names the day of a change by calendar days, with the year only when it differs', () => {
    const now = new Date(2026, 10, 15, 0, 10)
    expect(noteDay(new Date(2026, 10, 15, 0, 5).toISOString(), now, 'ru-RU')).toEqual({ kind: 'today' })
    // 23:50 накануне — «вчера», хотя прошло двадцать минут.
    expect(noteDay(new Date(2026, 10, 14, 23, 50).toISOString(), now, 'ru-RU')).toEqual({ kind: 'yesterday' })
    expect(noteDay(new Date(2026, 10, 2, 12).toISOString(), now, 'ru-RU')).toEqual({ kind: 'date', text: '2 нояб.' })
    expect(noteDay(new Date(2025, 10, 2, 12).toISOString(), now, 'ru-RU')).toEqual({ kind: 'date', text: '2 нояб. 2025 г.' })
  })

  it('puts a count into the right word form', () => {
    expect([0, 1, 2, 5, 11, 21, 22].map((count) => translateCount('ru', 'notes.home.noteCount', count))).toEqual(
      ['0 заметок', '1 заметка', '2 заметки', '5 заметок', '11 заметок', '21 заметка', '22 заметки'])
    expect([1, 2].map((count) => translateCount('en', 'notes.home.noteCount', count))).toEqual(['1 note', '2 notes'])
  })

  it('maps a note to its book, a summary first', () => {
    const index = bookOfNote(buildNotesTree(graph))
    expect(index.get('n-1')?.jobId).toBe('job-1')
    expect(index.get('n-3')?.deleted).toBe(true)
    expect(index.has('n-4')).toBe(false)
  })
})
