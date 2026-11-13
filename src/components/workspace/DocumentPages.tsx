import type { ReactNode, RefObject } from 'react'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { DocumentView } from '../../viewer/types.ts'
import { PdfPages } from './PdfPages.tsx'
import styles from './DocumentPages.module.css'

interface DocumentPagesProps {
  view: DocumentView
  width: number
  zoom: number
  viewportRef: RefObject<HTMLDivElement | null>
  /** Действие рядом с пояснением над текстовым оригиналом (выбрать файл с оформлением). */
  noteAction?: ReactNode
}

export function DocumentPages({ view, width, zoom, viewportRef, noteAction }: DocumentPagesProps) {
  const { t } = useTranslation()
  if (view.status !== 'ready') return null
  if (view.kind === 'pdf') return <PdfPages view={view} width={width} zoom={zoom} viewportRef={viewportRef} />
  if (view.kind === 'text') return <article className={`${styles.paper} ${styles.docx} ${styles.plainText}`} style={{ width }}>
    <div className={styles.formatNote} data-quote-ignore="">
      <p>{t('viewer.originalTextNote')}</p>
      {noteAction}
    </div>
    {/* Сервер отдаёт простой текст: выводим как текст, а не как HTML. Номер абзаца нужен цитатам. */}
    {view.paragraphs.map((paragraph) => <p key={paragraph.index} data-paragraph-index={paragraph.index}>{paragraph.text}</p>)}
    {view.truncated ? <p className={styles.truncatedNote} role="note" data-quote-ignore="">{t('viewer.originalTruncated')}</p> : null}
  </article>
  return <article className={`${styles.paper} ${styles.docx}`} style={{ width }}>
    <p className={styles.formatNote} data-quote-ignore="">{t('viewer.docxNote')}</p>
    <div dangerouslySetInnerHTML={{ __html: view.html }} />
  </article>
}
