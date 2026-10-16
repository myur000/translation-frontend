import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './NotesPanel.module.css'

interface NotesPanelProps { onClose: () => void }

export function NotesPanel({ onClose }: NotesPanelProps) {
  const { t } = useTranslation()
  return (
    <aside className={styles.panel} aria-label={t('notes.title')}>
      <header className={styles.header}>
        <div><h2>{t('notes.title')}</h2><span>{t('notes.count')}</span></div>
        <button type="button" aria-label={t('notes.close')} onClick={onClose}>×</button>
      </header>
      <div className={styles.tools}>
        <span>{t('notes.currentPage')}</span>
        <button type="button" disabled title={t('notes.comingSoon')}>{t('notes.add')}</button>
      </div>
      <div className={styles.emptyState}>
        <div className={styles.noteIcon} aria-hidden="true">▤</div>
        <h3>{t('notes.emptyTitle')}</h3>
        <p>{t('notes.emptyDescription')}</p>
      </div>
    </aside>
  )
}
