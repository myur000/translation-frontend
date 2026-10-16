import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '../api/client.ts'
import { useDocumentAssets } from '../hooks/useDocumentAssets.ts'
import { fileFormat } from '../viewer/types.ts'
import { readBlob } from '../viewer/readBlob.ts'
import { sanitizeDocumentHtml } from '../viewer/docxEngine.ts'
import type { DocumentItem } from '../types/document.ts'

const mocks = vi.hoisted(() => ({
  session: { email: 'reader@example.com', accessToken: 'first-token' },
  download: vi.fn(),
}))
vi.mock('../auth/useAuth.ts', () => ({ useAuth: () => ({ session: mocks.session }) }))
vi.mock('../api/translations.ts', () => ({ downloadTranslation: mocks.download }))
const book: DocumentItem = { id: 'book-1', jobId: 'job-1', name: 'book.pdf',
  status: 'ready', pages: 0, sourceLanguage: 'en', targetLanguage: 'ru' }
const response = () => ({ blob: new Blob(['%PDF fixture']), fileName: 'translated.pdf', contentType: 'application/pdf' })
beforeEach(() => {
  mocks.session = { email: 'reader@example.com', accessToken: 'first-token' }
  mocks.download.mockReset().mockResolvedValue(response())
})
afterEach(cleanup)

describe('real document assets', () => {
  it('loads a DONE translation with JWT and exposes the real local original', async () => {
    const file = new File(['original'], 'original.PDF')
    const { result } = renderHook(() => useDocumentAssets({ ...book, sourceFile: file }))
    await waitFor(() => expect(result.current.translation.status).toBe('ready'))
    expect(mocks.download).toHaveBeenCalledWith('job-1', expect.objectContaining({ accessToken: 'first-token', signal: expect.any(AbortSignal) }))
    expect(result.current.original).toEqual({ status: 'ready', asset: { blob: file, name: 'original.PDF', format: 'pdf' } })
  })
  it.each(['draft', 'processing', 'failed'] as const)('does not download a %s translation', (status) => {
    const { result } = renderHook(() => useDocumentAssets({ ...book, status }))
    expect(result.current.translation.status).toBe('message')
    expect(mocks.download).not.toHaveBeenCalled()
  })
  it('does not refetch an opened document when JWT rotates', async () => {
    const { result, rerender } = renderHook(() => useDocumentAssets(book))
    await waitFor(() => expect(result.current.translation.status).toBe('ready'))
    const asset = result.current.translation
    mocks.session = { ...mocks.session, accessToken: 'renewed-token' }
    rerender()
    expect(mocks.download).toHaveBeenCalledTimes(1)
    expect(result.current.translation).toBe(asset)
  })
  it('aborts the previous file request and ignores its late response after switching books', async () => {
    let finish!: (value: ReturnType<typeof response>) => void
    mocks.download.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const { result, rerender } = renderHook(({ document }) => useDocumentAssets(document), { initialProps: { document: book } })
    const signal = mocks.download.mock.calls[0][1].signal as AbortSignal
    rerender({ document: { ...book, id: 'book-2', jobId: 'job-2' } })
    expect(signal.aborted).toBe(true)
    await waitFor(() => expect(result.current.translation.status).toBe('ready'))
    const current = result.current.translation
    await act(async () => finish({ ...response(), fileName: 'stale.pdf' }))
    expect(result.current.translation).toBe(current)
  })
  it('aborts preview requests when the workspace unmounts', () => {
    mocks.download.mockReturnValue(new Promise(() => {}))
    const { unmount } = renderHook(() => useDocumentAssets(book))
    const signal = mocks.download.mock.calls[0][1].signal as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
  })
  it.each(['text/html', 'application/json', 'application/problem+json'])('does not display a %s response as a document', async (contentType) => {
    mocks.download.mockResolvedValue({ ...response(), contentType })
    const { result } = renderHook(() => useDocumentAssets(book))
    await waitFor(() => expect(result.current.translation).toEqual({ status: 'message', message: 'viewer.invalidFile', retry: true }))
  })
  it('shows an expired result and retries on user request', async () => {
    mocks.download.mockRejectedValueOnce(new ApiClientError('Gone', 410, null, null, null))
    const { result } = renderHook(() => useDocumentAssets(book))
    await waitFor(() => expect(result.current.translation).toEqual({ status: 'message', message: 'viewer.expired', retry: true }))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.translation.status).toBe('ready'))
    expect(mocks.download).toHaveBeenCalledTimes(2)
  })
  it('reads local files and rejects an aborted read', async () => {
    const buffer = await readBlob(new File(['real file'], 'file.pdf'), new AbortController().signal)
    expect(new TextDecoder().decode(buffer)).toBe('real file')
    const controller = new AbortController()
    controller.abort()
    await expect(readBlob(new Blob(['file']), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('detects formats without inventing a viewer for legacy DOC', () => {
    expect(fileFormat('BOOK.PDF')).toBe('pdf')
    expect(fileFormat('book.docx')).toBe('docx')
    expect(fileFormat('book.doc')).toBe('doc')
    expect(fileFormat('book.html')).toBeNull()
  })
  it('removes scripts, event handlers, CSS and external resources from DOCX HTML', () => {
    const html = sanitizeDocumentHtml('<h1 onclick="alert(1)">Book</h1><script>alert(1)</script><img src="https://tracker.test/pixel"><img src="data:image/svg+xml;base64,PHN2Zz4="><img src="data:image/png;base64,YQ=="><a href="javascript:alert(1)">text</a><p style="position:fixed">Body</p><iframe src="https://tracker.test"></iframe>')
    expect(html).toContain('<h1>Book</h1>')
    expect(html).toContain('data:image/png;base64,YQ==')
    expect(html).not.toMatch(/script|onclick|style=|iframe|https:|javascript:|svg\+xml/)
  })
})
