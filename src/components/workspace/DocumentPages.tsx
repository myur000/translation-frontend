import type { RefObject } from 'react'
import { useTranslation } from '../../i18n/useTranslation.ts'
import type { DocumentView } from '../../viewer/types.ts'
import { PdfPages } from './PdfPages.tsx'
import styles from './DocumentPages.module.css'

interface DocumentPagesProps { view: DocumentView; width: number; zoom: number; viewportRef: RefObject<HTMLDivElement | null> }

export function DocumentPages({ view, width, zoom, viewportRef }: DocumentPagesProps) {
  const { t } = useTranslation()
  if (view.status !== 'ready') return null
  if (view.kind === 'pdf') return <PdfPages view={view} width={width} zoom={zoom} viewportRef={viewportRef} />
  return <article className={`${styles.paper} ${styles.docx}`} style={{ width }}>
    <p className={styles.formatNote}>{t('viewer.docxNote')}</p>
    <div dangerouslySetInnerHTML={{ __html: view.html }} />
  </article>
}
