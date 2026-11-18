import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '../api/client.ts'
import type { NoteResponse, NoteSummary } from '../api/contracts/notes.ts'
import { NotesProvider } from '../notes/NotesProvider.tsx'
import { TestQueryProvider } from './queryWrapper.tsx'
import { NotesPage } from '../pages/NotesPage.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import { installDialogPolyfill } from './dialogPolyfill.ts'

const api = vi.hoisted(() => ({
  listNotes: vi.fn(),
  getNote: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  getNoteBacklinks: vi.fn(),
  getNoteGraph: vi.fn(),
}))
vi.mock('../api/notes.ts', () => api)
vi.mock('../auth/useAuth.ts', () => ({
  useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }),
}))

function note(overrides: Partial<NoteResponse> = {}): NoteResponse {
  return {
    id: 'n-1', title: 'Сроки', body: 'Срок — **десять дней**. #договор', version: 1,
    created_at: '2026-11-09T10:00:00Z', updated_at: '2026-11-09T10:00:00Z',
    tags: ['договор'], links: [], quotes: [], ...overrides,
  }
}
function summary(value: NoteResponse): NoteSummary {
  return { id: value.id, title: value.title, excerpt: value.body, tags: value.tags, quote_count: 0, version: value.version, updated_at: value.updated_at }
}
function page(items: NoteSummary[]) {
  return { items, page: 0, size: 50, total_elements: items.length, total_pages: 1 }
}
function conflict(message: string) {
  return new ApiClientError(message, 409, { timestamp: '', status: 409, message, path: '', fieldErrors: {}, correlation_id: '' }, null, null)
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}
function renderNotes(path: string) {
  return render(
    <PreferencesProvider>
      <MemoryRouter initialEntries={[path]}>
        <TestQueryProvider><NotesProvider>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/new" element={<NotesPage isNew />} />
            <Route path="/notes/:noteId" element={<NotesPage />} />
          </Routes>
          <LocationProbe />
        </NotesProvider></TestQueryProvider>
      </MemoryRouter>
    </PreferencesProvider>,
  )
}
const location = () => screen.getByTestId('location').textContent

let restoreDialog: () => void
beforeEach(() => {
  restoreDialog = installDialogPolyfill()
  const stored = note()
  for (const mock of Object.values(api)) mock.mockReset()
  api.listNotes.mockResolvedValue(page([summary(stored)]))
  api.getNote.mockResolvedValue(stored)
  api.getNoteBacklinks.mockResolvedValue([])
  // Сервер возвращает сохранённую версию; тесты со сбоем сохранения задают свой ответ.
  api.updateNote.mockImplementation(async (_id: string, request: { title: string; body: string; version: number }) =>
    note({ title: request.title, body: request.body, version: request.version + 1 }))
  api.getNoteGraph.mockResolvedValue({ nodes: [{ id: 'tag:договор', type: 'tag', label: '#договор', ref: null, deleted: false }],
    edges: [{ source: 'note:n-1', target: 'tag:договор', type: 'tagged', weight: 1 }], truncated: false })
})
afterEach(() => {
  cleanup()
  restoreDialog()
})

