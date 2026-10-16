import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask, TextLayer } from 'pdfjs-dist'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { DocumentView } from '../../viewer/types.ts'
import styles from './DocumentPages.module.css'

type PdfView = Extract<DocumentView, { kind: 'pdf' }>
interface PdfPagesProps { view: PdfView; width: number; zoom: number; viewportRef: RefObject<HTMLDivElement | null> }

export function PdfPages({ view, width, zoom, viewportRef }: PdfPagesProps) {
  return Array.from({ length: view.pageCount }, (_, index) => (
    <PdfPage key={index} pdf={view.pdf} number={index + 1} width={width} zoom={zoom}
      ratio={view.height / view.width} naturalWidth={view.width} sizes={view.pageSizes} viewportRef={viewportRef} />
  ))
}

interface PdfPageProps {
  pdf: PDFDocumentProxy; number: number; width: number; zoom: number; ratio: number; naturalWidth: number
  sizes: Map<number, { width: number; height: number }>
  viewportRef: RefObject<HTMLDivElement | null>
}

function PdfPage({ pdf, number, width, zoom, ratio, naturalWidth, sizes, viewportRef }: PdfPageProps) {
  const { t } = useTranslation()
  const paperRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const renderDoneRef = useRef<Promise<unknown> | null>(null)
  const [visible, setVisible] = useState(number === 1 || typeof IntersectionObserver === 'undefined')
  const [pageSize, setPageSize] = useState(() => sizes.get(number) ?? { width: naturalWidth, height: naturalWidth * ratio })
  const [errorKey, setErrorKey] = useState('')
  const key = `${width}:${zoom}`
  useEffect(() => {
    const paper = paperRef.current
    if (!paper) return
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: viewportRef.current, rootMargin: '600px',
    })
    observer.observe(paper)
    return () => observer.disconnect()
  }, [viewportRef])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let page: PDFPageProxy | undefined
    let task: RenderTask | undefined
    let textLayer: TextLayer | undefined
    const render = async () => {
      try {
        await renderDoneRef.current?.catch(() => {})
        if (cancelled) return
        page = await pdf.getPage(number)
        if (cancelled) return
        const natural = page.getViewport({ scale: 1 })
        sizes.set(number, { width: natural.width, height: natural.height })
        setPageSize((current) => current.width === natural.width && current.height === natural.height
          ? current : { width: natural.width, height: natural.height })
        const scale = width / natural.width
        const quality = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * zoom / 100))
        const viewport = page.getViewport({ scale: scale * quality })
        const canvas = canvasRef.current
        if (!canvas?.getContext('2d')) throw new Error('Canvas is unavailable')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        task = page.render({ canvas, viewport })
        renderDoneRef.current = task.promise
        await task.promise
        if (cancelled || !textRef.current) return
        setErrorKey('')
        const { TextLayer: Layer } = await import('pdfjs-dist')
        if (cancelled || !textRef.current) return
        textRef.current.replaceChildren()
        textLayer = new Layer({ textContentSource: page.streamTextContent(),
          container: textRef.current, viewport: page.getViewport({ scale }) })
        // A text-layer failure must not hide an otherwise rendered PDF page.
        await textLayer.render().catch(() => {})
      } catch {
        if (!cancelled) setErrorKey(key)
      }
    }
    void render()
    return () => {
      cancelled = true
      task?.cancel()
      textLayer?.cancel()
      void renderDoneRef.current?.catch(() => {}).then(() => page?.cleanup())
    }
  }, [pdf, number, width, zoom, visible, sizes, key])

  return (
    <article ref={paperRef} className={styles.paper} data-document-page={number}
      style={{ width, height: width * pageSize.height / pageSize.width, '--total-scale-factor': width / pageSize.width } as CSSProperties}>
      {visible ? <>
        <canvas ref={canvasRef} className={styles.canvas} aria-label={t('viewer.page', { page: number })} />
        <div ref={textRef} className={styles.textLayer} />
        {errorKey === key ? <p className={styles.pageError} role="alert">{t('viewer.pageFailed', { page: number })}</p> : null}
      </> : <span className={styles.placeholder}>{number}</span>}
    </article>
  )
}
