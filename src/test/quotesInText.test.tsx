import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteQuoteResponse, NoteResponse } from '../api/contracts/notes.ts'
import { plainExcerpt } from '../notes/noteSyntax.ts'
import { NotesProvider } from '../notes/NotesProvider.tsx'
import { embeddedQuoteIds, quoteEmbed, splitQuoteEmbeds } from '../notes/quoteEmbeds.ts'
import { NotesPage } from '../pages/NotesPage.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import { installDialogPolyfill } from './dialogPolyfill.ts'

const api = vi.hoisted(() => ({
  listNotes: vi.fn(), getNote: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
  getNoteBacklinks: vi.fn(), getNoteGraph: vi.fn(), deleteNoteQuote: vi.fn(),
}))
vi.mock('../api/notes.ts', () => api)
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }) }))

const quote = (id: string, text: string, paragraph: number, paired: string | null = null): NoteQuoteResponse => ({
  id, job_id: 'job-1', document_name: 'lighthouse-keepers-ledger.docx', document_available: true, side: 'TRANSLATION',
  paragraph_index: paragraph, quote: text, paired_text: paired, source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', created_at: '2026-11-10T10:00:00Z',
})
const light = quote('q-1', 'Незадолго до полуночи он увидел свет.', 4, 'A little before midnight he saw a light.')
const gone = quote('q-2', 'Когда он поднял глаза, огонь исчез.', 5)
const body = [
  'Первая мысль.',
  '',
  '> Незадолго до полуночи он увидел свет.',
  '> — [¶5 · перевод](quote:q-1)',
  '',
  'Свет там, где его быть не могло.',
].join('\n')

describe('quotes inside the note text', () => {
  it('cuts the text into markdown and quotes that end with a source line', () => {
    expect(splitQuoteEmbeds(body)).toEqual([
      { kind: 'markdown', text: 'Первая мысль.\n' },
      { kind: 'quote', quoteId: 'q-1', label: '¶5 · перевод', text: 'Незадолго до полуночи он увидел свет.' },
      { kind: 'markdown', text: '\nСвет там, где его быть не могло.' },
    ])
    expect([...embeddedQuoteIds(body)]).toEqual(['q-1'])
  })

  it('leaves ordinary quotes and code alone', () => {
    const plain = '> Просто цитата\n> без источника'
    expect(splitQuoteEmbeds(plain)).toEqual([{ kind: 'markdown', text: plain }])
    const code = '```\n> строка\n> — [¶1 · перевод](quote:q-1)\n```'
    expect(splitQuoteEmbeds(code)).toEqual([{ kind: 'markdown', text: code }])
  })

  it('writes a quote block that stays readable as markdown', () => {
    expect(quoteEmbed({ id: 'q-7', quote: 'Первая строка\nвторая' }, '¶3 · оригинал'))
      .toBe('> Первая строка\n> вторая\n> — [¶3 · оригинал](quote:q-7)')
    // В списке заметок служебной строки источника не видно.
    expect(plainExcerpt(body)).toBe('Первая мысль. Незадолго до полуночи он увидел свет. Свет там, где его быть не могло.')
  })
})

function note(overrides: Partial<NoteResponse> = {}): NoteResponse {
  return {
    id: 'n-1', title: 'Конспект', body, version: 2, created_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-10T10:00:00Z',
    tags: [], links: [], quotes: [light, gone], ...overrides,
  }
}
function renderNote() {
  return render(
    <PreferencesProvider>
      <MemoryRouter initialEntries={['/notes/n-1']}>
        <NotesProvider>
          <Routes>
            <Route path="/notes/:noteId" element={<NotesPage />} />
          </Routes>
        </NotesProvider>
      </MemoryRouter>
    </PreferencesProvider>,
  )
}

let restoreDialog: () => void
beforeEach(() => {
  restoreDialog = installDialogPolyfill()
  for (const mock of Object.values(api)) mock.mockReset()
  api.listNotes.mockResolvedValue({ items: [], page: 0, size: 50, total_elements: 0, total_pages: 0 })
  api.getNote.mockResolvedValue(note())
  api.getNoteBacklinks.mockResolvedValue([])
  api.getNoteGraph.mockResolvedValue({ nodes: [], edges: [], truncated: false })
  api.updateNote.mockImplementation(async (_id: string, request: { body: string }) => note({ body: request.body, version: 3 }))
})
afterEach(() => {
  cleanup()
  restoreDialog()
})

describe('note page with quotes in the text', () => {
  it('shows a quote where it stands in the text, with its book and the way back to it', async () => {
    const user = userEvent.setup()
    renderNote()
    const inText = await screen.findByRole('figure', { name: 'Цитата из «Lighthouse keepers ledger»' })
    expect(inText.textContent).toContain('Незадолго до полуночи он увидел свет.')
    expect(inText.textContent).toContain('Lighthouse keepers ledger · ¶5 · перевод')
    expect(within(inText).getByRole('link', { name: 'В книге →' }).getAttribute('href')).toBe('/documents/job-1?note=n-1&quote=q-1')
    await user.click(within(inText).getByRole('button', { name: 'Показать оригинал' }))
    expect(inText.textContent).toContain('A little before midnight he saw a light.')
    // Чтение не переключается в правку от кнопки внутри цитаты.
    expect(screen.queryByRole('textbox', { name: 'Текст заметки' })).toBeNull()

    // Над текстом — только цитата, которой в тексте ещё нет.
    const cards = screen.getByRole('region', { name: 'Цитаты из книг' })
    expect(within(cards).getAllByRole('article')).toHaveLength(1)
    expect(cards.textContent).toContain('Когда он поднял глаза, огонь исчез.')
  })

  it('inserts a quote that is not in the text yet at the end of the note', async () => {
    const user = userEvent.setup()
    renderNote()
    const cards = await screen.findByRole('region', { name: 'Цитаты из книг' })
    await user.click(within(cards).getByRole('button', { name: 'Вставить в текст' }))

    expect(api.updateNote).toHaveBeenCalledWith('n-1', {
      title: 'Конспект',
      body: `${body}\n\n> Когда он поднял глаза, огонь исчез.\n> — [¶6 · перевод](quote:q-2)`,
      version: 2,
    }, expect.anything())
    await waitFor(() => expect(screen.getAllByRole('figure')).toHaveLength(2))
    expect(screen.queryByRole('region', { name: 'Цитаты из книг' })).toBeNull()
  })

  it('inserts a quote of the note at the cursor from the editor', async () => {
    const user = userEvent.setup()
    renderNote()
    await user.click(await screen.findByText('Первая мысль.'))
    const text = await screen.findByRole('textbox', { name: 'Текст заметки' }) as HTMLTextAreaElement
    text.setSelectionRange('Первая мысль.'.length, 'Первая мысль.'.length)

    await user.click(screen.getByRole('button', { name: 'Вставить цитату' }))
    const menu = screen.getByRole('menu', { name: 'Цитаты заметки' })
    // Цитата, которая уже стоит в тексте, помечена.
    expect(within(menu).getByRole('menuitem', { name: /Незадолго.*уже в тексте/ })).toBeTruthy()
    await user.click(within(menu).getByRole('menuitem', { name: /Когда он поднял глаза/ }))

    expect(text.value.startsWith('Первая мысль.\n\n> Когда он поднял глаза, огонь исчез.\n> — [¶6 · перевод](quote:q-2)\n\n> Незадолго')).toBe(true)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