describe('notes section', () => {
  it('lists recent notes with readable excerpts and filters by a tag kept in the address', async () => {
    const user = userEvent.setup()
    renderNotes('/notes')
    const list = await screen.findByRole('list', { name: 'Продолжить' })
    expect(within(list).getByRole('link', { name: /Сроки/ }).textContent).toContain('Срок — десять дней. #договор')

    await user.click(screen.getByRole('link', { name: /#договор\s*1/ }))
    expect(location()).toBe(`/notes?tag=${encodeURIComponent('договор')}`)
    await waitFor(() => expect(api.listNotes).toHaveBeenLastCalledWith(
      expect.objectContaining({ tag: 'договор', page: 0 }), expect.objectContaining({ accessToken: 'jwt' })))
    expect(screen.getByRole('heading', { name: /Тег #договор/ })).toBeTruthy()

    await user.click(screen.getByRole('link', { name: 'Сбросить фильтр' }))
    expect(location()).toBe('/notes')
    expect(await screen.findByRole('list', { name: 'Продолжить' })).toBeTruthy()
  })

  it('shows a search from the address as a filtered list', async () => {
    renderNotes(`/notes?q=${encodeURIComponent('срок')}`)
    expect(await screen.findByRole('heading', { name: /Поиск: «срок»/ })).toBeTruthy()
    expect(api.listNotes).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'срок' }), expect.anything())
    expect(within(await screen.findByRole('list', { name: /Поиск: «срок»/ })).getByRole('link', { name: /Сроки/ })).toBeTruthy()
  })

  it('creates a note and opens it', async () => {
    const user = userEvent.setup()
    const created = note({ id: 'n-2', title: 'Условия оплаты', body: 'Текст', tags: [] })
    api.createNote.mockResolvedValue(created)
    api.getNote.mockResolvedValue(created)
    renderNotes('/notes/new')
    await user.type(await screen.findByLabelText('Название'), 'Условия оплаты')
    await user.type(screen.getByLabelText('Текст заметки'), 'Текст')
    await user.click(screen.getByRole('button', { name: 'Создать заметку' }))
    expect(api.createNote).toHaveBeenCalledWith({ title: 'Условия оплаты', body: 'Текст' }, expect.objectContaining({ accessToken: 'jwt' }))
    expect(await screen.findByRole('heading', { name: 'Условия оплаты', level: 1 })).toBeTruthy()
    expect(location()).toBe('/notes/n-2')
  })

  it('rejects link syntax in the title before sending and explains an unverified email', async () => {
    const user = userEvent.setup()
    api.createNote.mockRejectedValue(new ApiClientError('Forbidden', 403, null, null, null))
    renderNotes('/notes/new')
    const title = await screen.findByLabelText('Название')
    await user.type(title, 'Сроки#1')
    expect(screen.getByText('В названии нельзя использовать [ ] | # ^ и переносы строк')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Создать заметку' }))
    expect(api.createNote).not.toHaveBeenCalled()

    await user.clear(title)
    await user.type(title, 'Сроки')
    await user.click(screen.getByRole('button', { name: 'Создать заметку' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Создавать и изменять заметки можно после подтверждения email.')
  })

  it('offers existing notes after [[ and inserts the chosen title', async () => {
    const user = userEvent.setup()
    renderNotes('/notes/new')
    const body = await screen.findByLabelText('Текст заметки')
    await user.type(body, 'См. [[[[Сро')
    const option = await screen.findByRole('option', { name: 'Сроки' })
    expect(api.listNotes).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'Сро', size: 8 }), expect.anything())
    expect(option.getAttribute('aria-selected')).toBe('true')
    await user.keyboard('{Enter}')
    expect((body as HTMLTextAreaElement).value).toBe('См. [[Сроки]]')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('detects a note changed in another window and saves over it only on request', async () => {
    const user = userEvent.setup()
    const newer = note({ version: 2, body: 'Чужая правка' })
    api.updateNote.mockRejectedValueOnce(conflict('Заметка изменилась в другом окне'))
      .mockResolvedValueOnce(note({ version: 3, body: 'Моя правка' }))
    renderNotes('/notes/n-1')
    await user.click(await screen.findByRole('button', { name: 'Редактировать' }))
    const body = screen.getByLabelText('Текст заметки')
    await user.clear(body)
    await user.type(body, 'Моя правка')
    api.getNote.mockResolvedValue(newer)
    // «Готово» сохраняет то, что не успело уйти автосохранением.
    await user.click(screen.getByRole('button', { name: 'Готово' }))
    expect(api.updateNote).toHaveBeenLastCalledWith('n-1', { title: 'Сроки', body: 'Моя правка', version: 1 }, expect.anything())
    expect((await screen.findByRole('alert')).textContent).toContain('Заметку изменили в другом окне')

    await user.click(screen.getByRole('button', { name: 'Сохранить мою' }))
    expect(api.updateNote).toHaveBeenLastCalledWith('n-1', { title: 'Сроки', body: 'Моя правка', version: 2 }, expect.anything())
    await user.click(screen.getByRole('button', { name: 'Готово' }))
    expect(await screen.findByText('Моя правка')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Текст заметки' })).toBeNull()
  })

  it('shows the server reason for a 409 that is not a version conflict', async () => {
    const user = userEvent.setup()
    api.updateNote.mockRejectedValue(conflict('Заметка с таким названием уже есть'))
    renderNotes('/notes/n-1')
    await user.click(await screen.findByRole('button', { name: 'Редактировать' }))
    await user.type(screen.getByLabelText('Текст заметки'), '!')
    await user.click(screen.getByRole('button', { name: 'Готово' }))
    // Версия на сервере та же — значит, причина в названии или лимите, а не в чужой правке.
    expect((await screen.findByRole('alert')).textContent).toBe('Заметка с таким названием уже есть')
    expect(screen.queryByText('Заметку изменили в другом окне')).toBeNull()
  })

  it('saves an edit by itself after a pause and shows it in the status', async () => {
    const user = userEvent.setup()
    api.updateNote.mockImplementation(async (_id: string, request: { title: string; body: string }) => note({ ...request, version: 2 }))
    renderNotes('/notes/n-1')
    await user.click(await screen.findByRole('button', { name: 'Редактировать' }))
    // Правка выглядит как чтение: ни вкладок, ни кнопки «Сохранить».
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull()
    await user.type(screen.getByLabelText('Текст заметки'), ' Дополнение')
    expect(screen.getByText('Изменено')).toBeTruthy()

    await waitFor(() => expect(api.updateNote).toHaveBeenCalledWith('n-1',
      { title: 'Сроки', body: 'Срок — **десять дней**. #договор Дополнение', version: 1 }, expect.anything()), { timeout: 2500 })
    expect(await screen.findByText('Сохранено')).toBeTruthy()
    // Уже сохранённое «Готово» не отправляет второй раз, а возвращает к чтению.
    await user.click(screen.getByRole('button', { name: 'Готово' }))
    expect(api.updateNote).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Текст заметки')).toBeNull()
  })

  it('formats the selection from the toolbar and previews the note', async () => {
    const user = userEvent.setup()
    renderNotes('/notes/n-1')
    await user.click(await screen.findByRole('button', { name: 'Редактировать' }))
    const body = screen.getByLabelText('Текст заметки') as HTMLTextAreaElement
    await user.clear(body)
    await user.type(body, 'важно')
    body.setSelectionRange(0, 5)
    await user.click(screen.getByRole('button', { name: 'Жирный — Ctrl/⌘ + B' }))
    expect(body.value).toBe('**важно**')
    // Выделение осталось на слове — ссылка оборачивает его же.
    await user.click(screen.getByRole('button', { name: 'Ссылка на заметку [[…]]' }))
    expect(body.value).toBe('**[[важно]]**')

    await user.click(screen.getByRole('button', { name: 'Просмотр' }))
    expect(screen.getByRole('button', { name: 'Просмотр' }).getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('strong')?.textContent).toBe('важно')
    expect(body.closest('[hidden]')).toBeTruthy()
  })

  it('keeps an unsaved edit when the reader opens another note and comes back', async () => {
    const user = userEvent.setup()
    const other = note({ id: 'n-2', title: 'Штрафы', body: 'Пени', tags: [] })
    api.listNotes.mockResolvedValue(page([summary(note()), summary(other)]))
    api.getNote.mockImplementation(async (id: string) => (id === 'n-2' ? other : note()))
    // Сохранение при уходе со страницы не дошло (нет сети): правка остаётся черновиком.
    api.updateNote.mockRejectedValue(new TypeError('Failed to fetch'))
    renderNotes('/notes/n-1')
    await user.click(await screen.findByRole('button', { name: 'Редактировать' }))
    await user.type(screen.getByLabelText('Текст заметки'), ' Дополнение')

    // Другая заметка открывается из списка раздела; правка первой не теряется.
    await user.click(screen.getByRole('link', { name: 'К списку заметок' }))
    await user.click(within(await screen.findByRole('list', { name: 'Продолжить' })).getByRole('link', { name: /Штрафы/ }))
    expect(await screen.findByRole('heading', { name: 'Штрафы', level: 1 })).toBeTruthy()
    await user.click(screen.getByRole('link', { name: 'К списку заметок' }))
    await user.click(within(await screen.findByRole('list', { name: 'Продолжить' })).getByRole('link', { name: /Сроки/ }))

    expect(await screen.findByText('Восстановлен несохранённый черновик.')).toBeTruthy()
    expect((screen.getByLabelText('Текст заметки') as HTMLTextAreaElement).value).toBe('Срок — **десять дней**. #договор Дополнение')
    await user.click(screen.getByRole('button', { name: 'Отбросить черновик' }))
    expect((screen.getByLabelText('Текст заметки') as HTMLTextAreaElement).value).toBe('Срок — **десять дней**. #договор')
  })

  it('opens the editor by clicking the note text', async () => {
    const user = userEvent.setup()
    renderNotes('/notes/n-1')
    await user.click(await screen.findByText(/десять дней/))
    expect(screen.getByLabelText('Текст заметки')).toBeTruthy()
  })

  it('deletes a note after confirmation and returns to the list', async () => {
    const user = userEvent.setup()
    api.deleteNote.mockResolvedValue(undefined)
    renderNotes('/notes/n-1?tag=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80')
    // Удаление — в меню «⋯» рядом с названием: на странице оно не спорит с текстом.
    await user.click(await screen.findByRole('button', { name: 'Действия с заметкой' }))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Удалить заметку?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    expect(api.deleteNote).toHaveBeenCalledWith('n-1', expect.anything())
    await waitFor(() => expect(location()).toBe('/notes?tag=%D0%B4%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80'))
  })

  it('renders links between notes and navigates inside the app', async () => {
    const user = userEvent.setup()
    const linked = note({ body: 'См. [[Штрафы]] и [[Условия|условия]].', links: [
      { title: 'Штрафы', note_id: null }, { title: 'Условия', note_id: 'n-3' },
    ] })
    api.getNote.mockResolvedValue(linked)
    api.getNoteBacklinks.mockResolvedValue([{ id: 'n-4', title: 'Договор' }])
    renderNotes('/notes/n-1')
    const article = (await screen.findByRole('heading', { name: 'Сроки', level: 1 })).closest('article')!
    expect(await screen.findByRole('link', { name: 'Договор' })).toBeTruthy()
    await user.click(within(article).getByRole('link', { name: 'Штрафы' }))
    expect(location()).toBe('/notes/new?title=%D0%A8%D1%82%D1%80%D0%B0%D1%84%D1%8B')
    expect(((await screen.findByLabelText('Название')) as HTMLInputElement).value).toBe('Штрафы')
  })
})
