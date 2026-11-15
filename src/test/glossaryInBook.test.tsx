import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '../api/client.ts'
import type { TermListItem, TermResponse } from '../api/contracts/terms.ts'
import { GlossaryNotice } from '../components/workspace/GlossaryNotice.tsx'
import { RetranslateDialog } from '../components/workspace/RetranslateDialog.tsx'
import { TermComposer } from '../components/workspace/TermComposer.tsx'
import { cleanTermText, findTerms, termMatcher, translationPattern } from '../glossary/termMatch.ts'
import { termAtPoint, termHits } from '../glossary/termRanges.ts'
import { useGlossaryTerms } from '../glossary/useGlossaryTerms.ts'
import type { ActiveQuoteSelection } from '../hooks/useQuoteSelection.ts'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'
import type { DocumentItem } from '../types/document.ts'
import { installDialogPolyfill } from './dialogPolyfill.ts'

const api = vi.hoisted(() => ({ getTerms: vi.fn(), createTerm: vi.fn(), updateTerm: vi.fn(), linkTermDocument: vi.fn() }))
vi.mock('../api/terms.ts', () => api)
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: { email: 'reader@example.com', accessToken: 'jwt' } }) }))

const wrapper = ({ children }: { children: ReactNode }) => <PreferencesProvider>{children}</PreferencesProvider>
const term = (id: string, value: string, translation: string) => ({ id, term: value, translation })

let restoreDialog: () => void
beforeAll(() => { restoreDialog = installDialogPolyfill() })
afterAll(() => restoreDialog())
beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset()
  localStorage.clear()
})
afterEach(() => cleanup())

