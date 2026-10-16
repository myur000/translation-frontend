import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { readBlob } from './readBlob.ts'

GlobalWorkerOptions.workerSrc = workerUrl

export async function openPdf(blob: Blob, signal: AbortSignal) {
  const data = new Uint8Array(await readBlob(blob, signal))
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const base = `${import.meta.env.BASE_URL}pdf-assets/`
  const task = getDocument({
    data, enableXfa: false,
    cMapUrl: `${base}cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`, wasmUrl: `${base}wasm/`,
  })
  const abort = () => { void task.destroy().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    const pdf = await task.promise
    if (pdf.numPages > 2000) throw new Error('PREVIEW_TOO_LARGE')
    const firstPage = await pdf.getPage(1)
    const size = firstPage.getViewport({ scale: 1 })
    return { pdf, width: size.width, height: size.height,
      pageSizes: new Map([[1, { width: size.width, height: size.height }]]) }
  } catch (error) {
    signal.removeEventListener('abort', abort)
    await task.destroy().catch(() => {})
    throw error
  }
}
