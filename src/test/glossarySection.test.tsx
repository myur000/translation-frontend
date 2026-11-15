import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TermListItem, TermResponse } from '../api/contracts/terms.ts'
import { GlossarySidebarPanel } from '../components/sidebar/GlossarySidebarPanel.tsx'
import {
  currentPair,
  documentPair,
  glossaryPairs,
  glossarySearch,
  matchesGlossaryQuery,
  readGlossaryQuery,
  sortTerms,
} from '../glossary/glossaryQuery.ts'
import { resetGlossaryStore } from '../glossary/glossaryStore.ts'
import { snippet, termOccurrences } from '../glossary/termOccurrences.ts'
import { GlossaryPage } from '../pages/GlossaryPage.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import type { DocumentItem } from '../types/document.ts'

const api = vi.hoisted(() => ({
  getTerms: vi.fn(), getTerm: vi.fn(), createTerm: vi.fn(), updateTerm: vi.fn(), deleteTerm: vi.fn(),
  linkTermDocument: vi.fn(), unlinkTermDocument: vi.fn(),
}))
const text = vi.hoisted(() => ({ loadDocumentText: vi.fn() }))
vi.mock('../api/terms.ts', () => api)
vi.mock('../api/documentText.ts', () => text)
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }) }))

const item = (id: string, term: string, translation: string, extra: Partial<TermListItem> = {}): TermListItem => ({
  id, term, translation, source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', document_count: 1, updated_at: '2026-11-10T10:00:00Z', ...extra,
})
const terms = [
  item('t1', 'reef', 'риф', { document_count: 2, updated_at: '2026-11-12T10:00:00Z' }),
  item('t2', 'ledger', 'журнал', { updated_at: '2026-11-14T10:00:00Z' }),
  item('t3', 'Gull Point', 'мыс Чаек', { document_count: 0 }),
  item('t4', 'Licht', 'свет', { source_lang: 'deu_Latn' }),
]
const book = { id: 'd1', jobId: 'j1', name: 'lighthouse-keepers-ledger.docx', sourceLanguage: 'eng_Latn', targetLanguage: 'rus_Cyrl', pages: 3, status: 'ready' } as DocumentItem
const full = (value: TermListItem, documents = [{ job_id: 'j1', document_name: book.name, document_available: true, linked_at: '' }]): TermResponse => ({
  id: value.id, term: value.term, translation: value.translation, source_lang: value.source_lang, target_lang: value.target_lang,
  created_at: '', updated_at: value.updated_at, documents,
})

function Location() {
  const location = useLocation()
  return <output aria-label="Адрес">{location.pathname}{decodeURIComponent(location.search)}</output>
}

function renderGlossary(path = '/glossary', withPanel = false) {
  return render(
    <PreferencesProvider>
      <MemoryRouter initialEntries={[path]}>
        {withPanel ? <GlossarySidebarPanel isActive documents={[book]} /> : null}
        <Routes>
          <Route element={<Outlet context={{ documents: [book] }} />}>
            <Route path="/glossary" element={<GlossaryPage />} />
          </Route>
          <Route path="*" element={null} />
        </Routes>
        <Location />
      </MemoryRouter>
    </PreferencesProvider>,
  )
}
const address = () => screen.getByRole('status', { name: 'Адрес' }).textContent
// Кнопка термина в строке — единственная с aria-pressed.
const rowTerms = () => within(screen.getByRole('list', { name: 'Термины' })).getAllByRole('button')
  .filter((button) => button.hasAttribute('aria-pressed')).map((button) => button.textContent)

beforeEach(() => {
  resetGlossaryStore()
  for (const mock of [...Object.values(api), ...Object.values(text)]) mock.mockReset()
  api.getTerms.mockImplementation(async (query: { job_id?: string }) => ({
    items: query.job_id ? terms.filter((value) => value.id === 't1') : terms, page: 0, size: 100, total_elements: 4, total_pages: 1,
  }))
})
afterEach(() => cleanup())