describe('finding glossary terms in the text', () => {
  it('matches whole words, plurals and possessives, longer terms first', () => {
    const matcher = termMatcher([term('1', 'reef', 'риф'), term('2', 'float', 'поплавок'), term('3', 'glass float', 'стеклянный поплавок'), term('4', 'keeper', 'смотритель')], 'SOURCE')!
    const text = 'Beyond the Reef and the reefs, a reefer, the keeper’s glass  float and a float.'
    expect(findTerms(text, matcher).map((match) => [text.slice(match.start, match.end), match.term.id])).toEqual([
      ['Reef', '1'], ['reefs', '1'], ['keeper’s', '4'], ['glass  float', '3'], ['float', '2'],
    ])
  })

  it('finds a translation in other cases by the stems of its words', () => {
    expect(translationPattern('стеклянный поплавок')).toBe('стеклянн\\p{L}*\\s+поплав\\p{L}*')
    const matcher = termMatcher([term('1', 'reef', 'риф'), term('2', 'glass float', 'стеклянный поплавок'), term('3', 'Gull Point', 'мыс Чаек')], 'TRANSLATION')!
    const text = 'За рифом, у стеклянного поплавка, на мысе Чаек.'
    expect(findTerms(text, matcher).map((match) => text.slice(match.start, match.end))).toEqual(['рифом', 'стеклянного поплавка', 'мысе Чаек'])
  })

  it('cleans a selection into a one-line term', () => {
    expect(cleanTermText(' «reef», ')).toBe('reef')
    expect(cleanTermText('glass\n  float.')).toBe('glass float')
    expect(cleanTermText('(Maritime Board)')).toBe('Maritime Board')
  })

  it('builds ranges per block of the column and skips service layers', () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <p>Far beyond the <em>outer</em> reef.</p>
      <div data-quote-ignore=""><p>reef in a marker</p></div>
      <ul><li><p>The reef again</p></li></ul>
      <div data-document-page="1"><span>a pdf line with a reef</span></div>`
    const hits = termHits(host, 'SOURCE', [term('1', 'reef', 'риф')])
    const found = [...hits].map(([block, list]) => [block.tagName, list.map((hit) => hit.range.toString())])
    expect(found).toEqual([['P', ['reef']], ['P', ['reef']], ['SPAN', ['reef']]])
    expect(termHits(host, 'SOURCE', []).size).toBe(0)
  })

  it('names the term under the pointer only inside its own line boxes', () => {
    const range = { getClientRects: () => [{ left: 10, right: 50, top: 100, bottom: 120 }] } as unknown as Range
    const hits = [{ range, term: term('1', 'reef', 'риф') }]
    expect(termAtPoint(hits, 30, 110)?.term.term).toBe('reef')
    expect(termAtPoint(hits, 60, 110)).toBeNull()
  })
})

describe('glossary of the book’s language pair', () => {
  const item = (id: string, value: string): TermListItem => ({
    id, term: value, translation: value, source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', document_count: 1, updated_at: '',
  })

  it('loads every page of the pair and shows a saved term at once', async () => {
    api.getTerms
      .mockResolvedValueOnce({ items: [item('a', 'reef')], page: 0, size: 100, total_elements: 2, total_pages: 2 })
      .mockResolvedValueOnce({ items: [item('b', 'ledger')], page: 1, size: 100, total_elements: 2, total_pages: 2 })
    const { result } = renderHook(() => useGlossaryTerms('eng_Latn', 'rus_Cyrl'), { wrapper })
    await waitFor(() => expect(result.current.isLoaded).toBe(true))
    expect(result.current.terms.map((value) => value.term)).toEqual(['reef', 'ledger'])
    expect(api.getTerms.mock.calls.map(([query]) => query)).toEqual([
      { source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', page: 0, size: 100 },
      { source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', page: 1, size: 100 },
    ])

    act(() => result.current.upsert({ ...item('a', 'reef'), translation: 'отмель', created_at: '', documents: [] }))
    expect(result.current.terms.find((value) => value.id === 'a')?.translation).toBe('отмель')
  })

  it('does not ask for a glossary without a language pair', () => {
    const { result } = renderHook(() => useGlossaryTerms(null, null), { wrapper })
    expect(result.current.terms).toEqual([])
    expect(api.getTerms).not.toHaveBeenCalled()
  })
})

describe('«To glossary» card over a selection', () => {
  const selection = (side: 'SOURCE' | 'TRANSLATION', text: string): ActiveQuoteSelection => ({
    side, text, blockText: null, paragraphIndex: 5, rect: { top: 300, left: 200, width: 40, height: 20 },
  })
  const saved: TermResponse = {
    id: 't9', term: 'reef', translation: 'риф', source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', created_at: '', updated_at: '',
    documents: [{ job_id: 'j1', document_name: 'ledger.docx', document_available: true, linked_at: '' }],
  }
  const renderCard = (props: Partial<Parameters<typeof TermComposer>[0]> = {}) => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    const all = {
      jobId: 'j1', selection: selection('SOURCE', ' reef, '), liveSelection: null, canPickPaired: true,
      terms: [], pair: 'EN → RU', onSaved, onClose, ...props,
    }
    const view = render(<TermComposer {...all} />, { wrapper })
    return { ...view, onSaved, onClose, rerenderWith: (next: Partial<typeof all>) => view.rerender(<TermComposer {...all} {...next} />) }
  }

  it('takes the term from the original and the translation from a selection in the other column', async () => {
    const user = userEvent.setup()
    api.createTerm.mockResolvedValue(saved)
    const { onSaved, rerenderWith } = renderCard()
    const card = screen.getByRole('form', { name: 'В глоссарий' })
    expect(within(card).getByText('В глоссарий · EN → RU')).toBeTruthy()
    expect((within(card).getByLabelText('Термин') as HTMLInputElement).value).toBe('reef')
    expect(document.activeElement).toBe(within(card).getByLabelText('Перевод'))
    expect(card.textContent).toContain('Выделите перевод в соседней колонке — он подставится сюда.')

    // Выделение в переводе подставляется, когда кнопку мыши отпустили.
    rerenderWith({ liveSelection: selection('TRANSLATION', 'рифом') })
    fireEvent.pointerUp(document)
    await waitFor(() => expect((within(card).getByLabelText('Перевод') as HTMLInputElement).value).toBe('рифом'))
    expect(document.activeElement).toBe(within(card).getByRole('button', { name: 'Сохранить' }))

    await user.clear(within(card).getByLabelText('Перевод'))
    await user.type(within(card).getByLabelText('Перевод'), 'риф{Enter}')
    expect(api.createTerm).toHaveBeenCalledWith({ term: 'reef', translation: 'риф', job_id: 'j1' }, { accessToken: 'jwt' })
    expect(onSaved).toHaveBeenCalledWith(saved)
  })

  it('starts from the translation side with the term field', () => {
    renderCard({ selection: selection('TRANSLATION', 'рифом') })
    const card = screen.getByRole('form', { name: 'В глоссарий' })
    expect((within(card).getByLabelText('Перевод') as HTMLInputElement).value).toBe('рифом')
    expect(document.activeElement).toBe(within(card).getByLabelText('Термин'))
    expect(card.textContent).toContain('Выделите слово в оригинале — оно станет термином.')
  })

  it('updates an existing term of the pair and links it to this book', async () => {
    const user = userEvent.setup()
    api.updateTerm.mockResolvedValue(saved)
    api.linkTermDocument.mockResolvedValue(saved)
    const existing: TermListItem = { id: 't1', term: 'Reef', translation: 'отмель', source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', document_count: 0, updated_at: '' }
    const { onSaved } = renderCard({ terms: [existing] })
    const card = screen.getByRole('form', { name: 'В глоссарий' })
    expect(card.textContent).toContain('Уже в глоссарии: Reef → отмель. Сохранение заменит перевод.')
    await user.type(within(card).getByLabelText('Перевод'), 'риф')
    await user.click(within(card).getByRole('button', { name: 'Сохранить' }))
    expect(api.updateTerm).toHaveBeenCalledWith('t1', { term: 'reef', translation: 'риф' }, { accessToken: 'jwt' })
    expect(api.linkTermDocument).toHaveBeenCalledWith('t1', 'j1', { accessToken: 'jwt' })
    expect(api.createTerm).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith(saved)
  })

  it('shows the server’s reason when the term cannot be saved and closes on Escape', async () => {
    const user = userEvent.setup()
    const message = 'Достигнут предел: 5000 терминов'
    api.createTerm.mockRejectedValue(new ApiClientError(message, 409, { message } as never, null, null))
    const { onSaved, onClose } = renderCard()
    const card = screen.getByRole('form', { name: 'В глоссарий' })
    expect((within(card).getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true)
    await user.type(within(card).getByLabelText('Перевод'), 'риф{Enter}')
    expect((await within(card).findByRole('alert')).textContent).toBe(message)
    expect(onSaved).not.toHaveBeenCalled()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not suggest picking from the other column when only one is visible', () => {
    renderCard({ canPickPaired: false })
    expect(screen.getByRole('form', { name: 'В глоссарий' }).textContent).not.toContain('Выделите перевод')
  })
})

describe('after a new term', () => {
  it('offers to translate the book again', async () => {
    const user = userEvent.setup()
    const onRetranslate = vi.fn()
    render(<GlossaryNotice term="reef" translation="риф" onRetranslate={onRetranslate} onClose={vi.fn()} />, { wrapper })
    const notice = screen.getByRole('status')
    expect(notice.textContent).toContain('Термин «reef → риф» сохранён.')
    await user.click(within(notice).getByRole('button', { name: 'Перевести заново' }))
    expect(onRetranslate).toHaveBeenCalledOnce()
  })

  it('opens «Translate again» into the same language with the glossary ticked', async () => {
    api.getTerms.mockResolvedValue({ items: [], page: 0, size: 1, total_elements: 3, total_pages: 3 })
    const book = { id: 'd1', jobId: 'j1', name: 'ledger.docx', sourceLanguage: 'eng_Latn', targetLanguage: 'rus_Cyrl', pages: 3, status: 'ready' } as DocumentItem
    render(<RetranslateDialog document={book} onSubmit={vi.fn()} onClose={vi.fn()} withGlossary />, { wrapper })
    const glossary = await screen.findByRole('checkbox', { name: /глоссарий/i })
    expect((glossary as HTMLInputElement).checked).toBe(true)
    expect(api.getTerms).toHaveBeenCalledWith({ source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', size: 1 }, expect.anything())
  })
})
