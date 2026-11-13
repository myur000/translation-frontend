import { cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOCUMENT_TEXT_MAX_PAGES, DOCUMENT_TEXT_PAGE_SIZE, loadOriginalText } from '../api/documentText.ts'
import type { DocumentTextResponse } from '../api/contracts/documents.ts'
import { DocumentPages } from '../components/workspace/DocumentPages.tsx'
import { PreferencesProvider } from '../preferences/PreferencesProvider.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const jobId = '52f78386-6410-4b08-a419-7b064717cd49'

function textPage(overrides: Partial<DocumentTextResponse>): DocumentTextResponse {
  return {
    job_id: jobId, file_format: 'DOCX', source_lang: 'eng_Latn', target_lang: 'rus_Cyrl',
    source_available: true, aligned: true, source_paragraphs: 2, translation_paragraphs: 2,
    truncated: false, page: 0, size: DOCUMENT_TEXT_PAGE_SIZE, total_paragraphs: 2, total_pages: 1,
    paragraphs: [], ...overrides,
  }
}
function stubTextPages(pages: DocumentTextResponse[]) {
  const fetchMock = vi.fn(async (url: string) => {
    const page = Number(new URL(url, 'http://local.test').searchParams.get('page'))
    return new Response(JSON.stringify(pages[page] ?? pages.at(-1)), { headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('original text from GET /documents/{jobId}/text', () => {
  it('collects source paragraphs from every page with JWT and the maximum page size', async () => {
    const fetchMock = stubTextPages([
      textPage({ total_pages: 2, paragraphs: [{ index: 0, source: 'Title', translation: 'Заголовок' }] }),
      textPage({ page: 1, total_pages: 2, paragraphs: [{ index: 1, source: 'Body', translation: 'Текст' }] }),
    ])
    await expect(loadOriginalText(jobId, { accessToken: 'jwt' })).resolves
      .toEqual({ available: true, paragraphs: [{ index: 0, text: 'Title' }, { index: 1, text: 'Body' }], truncated: false })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `/api/documents/${jobId}/text?page=0&size=${DOCUMENT_TEXT_PAGE_SIZE}`,
      `/api/documents/${jobId}/text?page=1&size=${DOCUMENT_TEXT_PAGE_SIZE}`,
    ])
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer jwt')
  })

  it('skips missing source paragraphs of an unaligned document and keeps the truncation flag', async () => {
    stubTextPages([textPage({ aligned: false, truncated: true, paragraphs: [
      { index: 0, source: 'Only source', translation: 'Перевод' },
      { index: 1, source: null, translation: 'Лишний абзац перевода' },
    ] })])
    await expect(loadOriginalText(jobId, { accessToken: 'jwt' })).resolves
      .toEqual({ available: true, paragraphs: [{ index: 0, text: 'Only source' }], truncated: true })
  })

  it('reports a source removed by retention without requesting further pages', async () => {
    const fetchMock = stubTextPages([textPage({ source_available: false, source_paragraphs: null, total_pages: 3,
      paragraphs: [{ index: 0, source: null, translation: 'Перевод' }] })])
    await expect(loadOriginalText(jobId, { accessToken: 'jwt' })).resolves
      .toEqual({ available: false, paragraphs: [], truncated: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops at the request limit and marks the text as truncated', async () => {
    const fetchMock = stubTextPages([textPage({ total_pages: 1000, paragraphs: [{ index: 0, source: 'Again', translation: 'Снова' }] })])
    const text = await loadOriginalText(jobId, { accessToken: 'jwt' })
    expect(fetchMock).toHaveBeenCalledTimes(DOCUMENT_TEXT_MAX_PAGES)
    expect(text.truncated).toBe(true)
  })
})

describe('text view of the original', () => {
  const renderText = (texts: string[], truncated = false) => render(
    <PreferencesProvider>
      <DocumentPages view={{ status: 'ready', kind: 'text', paragraphs: texts.map((text, index) => ({ index, text })), truncated, pageCount: null }}
        width={560} zoom={100} viewportRef={createRef()} noteAction={<button type="button">Выбрать</button>} />
    </PreferencesProvider>,
  )

  it('renders server text as text, never as HTML, and explains the missing formatting', () => {
    const { container } = renderText(['<img src=x onerror="alert(1)">', 'Line one\nLine two'])
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText(/Текст оригинала с сервера/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Выбрать' })).toBeTruthy()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('tells the reader when the end of the original is not shown', () => {
    renderText(['Start'], true)
    expect(screen.getByRole('note').textContent).toMatch(/конец оригинала не показан/)
  })
})