describe('glossary rules', () => {
  it('sorts by term, translation, newest and number of books', () => {
    const pair = terms.slice(0, 3)
    expect(sortTerms(pair, 'term').map((value) => value.term)).toEqual(['Gull Point', 'ledger', 'reef'])
    expect(sortTerms(pair, 'translation').map((value) => value.translation)).toEqual(['журнал', 'мыс Чаек', 'риф'])
    expect(sortTerms(pair, 'recent').map((value) => value.term)).toEqual(['ledger', 'reef', 'Gull Point'])
    expect(sortTerms(pair, 'books').map((value) => value.term)).toEqual(['reef', 'ledger', 'Gull Point'])
  })

  it('searches both sides, groups pairs and keeps the state in the address', () => {
    expect(matchesGlossaryQuery(item('x', 'Gull Point', 'мыс Чаёк'), 'чаек')).toBe(true)
    expect(matchesGlossaryQuery(item('x', 'reef', 'риф'), 'REE')).toBe(true)
    expect(glossaryPairs(terms).map((pair) => [pair.key, pair.count])).toEqual([['eng_Latn>rus_Cyrl', 3], ['deu_Latn>rus_Cyrl', 1]])
    expect(currentPair(null, glossaryPairs(terms), null)).toBe('eng_Latn>rus_Cyrl')
    expect(currentPair(null, [], documentPair(book))).toBe('eng_Latn>rus_Cyrl')
    const query = { pair: 'deu_Latn>rus_Cyrl', book: 'j1', q: ' licht ', sort: 'books' as const, term: 't4' }
    expect(readGlossaryQuery(glossarySearch(query))).toEqual({ ...query, q: 'licht' })
    expect(readGlossaryQuery('?sort=bogus').sort).toBe('term')
  })

  it('finds the paragraphs with a term and whether its translation is there', () => {
    const found = termOccurrences(item('t1', 'reef', 'риф'), [
      { index: 4, source: 'Nothing here.', translation: 'Ничего.' },
      { index: 5, source: 'far out beyond the reef, moving', translation: 'далеко за рифом' },
      { index: 6, source: 'beyond the outer reefs.', translation: 'за внешними скалами.' },
    ])
    expect(found.map((value) => [value.paragraphIndex, value.inSource.length, value.inTranslation.length])).toEqual([[5, 1, 1], [6, 1, 0]])
    expect(snippet('a'.repeat(100) + ' reef ' + 'b'.repeat(100), [[101, 105]], 10))
      .toEqual([{ text: '…aaaaaaaaa ', isMatch: false }, { text: 'reef', isMatch: true }, { text: ' bbbbbbbbb…', isMatch: false }])
  })
})

