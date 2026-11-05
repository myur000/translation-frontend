import { useTranslation } from '../../i18n/useTranslation.ts'
import { ScrollSyncButton } from './ScrollSyncButton.tsx'
import { WorkspaceViewButton } from './WorkspaceViewButton.tsx'
import styles from './ReaderBar.module.css'

interface ReaderBarProps {
  currentPage: number
  pageCount: number | null
  notesOpen: boolean
  isScrollSyncEnabled: boolean
  isDualPanelFullscreen: boolean
  onPreviousPage: () => void
  onNextPage: () => void
  onToggleNotes: () => void
  onToggleScrollSync: () => void
  onToggleDualPanelFullscreen: () => void
}

/** Reading controls under the documents, as in a PDF reader. */
export function ReaderBar(props: ReaderBarProps) {
  const { t } = useTranslation()
  const { currentPage, pageCount } = props

  return (
    <nav className={styles.bar} aria-label={t('reader.label')}>
      <div className={styles.pages}>
        <button type="button" aria-label={t('toolbar.previousPage')} title={t('toolbar.previousPage')} onClick={props.onPreviousPage} disabled={pageCount === null || currentPage === 1}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 3.5-4.5 4.5 4.5 4.5" /></svg>
        </button>
        <span aria-live="polite">
          {pageCount === null ? '—' : t('reader.page', { page: currentPage, total: pageCount })}
        </span>
        <button type="button" aria-label={t('toolbar.nextPage')} title={t('toolbar.nextPage')} onClick={props.onNextPage} disabled={pageCount === null || currentPage >= pageCount}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
        </button>
      </div>

      <div className={styles.view}>
        <ScrollSyncButton isEnabled={props.isScrollSyncEnabled} onToggle={props.onToggleScrollSync} />
        <WorkspaceViewButton isEnabled={props.isDualPanelFullscreen} onToggle={props.onToggleDualPanelFullscreen} />
      </div>

      <button
        type="button"
        className={`${styles.notes} ${props.notesOpen ? styles.notesActive : ''}`}
        aria-pressed={props.notesOpen}
        onClick={props.onToggleNotes}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h6l2.5 2.5v8.5h-8.5zM6 7h4.5M6 9.5h4.5" /></svg>
        {t('toolbar.notes')}
      </button>
    </nav>
  )
}
