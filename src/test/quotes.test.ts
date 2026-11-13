import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '../api/client.ts'
import type { DocumentTextResponse } from '../api/contracts/documents.ts'
import { forgetDocumentText, loadDocumentText, type DocumentText } from '../api/documentText.ts'
import { titleFromQuote } from '../notes/noteSyntax.ts'
import { findQuoteElement } from '../notes/quoteHighlight.ts'
import { locateQuote, QUOTE_MAX_LENGTH, type QuoteSelection } from '../notes/quoteLocator.ts'

const book: DocumentText = {
  sourceAvailable: true,
  aligned: true,
  truncated: false,
  paragraphs: [
    { index: 0, source: 'Chapter One', translation: 'Глава первая' },
    { index: 1, source: 'The wind came from the north-east.', translation: 'Ветер дул с северо-востока.' },
    { index: 2, source: 'He wrote it down.', translation: 'Он записал это.' },
    { index: 3, source: 'Later, he wrote it down.', translation: 'Позже он записал это.' },
  ],
}
const selection = (overrides: Partial<QuoteSelection>): QuoteSelection =>
  ({ side: 'TRANSLATION', text: '', blockText: null, paragraphIndex: null, ...overrides })

describe('locating the paragraph of a quote', () => {
  it('finds the paragraph by text and pairs it with the other language', () => {
    expect(locateQuote(selection({ text: 'дул с северо-\nвостока' .replace('-\n', '-') }), book)).toEqual({
      status: 'found', truncated: false,
      quote: { side: 'TRANSLATION', paragraph_index: 1, quote: 'дул с северо-востока', paired_text: 'The wind came from the north-east.' },
    })
  })

  it('uses the block where the selection started when the phrase repeats', () => {
    const found = locateQuote(selection({ side: 'SOURCE', text: 'wrote it down', blockText: 'Later, he wrote it down.' }), book)
    expect(found.status === 'found' && found.quote.paragraph_index).toBe(3)
  })

  it('trusts the server paragraph number of the text view and binds a multi-paragraph selection to the first one', () => {
    const exact = locateQuote(selection({ side: 'SOURCE', text: 'He wrote it down.', paragraphIndex: 2 }), book)
    expect(exact.status === 'found' && exact.quote.paragraph_index).toBe(2)
    const spanning = locateQuote(selection({ text: 'Глава первая\n\nВетер дул' }), book)
    expect(spanning.status === 'found' && spanning.quote).toMatchObject({ paragraph_index: 0, quote: 'Глава первая Ветер дул' })
  })

  it('does not invent a pair for unaligned documents and shortens long quotes to the backend limit', () => {
    // Выделение уходит в следующий абзац без переноса строки (так бывает в PDF) и длиннее лимита.
    const long = `Позже он записал это. ${'Продолжение следующего абзаца. '.repeat(80)}`
    const found = locateQuote(selection({ text: long }), { ...book, aligned: false })
    expect(found.status === 'found' && found.quote.paragraph_index).toBe(3)
    expect(found).toMatchObject({ status: 'found', truncated: true, quote: { paired_text: null } })
    expect(found.status === 'found' && found.quote.quote.length).toBe(QUOTE_MAX_LENGTH)
  })

  it('reports a removed source and text that is not in the book', () => {
    expect(locateQuote(selection({ side: 'SOURCE', text: 'Chapter' }), { ...book, sourceAvailable: false })).toEqual({ status: 'sourceRemoved' })
    expect(locateQuote(selection({ text: 'Этого нет в книге' }), book)).toEqual({ status: 'notFound' })
  })

  it('suggests a note title from the quote without link syntax', () => {
    expect(titleFromQuote('Срок оплаты [[десять]] дней #договор')).toBe('Срок оплаты десять дней договор')
    expect(titleFromQuote('Покупатель оплачивает товар в течение десяти рабочих дней с момента подписания', 40)).toBe('Покупатель оплачивает товар в течение…')
  })
})

describe('finding a quote on the book page', () => {
  it('uses the paragraph number, then the block text, and skips service captions', () => {
    const viewport = document.createElement('div')
    viewport.innerHTML = `
      <p data-quote-ignore>Он записал это. (пояснение)</p>
      <p>Глава первая</p>
      <ul><li>Позже он записал это.</li></ul>
      <p data-paragraph-index="7">Текст абзаца 7</p>`
    expect(findQuoteElement(viewport, 7, 'что угодно')?.textContent).toBe('Текст абзаца 7')
    expect(findQuoteElement(viewport, 1, 'Позже он записал')?.tagName).toBe('LI')
    expect(findQuoteElement(viewport, 1, 'Нет такого')).toBeNull()
  })
})

describe('loading the bilingual book text for quotes', () => {
  const page = (overrides: Partial<DocumentTextResponse>): DocumentTextResponse => ({
    job_id: 'job-1', file_format: 'DOCX', source_lang: 'eng_Latn', target_lang: 'rus_Cyrl', source_available: true,
    aligned: true, source_paragraphs: 1, translation_paragraphs: 1, truncated: false, page: 0, size: 500,
    total_paragraphs: 1, total_pages: 1, paragraphs: [{ index: 0, source: 'A', translation: 'Б' }], ...overrides,
  })
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

  beforeEach(() => forgetDocumentText())
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('waits for the shared file slot after 429 and caches the text for the session', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ message: 'busy' }, 429, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(json(page({})))
    vi.stubGlobal('fetch', fetchMock)
    const request = loadDocumentText('job-1', { accessToken: 'jwt' })
    await vi.advanceTimersByTimeAsync(1000)
    await expect(request).resolves.toMatchObject({ sourceAvailable: true, aligned: true, paragraphs: [{ index: 0, source: 'A' }] })
    await loadDocumentText('job-1', { accessToken: 'jwt' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache failures', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ message: 'gone' }, 410)).mockResolvedValueOnce(json(page({})))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadDocumentText('job-1', { accessToken: 'jwt' })).rejects.toBeInstanceOf(ApiClientError)
    await expect(loadDocumentText('job-1', { accessToken: 'jwt' })).resolves.toMatchObject({ paragraphs: [{ index: 0 }] })
  })
})