describe('glossary section', () => {
  it('lists the pair’s terms A–Z and re-sorts by a column header', async () => {
    const user = userEvent.setup()
    renderGlossary()
    await screen.findByRole('list', { name: 'Термины' })
    expect(screen.getByText(/3 термина · /)).toBeTruthy()
    expect(rowTerms()).toEqual(['Gull Point', 'ledger', 'reef'])

    const header = screen.getByRole('group', { name: 'Сортировка по колонкам' })
    await user.click(within(header).getByRole('button', { name: 'Перевод' }))
    expect(address()).toBe('/glossary?sort=translation')
    expect(rowTerms()).toEqual(['ledger', 'Gull Point', 'reef'])
    await user.click(within(header).getByRole('button', { name: 'Книги' }))
    expect(rowTerms()).toEqual(['reef', 'ledger', 'Gull Point'])
  })

  it('drives sorting, pair and book from the panel', async () => {
    const user = userEvent.setup()
    renderGlossary('/glossary', true)
    const panelSort = await screen.findByRole('group', { name: 'Сортировка' })
    await screen.findByRole('list', { name: 'Термины' })
    await user.click(within(panelSort).getByRole('button', { name: 'Новые' }))
    expect(address()).toBe('/glossary?sort=recent')
    expect(rowTerms()).toEqual(['ledger', 'reef', 'Gull Point'])

    await user.click(screen.getByRole('button', { name: 'Lighthouse keepers ledger' }))
    expect(address()).toBe('/glossary?book=j1&sort=recent')
    await waitFor(() => expect(rowTerms()).toEqual(['reef']))
    expect(api.getTerms).toHaveBeenCalledWith({ job_id: 'j1', page: 0, size: 100 }, expect.anything())

    await user.click(within(screen.getByRole('group', { name: 'Языки' })).getByRole('button', { name: /DE → RU/ }))
    expect(address()).toBe('/glossary?pair=deu_Latn>rus_Cyrl&sort=recent')
    expect(rowTerms()).toEqual(['Licht'])
  })

  it('adds a term to the pair and points at an existing one instead of a duplicate', async () => {
    const user = userEvent.setup()
    const created = full(item('t9', 'great lens', 'большая линза'), [])
    api.createTerm.mockResolvedValue(created)
    api.getTerm.mockResolvedValue(created)
    renderGlossary()
    const form = await screen.findByRole('form', { name: 'Новый термин' })
    await user.type(within(form).getByLabelText('Новый термин'), 'great lens{Enter}')
    // Enter в пустом переводе только переводит курсор.
    expect(api.createTerm).not.toHaveBeenCalled()
    await user.type(within(form).getByLabelText('Перевод нового термина'), 'большая линза{Enter}')
    expect(api.createTerm).toHaveBeenCalledWith(
      { term: 'great lens', translation: 'большая линза', source_lang: 'eng_Latn', target_lang: 'rus_Cyrl' }, { accessToken: 'jwt' })
    await waitFor(() => expect(rowTerms()).toContain('great lens'))
    expect(address()).toBe('/glossary?term=t9')

    await user.type(within(form).getByLabelText('Новый термин'), 'Reef')
    await user.type(within(form).getByLabelText('Перевод нового термина'), 'отмель{Enter}')
    expect(within(form).getByRole('alert').textContent).toBe('Уже есть: reef → риф.')
    expect(address()).toBe('/glossary?term=t1')
    expect(api.createTerm).toHaveBeenCalledOnce()
  })

  it('edits a term in place and cancels with Escape', async () => {
    const user = userEvent.setup()
    api.updateTerm.mockResolvedValue(full(item('t1', 'reef', 'отмель')))
    renderGlossary()
    await screen.findByRole('list', { name: 'Термины' })
    await user.click(screen.getByRole('button', { name: 'Изменить «reef»' }))
    const form = screen.getByRole('form', { name: 'Изменить «reef»' })
    await user.clear(within(form).getByLabelText('Перевод'))
    await user.type(within(form).getByLabelText('Перевод'), 'отмель{Enter}')
    expect(api.updateTerm).toHaveBeenCalledWith('t1', { term: 'reef', translation: 'отмель' }, { accessToken: 'jwt' })
    await waitFor(() => expect(screen.getByText('отмель')).toBeTruthy())

    await user.click(screen.getByRole('button', { name: 'Изменить «ledger»' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('form', { name: 'Изменить «ledger»' })).toBeNull()
  })

  it('shows where a term occurs, leads into the book and deletes it after confirmation', async () => {
    const user = userEvent.setup()
    api.getTerm.mockResolvedValue(full(terms[0]))
    api.deleteTerm.mockResolvedValue(undefined)
    text.loadDocumentText.mockResolvedValue({
      sourceAvailable: true, aligned: true, truncated: false,
      paragraphs: [
        { index: 5, source: 'far out beyond the reef, moving', translation: 'далеко за рифом' },
        { index: 6, source: 'beyond the outer reef.', translation: 'за внешними скалами.' },
      ],
    })
    renderGlossary('/glossary?term=t1')
    const card = await screen.findByRole('complementary', { name: 'Термин «reef»' })
    expect(await within(card).findByText('Где встречается · 2 абзаца')).toBeTruthy()
    expect(within(card).getAllByText('reef', { selector: 'mark' })).toHaveLength(2)
    expect(within(card).getByText('В переводе абзаца нет «риф»')).toBeTruthy()
    expect(within(card).getAllByRole('link', { name: 'Открыть в книге →' })[0].getAttribute('href'))
      .toBe('/documents/j1?term=t1&paragraph=5')

    await user.click(within(card).getByRole('button', { name: 'Удалить' }))
    expect(within(card).getByText('Удалить «reef»?')).toBeTruthy()
    await user.click(within(card).getByRole('button', { name: 'Удалить' }))
    expect(api.deleteTerm).toHaveBeenCalledWith('t1', { accessToken: 'jwt' })
    await waitFor(() => expect(rowTerms()).toEqual(['Gull Point', 'ledger']))
    expect(address()).toBe('/glossary')
  })

  it('invites to start when there are no terms and no books', async () => {
    api.getTerms.mockResolvedValue({ items: [], page: 0, size: 100, total_elements: 0, total_pages: 0 })
    render(
      <PreferencesProvider>
        <MemoryRouter initialEntries={['/glossary']}>
          <Routes>
            <Route element={<Outlet context={{ documents: [] }} />}>
              <Route path="/glossary" element={<GlossaryPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </PreferencesProvider>,
    )
    expect(await screen.findByRole('heading', { name: 'Глоссарий пока пустой' })).toBeTruthy()
  })
})
