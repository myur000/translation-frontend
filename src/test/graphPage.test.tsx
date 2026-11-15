import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteGraphResponse, NoteResponse } from '../api/contracts/notes.ts'
import { GraphSidebarPanel } from '../components/sidebar/GraphSidebarPanel.tsx'
import { NotesProvider } from '../notes/NotesProvider.tsx'
import { GraphPage } from '../pages/GraphPage.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'

const api = vi.hoisted(() => ({
  listNotes: vi.fn(), getNote: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn(),
  getNoteBacklinks: vi.fn(), getNoteGraph: vi.fn(),
}))
vi.mock('../api/notes.ts', () => api)
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }) }))

const graph: NoteGraphResponse = {
  nodes: [
    { id: 'document:j1', type: 'document', label: 'lighthouse-keepers-ledger.docx', ref: 'j1', deleted: false },
    { id: 'note:s1', type: 'note', label: 'Конспект', ref: 's1', deleted: false },
    { id: 'note:n1', type: 'note', label: 'Шторм', ref: 'n1', deleted: false },
    { id: 'tag:сюжет', type: 'tag', label: '#сюжет', ref: null, deleted: false },
    { id: 'missing:огонь', type: 'missing', label: 'Огонь за рифом', ref: null, deleted: false },
  ],
  edges: [
    { source: 'note:s1', target: 'document:j1', type: 'about', weight: 1 },
    { source: 'note:n1', target: 'document:j1', type: 'quotes', weight: 2 },
    { source: 'note:n1', target: 'tag:сюжет', type: 'tagged', weight: 1 },
    { source: 'note:n1', target: 'missing:огонь', type: 'links', weight: 1 },
  ],
  truncated: false,
}
const storm: NoteResponse = {
  id: 'n1', title: 'Шторм', body: 'Ветер с **северо-востока**, 9 баллов.', version: 1, created_at: '', updated_at: '',
  tags: ['сюжет'], links: [], documents: [],
  quotes: [{ id: 'q1', job_id: 'j1', document_name: 'lighthouse-keepers-ledger.docx', document_available: true, side: 'TRANSLATION',
    paragraph_index: 4, quote: 'ветер дул', paired_text: null, source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', created_at: '' }],
}

function Location() {
  const location = useLocation()
  return <output aria-label="Адрес">{location.pathname}{decodeURIComponent(location.search)}</output>
}

function renderGraph(path = '/graph', withPanel = false) {
  return render(
    <PreferencesProvider>
      <MemoryRouter initialEntries={[path]}>
        <NotesProvider>
          {withPanel ? <GraphSidebarPanel isActive /> : null}
          <Routes>
            <Route path="/graph" element={<GraphPage />} />
            <Route path="*" element={null} />
          </Routes>
          <Location />
        </NotesProvider>
      </MemoryRouter>
    </PreferencesProvider>,
  )
}
const address = () => screen.getByRole('status', { name: 'Адрес' }).textContent

beforeEach(() => {
  window.localStorage.clear()
  for (const mock of Object.values(api)) mock.mockReset()
  api.getNoteGraph.mockResolvedValue(graph)
  api.getNote.mockResolvedValue(storm)
  api.listNotes.mockResolvedValue({ items: [], page: 0, size: 50, total_elements: 0, total_pages: 0 })
  // jsdom не рисует canvas: холст молчит, проверяем всё, что вокруг него.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('graph section', () => {
  it('shows the map with counts and a keyboard list of nodes, and opens a card for the chosen note', async () => {
    const user = userEvent.setup()
    renderGraph()
    expect(await screen.findByRole('img', { name: 'Граф заметок: заметок 2, книг 1' })).toBeTruthy()
    expect(screen.getByText('Заметок: 2 · книг: 1')).toBeTruthy()

    const list = screen.getByRole('list', { name: 'Узлы графа' })
    await user.click(within(list).getByRole('button', { name: 'Заметка: Шторм' }))
    expect(address()).toBe('/graph?node=note:n1')

    const card = screen.getByRole('complementary', { name: 'Узел «Шторм»' })
    expect(await within(card).findByText('Ветер с северо-востока, 9 баллов.')).toBeTruthy()
    expect(card.textContent).toContain('2 цитаты из книги')
    expect(within(card).getByRole('link', { name: 'Открыть заметку' }).getAttribute('href')).toBe('/notes/n1')
    expect(within(card).getByRole('link', { name: 'В книге →' }).getAttribute('href')).toBe('/documents/j1?note=n1&quote=q1')
    // Связи по смыслу; по ним можно ходить по графу.
    const related = within(card).getByRole('region', { name: 'Связи · 3' })
    expect(within(related).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['Цитирует', 'Ссылается на', 'Теги'])
    expect(within(related).getByRole('button', { name: 'Огонь за рифом' })).toBeTruthy()
    await user.click(within(related).getByRole('button', { name: 'Lighthouse keepers ledger 2 цитаты' }))
    expect(address()).toBe('/graph?node=document:j1')
  })

  it('leads from a book into it and to its summary, and from a missing note to creating it', async () => {
    renderGraph('/graph?node=document:j1')
    const book = await screen.findByRole('complementary', { name: 'Узел «Lighthouse keepers ledger»' })
    expect(book.textContent).toContain('1 заметка · 1 конспект')
    expect(within(book).getByRole('link', { name: 'Открыть книгу →' }).getAttribute('href')).toBe('/documents/j1')
    expect(within(book).getByRole('link', { name: 'Конспект книги' }).getAttribute('href')).toBe('/documents/j1?summary=open')
    cleanup()

    renderGraph('/graph?node=missing:огонь')
    const missing = await screen.findByRole('complementary', { name: 'Узел «Огонь за рифом»' })
    expect(within(missing).getByRole('link', { name: 'Создать заметку' }).getAttribute('href'))
      .toBe(`/notes/new?${new URLSearchParams({ title: 'Огонь за рифом' })}`)
  })

  it('hides kinds by filters in the address and invites to start when there are no notes', async () => {
    renderGraph('/graph?hide=tag,missing')
    const list = await screen.findByRole('list', { name: 'Узлы графа' })
    expect(within(list).queryByRole('button', { name: /^Тег:/ })).toBeNull()
    expect(within(list).getByRole('button', { name: 'Конспект: Конспект' })).toBeTruthy()
    cleanup()

    api.getNoteGraph.mockResolvedValue({ nodes: [], edges: [], truncated: false })
    renderGraph()
    expect(await screen.findByRole('heading', { name: 'Граф пока пустой' })).toBeTruthy()
  })

  it('keeps notes without links in a row under the map and explains a small graph once', async () => {
    const user = userEvent.setup()
    api.getNoteGraph.mockResolvedValue({
      ...graph,
      nodes: [...graph.nodes, { id: 'note:n2', type: 'note', label: 'Идеи для эссе', ref: 'n2', deleted: false }],
    })
    renderGraph()
    const lonely = await screen.findByRole('group', { name: 'Без связей · 1' })
    await user.click(within(lonely).getByRole('button', { name: 'Идеи для эссе' }))
    expect(address()).toBe('/graph?node=note:n2')
    expect(within(lonely).getByRole('button', { name: 'Идеи для эссе' }).getAttribute('aria-pressed')).toBe('true')

    const hint = screen.getByRole('region', { name: 'Граф пока небольшой' })
    await user.click(within(hint).getByRole('button', { name: 'Понятно' }))
    expect(screen.queryByRole('region', { name: 'Граф пока небольшой' })).toBeNull()
    cleanup()
    renderGraph()
    await screen.findByRole('group', { name: 'Без связей · 1' })
    expect(screen.queryByRole('region', { name: 'Граф пока небольшой' })).toBeNull()
  })

  it('walks the map with arrows and opens the chosen node with Enter', async () => {
    const user = userEvent.setup()
    renderGraph()
    const map = await screen.findByRole('img', { name: /Граф заметок/ })
    expect(screen.getByRole('group', { name: 'Масштаб' })).toBeTruthy()
    map.focus()
    // Без выбора стрелка начинает с самого связанного узла.
    await user.keyboard('{ArrowRight}')
    expect(address()).toBe('/graph?node=note:n1')
    await user.keyboard('{Enter}')
    expect(address()).toBe('/notes/n1')
  })

  it('offers a retry when the graph cannot be loaded', async () => {
    const user = userEvent.setup()
    api.getNoteGraph.mockRejectedValueOnce(new Error('offline'))
    renderGraph()
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить граф заметок.')
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('img', { name: /Граф заметок/ })).toBeTruthy()
  })
})

describe('graph panel next to the rail', () => {
  it('switches the colouring through the address and explains the lines', async () => {
    const user = userEvent.setup()
    renderGraph('/graph', true)
    const coloring = await screen.findByRole('group', { name: 'Раскраска' })
    expect(within(coloring).getByRole('button', { name: 'Нет' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(coloring).getByRole('button', { name: 'По тегам' }))
    expect(address()).toBe('/graph?color=tag')
    expect(within(screen.getByRole('list', { name: 'Цвета тегов' })).getByText('#сюжет')).toBeTruthy()
    await user.click(within(coloring).getByRole('button', { name: 'По книгам' }))
    expect(address()).toBe('/graph?color=book')
    expect(screen.getByText('Заметка — цвета обложки книги, из которой она цитирует.')).toBeTruthy()

    const legend = screen.getByRole('region', { name: 'Связи' })
    const lines = () => within(legend).getAllByRole('listitem').map((item) => item.textContent)
    expect(lines()).toEqual(['Цитата из книги', 'Ссылка [[…]]', 'Конспект книги', 'Тег', 'Заметка, которой ещё нет'])
    // Спрятанные теги не объясняем.
    await user.click(screen.getByRole('checkbox', { name: 'Теги' }))
    expect(lines()).not.toContain('Тег')
  })

  it('drives the map through the address: filters, search and books', async () => {
    const user = userEvent.setup()
    renderGraph('/graph', true)
    await user.click(await screen.findByRole('checkbox', { name: 'Теги' }))
    expect(address()).toBe('/graph?hide=tag')
    await user.click(screen.getByRole('checkbox', { name: 'Заметки без связей' }))
    expect(address()).toBe('/graph?hide=tag,lonely')
    await user.click(screen.getByRole('checkbox', { name: 'Теги' }))
    expect(address()).toBe('/graph?hide=lonely')

    await user.type(screen.getByRole('searchbox', { name: 'Найти на графе' }), 'шторм')
    expect(address()).toBe('/graph?hide=lonely&q=шторм')
    expect(screen.getByText(/найдено: 1/)).toBeTruthy()
    // Enter — выбрать первое совпадение.
    await user.keyboard('{Enter}')
    expect(address()).toBe('/graph?hide=lonely&node=note:n1&q=шторм')

    await user.click(within(screen.getByRole('region', { name: 'Книги' })).getByRole('button', { name: 'Lighthouse keepers ledger' }))
    expect(address()).toContain('node=document:j1')
  })
})
