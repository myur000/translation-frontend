import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './NotesToggle.module.css'

interface SummaryToggleProps {
  onToggle: () => void
}

/**
 * Кнопка конспекта в группе вида: раскрывает и сворачивает конспект книги (на полях —
 * закладку, иначе — в колонке заметок). То же, что клавиша K, в любом режиме чтения.
 */
export function SummaryToggle({ onToggle }: SummaryToggleProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={t('summaries.button')}
      aria-keyshortcuts="K"
      title={t('summaries.buttonHint')}
      onClick={onToggle}
    >
      {/* Тетрадь с корешком — тот же значок, что у конспекта на полях и в списках. */}
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5.5 3h9.3a1.2 1.2 0 0 1 1.2 1.2v11.6a1.2 1.2 0 0 1-1.2 1.2H5.5Z" />
        <path d="M5.5 3v14M3.5 6.5h3.4M3.5 10h3.4M3.5 13.5h3.4M9 7h4.5" />
      </svg>
    </button>
  )
}
