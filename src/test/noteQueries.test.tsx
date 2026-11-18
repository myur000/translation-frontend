import { act, renderHook, waitFor } from '@testing-library/react'
import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteResponse } from '../api/contracts/notes.ts'
import { noteKeys, useNotesChanged } from '../notes/noteQueries.ts'
import { useBookNotes } from '../notes/useBookQuotes.ts'
import { useNote } from '../notes/useNote.ts'
import { useNotesList } from '../notes/useNotesList.ts'
import { QueryProvider } from '../query/QueryProvider.tsx'
import { createQueryClient } from '../query/queryClient.ts'

const api = vi.hoisted(() => ({ listNotes: vi.fn(), getNote: vi.fn(), getNoteBacklinks: vi.fn() }))
vi.mock('../api/notes.ts', () => api)
const text = vi.hoisted(() => ({ loadDocumentText: vi.fn() }))
vi.mock('../api/documentText.ts', () => text)
const auth = vi.hoisted(() => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } as { email: string; accessToken: string } | null }))
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: auth.session }) }))

const storm = (overrides: Partial<NoteResponse> = {}): NoteResponse => ({
  id: 'n-1', title: 'Шторм', body: 'Ветер.', version: 1, created_at: '', updated_at: '', tags: [], links: [],
  quotes: [{ id: 'q-1', job_id: 'job-1', document_name: 'book.docx', document_available: true, side: 'TRANSLATION',
    paragraph_index: 1, quote: 'Ветер дул', paired_text: null, source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', created_at: '' }],
  ...overrides,
})
const page = { items: [{ id: 'n-1', title: 'Шторм', excerpt: 'Ветер.', tags: [], quote_count: 1, version: 1, updated_at: '' }],
  page: 0, size: 100, total_elements: 1, total_pages: 1 }

let client: ReturnType<typeof createQueryClient>
const wrapper = ({ children }: { children: ReactNode }) => <QueryProvider client={client}>{children}</QueryProvider>

beforeEach(() => {
  client = createQueryClient({ retry: false })
  auth.session = { email: 'reader@example.com', accessToken: 'jwt' }
  for (const mock of [...Object.values(api), text.loadDocumentText]) mock.mockReset()
  api.listNotes.mockResolvedValue(page)
  api.getNote.mockImplementation(async () => storm())
  api.getNoteBacklinks.mockResolvedValue([])
  text.loadDocumentText.mockResolvedValue(null)
})
afterEach(() => client.clear())

describe('notes cache', () => {
  it('rereads the book after an edit but keeps the same quotes when nothing changed', async () => {
    const { result } = renderHook(() => ({ book: useBookNotes('job-1'), changed: useNotesChanged() }), { wrapper })
    await waitFor(() => expect(result.current.book.isLoaded).toBe(true))
    const quotes = result.current.book.quotes
    expect(quotes.map((quote) => quote.quote)).toEqual(['Ветер дул'])

    act(() => result.current.changed())
    await waitFor(() => expect(api.listNotes).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.book.isLoaded).toBe(true))
    // Тот же ответ — те же объекты: поля и метки не перестраиваются после каждой правки.
    expect(result.current.book.quotes).toBe(quotes)
  })

  it('rereads lists after an edit but leaves an open note to its editor', async () => {
    const { result } = renderHook(() => ({ list: useNotesList({ size: 20 }), note: useNote('n-1'), changed: useNotesChanged() }), { wrapper })
    await waitFor(() => expect(result.current.note.state.status).toBe('ready'))
    await waitFor(() => expect(result.current.list.status).toBe('ready'))

    act(() => result.current.changed())
    await waitFor(() => expect(api.listNotes).toHaveBeenCalledTimes(2))
    expect(api.getNote).toHaveBeenCalledTimes(1)
    // Помечена устаревшей: при следующем открытии перечитается.
    expect(client.getQueryState(noteKeys.note('reader@example.com', 'n-1'))?.isInvalidated).toBe(true)
  })

  it('shows a saved note everywhere it is open without rereading it', async () => {
    const first = renderHook(() => useNote('n-1'), { wrapper })
    const second = renderHook(() => useNote('n-1'), { wrapper })
    await waitFor(() => expect(second.result.current.state.status).toBe('ready'))

    act(() => first.result.current.applySaved(storm({ body: 'Ветер и дождь.', version: 2 })))
    await waitFor(() => {
      const state = second.result.current.state
      expect(state.status === 'ready' && state.note.body).toBe('Ветер и дождь.')
    })
    expect(api.getNote).toHaveBeenCalledTimes(1)
  })

  it('forgets everything when the account changes', async () => {
    const { result, rerender } = renderHook(() => ({ note: useNote('n-1'), client: useQueryClient() }), { wrapper })
    await waitFor(() => expect(result.current.note.state.status).toBe('ready'))
    expect(client.getQueryData(noteKeys.note('reader@example.com', 'n-1'))).toBeTruthy()

    auth.session = null
    rerender()
    expect(client.getQueryData(noteKeys.note('reader@example.com', 'n-1'))).toBeUndefined()
  })
})
