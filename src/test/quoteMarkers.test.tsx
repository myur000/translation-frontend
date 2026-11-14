import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteResponse } from '../api/contracts/notes.ts'
import { QuoteMarkers } from '../components/workspace/QuoteMarkers.tsx'
import { loadBookNotes, loadBookQuotes, type BookQuote } from '../notes/bookQuotes.ts'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'

const api = vi.hoisted(() => ({ listNotes: vi.fn(), getNote: vi.fn() }))
vi.mock('../api/notes.ts', () => api)

const noteOf = (id: string, title: string): NoteResponse => ({
  id, title, body: '', version: 1, created_at: '', updated_at: '', tags: [], links: [], quotes: [],
})
const quote = (overrides: Partial<BookQuote>): BookQuote => ({
  id: 'q-1', noteId: 'n-1', noteTitle: 'Шторм', side: 'TRANSLATION', paragraphIndex: 1,
  quote: 'Ветер дул с северо-востока', pairedText: 'The wind came from the north-east.',
  note: noteOf(overrides.noteId ?? 'n-1', overrides.noteTitle ?? 'Шторм'), ...overrides,
})

/** Колонка книги в DOCX-виде: страница-article и абзацы без номеров, как после mammoth. */
function Column({ column, quotes, onOpen }: { column: 'SOURCE' | 'TRANSLATION'; quotes: BookQuote[]; onOpen: (ids: string[]) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <PreferencesProvider>
      <div ref={ref} role="region" aria-label="Колонка">
        <article>
          {column === 'TRANSLATION' ? (
            <><p>Глава первая</p><p>Ветер дул с северо-востока, что для октября было необычно.</p></>
          ) : (
            <><p>Chapter One</p><p>The wind came from the north-east.</p></>
          )}
        </article>
      </div>
      <QuoteMarkers viewportRef={ref} column={column} quotes={quotes} layoutKey="compare" onOpen={onOpen} />
    </PreferencesProvider>
  )
}

afterEach(() => cleanup())

describe('margin markers', () => {
  it('marks a quoted paragraph once per paragraph and opens its notes', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<Column column="TRANSLATION" onOpen={onOpen} quotes={[
      quote({}),
      quote({ id: 'q-2', noteId: 'n-2', noteTitle: 'Погода', quote: 'для октября было необычно' }),
      // Вторая цитата той же заметки у того же абзаца не добавляет метку.
      quote({ id: 'q-3', quote: 'необычно' }),
      quote({ id: 'q-4', noteId: 'n-9', noteTitle: 'Нет в книге', quote: 'Этого текста нет' , pairedText: null }),
    ]} />)

    const marker = await screen.findByRole('button', { name: 'Заметки к этому абзацу (2): Шторм, Погода' })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(marker.textContent).toBe('2')
    await user.click(marker)
    expect(onOpen).toHaveBeenCalledWith(['n-1', 'n-2'])
  })

  it('finds a quote from the other column by its paired paragraph', async () => {
    render(<Column column="SOURCE" onOpen={vi.fn()} quotes={[quote({})]} />)
    // Цитата сделана в переводе, но читатель смотрит оригинал: метка у парного абзаца.
    const marker = await screen.findByRole('button', { name: 'Заметки к этому абзацу (1): Шторм' })
    // Число на метке есть и у единственной заметки: метка читается одинаково.
    expect(marker.textContent).toBe('1')
  })

  it('draws nothing without quotes', async () => {
    render(<Column column="TRANSLATION" onOpen={vi.fn()} quotes={[]} />)
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('book quotes', () => {
  const note = (id: string, quotes: NoteResponse['quotes']): NoteResponse => ({
    id, title: `Заметка ${id}`, body: '', version: 1, created_at: '', updated_at: '', tags: [], links: [], quotes,
  })
  const apiQuote = (jobId: string) => ({
    id: `q-${jobId}`, job_id: jobId, document_name: 'ledger.docx', document_available: true, side: 'SOURCE' as const,
    paragraph_index: 3, quote: 'wind', paired_text: 'ветер', source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', created_at: '',
  })

  beforeEach(() => {
    api.listNotes.mockReset()
    api.getNote.mockReset()
  })

  it('reads only notes with quotes and keeps quotes of this book', async () => {
    api.listNotes.mockResolvedValue({ items: [
      { id: 'n-1', title: '', excerpt: '', tags: [], quote_count: 2, version: 1, updated_at: '' },
      { id: 'n-2', title: '', excerpt: '', tags: [], quote_count: 0, version: 1, updated_at: '' },
    ], page: 0, size: 100, total_elements: 2, total_pages: 1 })
    api.getNote.mockResolvedValue(note('n-1', [apiQuote('job-1'), apiQuote('job-other')]))

    const quotes = await loadBookQuotes('job-1', { accessToken: 'jwt' })

    expect(api.listNotes).toHaveBeenCalledWith({ job_id: 'job-1', size: 100 }, { accessToken: 'jwt' })
    expect(api.getNote).toHaveBeenCalledTimes(1)
    expect(quotes).toEqual([{ id: 'q-job-1', noteId: 'n-1', noteTitle: 'Заметка n-1', side: 'SOURCE',
      paragraphIndex: 3, quote: 'wind', pairedText: 'ветер', note: expect.objectContaining({ id: 'n-1' }) }])
  })

  it('reads the summaries of the book: notes linked to it without a quote', async () => {
    api.listNotes.mockResolvedValue({ items: [
      { id: 'n-1', title: '', excerpt: '', tags: [], quote_count: 0, linked_job_ids: ['job-1'], version: 1, updated_at: '' },
      { id: 'n-2', title: '', excerpt: '', tags: [], quote_count: 0, linked_job_ids: ['job-other'], version: 1, updated_at: '' },
    ], page: 0, size: 100, total_elements: 2, total_pages: 1 })
    api.getNote.mockResolvedValue({ ...note('n-1', []), title: 'Конспект', documents: [
      { job_id: 'job-1', document_name: 'ledger.docx', document_available: true, linked_at: '' },
    ] })

    const notes = await loadBookNotes('job-1', { accessToken: 'jwt' })
    // Заметка о другой книге не читается: ей нечего показать здесь.
    expect(api.getNote).toHaveBeenCalledTimes(1)
    expect(notes.quotes).toEqual([])
    expect(notes.aboutBook.map((item) => item.title)).toEqual(['Конспект'])
  })

  it('fails as a whole so the caller can show the book without markers', async () => {
    api.listNotes.mockRejectedValue(new Error('offline'))
    await expect(loadBookQuotes('job-1', { accessToken: 'jwt' })).rejects.toThrow('offline')
    await waitFor(() => expect(api.getNote).not.toHaveBeenCalled())
  })
})
