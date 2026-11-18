import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '../api/client.ts'
import type { NoteResponse } from '../api/contracts/notes.ts'
import { NoteAside } from '../components/notes/NoteAside.tsx'
import { NotesProvider } from '../notes/NotesProvider.tsx'
import { TestQueryProvider } from './queryWrapper.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import type { DocumentItem } from '../types/document.ts'

const api = vi.hoisted(() => ({
  listNotes: vi.fn(), getNote: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
  getNoteBacklinks: vi.fn(), getNoteGraph: vi.fn(), addNoteQuote: vi.fn(), deleteNoteQuote: vi.fn(),
  linkNoteDocument: vi.fn(), unlinkNoteDocument: vi.fn(),
}))
vi.mock('../api/notes.ts', () => api)
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }) }))

const book = (jobId: string, name: string): DocumentItem => ({ id: jobId, jobId, name, status: 'ready', pages: 3,
  sourceLanguage: 'eng_Latn', targetLanguage: 'rus_Cyrl' })
const note: NoteResponse = {
  id: 'n-1', title: 'Конспект', body: '', version: 1, created_at: '2026-11-14T10:00:00Z', updated_at: '2026-11-14T10:00:00Z',
  tags: [], links: [], quotes: [],
  documents: [{ job_id: 'job-1', document_name: 'lighthouse-keepers-ledger.docx', document_available: true, linked_at: '' }],
}

/** Страница заметки внутри раздела приложения: список книг приходит из контекста макета. */
function Page({ onChanged }: { onChanged: (note: NoteResponse) => void }) {
  const documents = [book('job-1', 'lighthouse-keepers-ledger.docx'), book('job-2', 'salt_and_iron.pdf')]
  return (
    <PreferencesProvider>
      <MemoryRouter>
        <TestQueryProvider><NotesProvider>
          <Routes>
            <Route element={<Outlet context={{ documents }} />}>
              <Route index element={<NoteAside note={note} backlinks={[]} search="" onChanged={onChanged} />} />
            </Route>
          </Routes>
        </NotesProvider></TestQueryProvider>
      </MemoryRouter>
    </PreferencesProvider>
  )
}

beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset()
  api.listNotes.mockResolvedValue({ items: [], page: 0, size: 50, total_elements: 0, total_pages: 0 })
})
afterEach(() => cleanup())

describe('books a note is about', () => {
  it('lists the linked book and links another one', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    const linked = { ...note, documents: [...note.documents!, { job_id: 'job-2', document_name: 'salt_and_iron.pdf', document_available: true, linked_at: '' }] }
    api.linkNoteDocument.mockResolvedValue(linked)
    render(<Page onChanged={onChanged} />)

    const section = screen.getByRole('region', { name: 'Книги' })
    // Ссылка ведёт в книгу и сразу открывает там эту заметку.
    expect(within(section).getByRole('link', { name: 'Lighthouse keepers ledger' }).getAttribute('href')).toBe('/documents/job-1?note=n-1')
    expect(section.textContent).toContain('Конспект книги')
    // Уже привязанной книги среди вариантов нет.
    // Привязка к книге целиком делает заметку конспектом — так и названо, чтобы последствие было понятно.
    const select = within(section).getByRole('combobox', { name: 'Сделать конспектом книги' })
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Сделать конспектом книги…', 'Salt and iron'])

    await user.selectOptions(select, 'job-2')
    await user.click(within(section).getByRole('button', { name: 'Сделать' }))
    expect(api.linkNoteDocument).toHaveBeenCalledWith('n-1', 'job-2', expect.objectContaining({ accessToken: 'jwt' }))
    expect(onChanged).toHaveBeenCalledWith(linked)
  })

  it('unlinks a book', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    api.unlinkNoteDocument.mockResolvedValue(undefined)
    render(<Page onChanged={onChanged} />)

    await user.click(screen.getByRole('button', { name: 'Больше не конспект «Lighthouse keepers ledger»' }))
    expect(api.unlinkNoteDocument).toHaveBeenCalledWith('n-1', 'job-1', expect.objectContaining({ accessToken: 'jwt' }))
    expect(onChanged).toHaveBeenCalledWith({ ...note, documents: [] })
  })

  it('explains that the book is gone instead of «note not found»', async () => {
    const user = userEvent.setup()
    api.linkNoteDocument.mockRejectedValue(new ApiClientError('Not found', 404,
      { status: 404, code: 'DOCUMENT_NOT_FOUND', message: 'Документ не найден' } as never, null, null))
    render(<Page onChanged={vi.fn()} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Сделать конспектом книги' }), 'job-2')
    await user.click(screen.getByRole('button', { name: 'Сделать' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Книга удалена или недоступна. Обновите страницу.')
  })
})
