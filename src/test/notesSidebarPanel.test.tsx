import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesSidebarPanel } from '../components/sidebar/NotesSidebarPanel.tsx'
import { NotesProvider } from '../notes/NotesProvider.tsx'
import { TestQueryProvider } from './queryWrapper.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import { installDialogPolyfill } from './dialogPolyfill.ts'

const api = vi.hoisted(() => ({
  listNotes: vi.fn(), getNote: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
  getNoteBacklinks: vi.fn(), getNoteGraph: vi.fn(), addNoteQuote: vi.fn(), deleteNoteQuote: vi.fn(),
  linkNoteDocument: vi.fn(), unlinkNoteDocument: vi.fn(),
}))
vi.mock('../api/notes.ts', () => api)
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }) }))

const summary = (id: string, title: string) =>
  ({ id, title, excerpt: '', tags: [], quote_count: 0, version: 1, updated_at: '2026-11-14T10:00:00Z' })

function renderPanel(path: string) {
  const router = createMemoryRouter([{
    path: '*',
    element: (
      <PreferencesProvider>
        <TestQueryProvider><NotesProvider>
          <NotesSidebarPanel isActive />
        </NotesProvider></TestQueryProvider>
      </PreferencesProvider>
    ),
  }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

let restoreDialog: () => void
beforeEach(() => {
  restoreDialog = installDialogPolyfill()
  for (const mock of Object.values(api)) mock.mockReset()
  api.getNoteGraph.mockResolvedValue({ truncated: false, edges: [], nodes: [
    { id: 'note:n-1', type: 'note', label: 'Пам пам', ref: 'n-1', deleted: false },
    { id: 'note:n-2', type: 'note', label: 'Журнал маяка', ref: 'n-2', deleted: false },
  ] })
  api.listNotes.mockResolvedValue({ items: [summary('n-1', 'Пам пам'), summary('n-2', 'Журнал маяка')], page: 0, size: 100, total_elements: 2, total_pages: 1 })
})
afterEach(() => {
  cleanup()
  restoreDialog()
})

describe('deleting a note from the sidebar', () => {
  it('asks for confirmation, deletes the open note and returns to the list', async () => {
    const user = userEvent.setup()
    api.deleteNote.mockResolvedValue(undefined)
    const router = renderPanel('/notes/n-1')
    await user.click(await screen.findByRole('button', { name: 'Удалить заметку «Пам пам»' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Удалить заметку?' })
    expect(dialog.textContent).toContain('«Пам пам»')
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))
    expect(api.deleteNote).toHaveBeenCalledWith('n-1', expect.objectContaining({ accessToken: 'jwt' }))
    // Удалена открытая заметка: её страницы больше нет.
    expect(router.state.location.pathname).toBe('/notes')
  })

  it('keeps the note when the deletion is cancelled', async () => {
    const user = userEvent.setup()
    renderPanel('/notes/n-2')
    await user.click(await screen.findByRole('button', { name: 'Удалить заметку «Пам пам»' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Отмена' }))
    expect(api.deleteNote).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
