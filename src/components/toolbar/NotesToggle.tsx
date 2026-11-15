import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './NotesToggle.module.css'

interface NotesToggleProps {
  isOpen: boolean
  /** id панели заметок: связь кнопки с тем, что она открывает. */
  panelId: string
  onToggle: () => void
  /** Почему кнопка сейчас не работает (в сравнении заметки открываются щелчком по тексту). */
  disabledHint?: string
}

/**
 * Кнопка заметок в группе вида: открывает и прячет панель у края. Неактивная остаётся
 * на месте: состав панели не меняется вместе с раскладкой, и панель не сдвигается.
 */
export function NotesToggle({ isOpen, panelId, onToggle, disabledHint }: NotesToggleProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={t('toolbar.notes')}
      aria-pressed={disabledHint ? false : isOpen}
      aria-controls={panelId}
      aria-keyshortcuts={disabledHint ? undefined : 'N'}
      aria-disabled={disabledHint ? true : undefined}
      aria-description={disabledHint}
      title={disabledHint ?? t('toolbar.notesHint')}
      onClick={disabledHint ? undefined : onToggle}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5.5 2.8h6.6l3.4 3.4v9.6a1.4 1.4 0 0 1-1.4 1.4H5.5a1.4 1.4 0 0 1-1.4-1.4V4.2a1.4 1.4 0 0 1 1.4-1.4Z" />
        <path d="M12 2.8v3.5h3.5M7 10h6M7 13h4" />
      </svg>
    </button>
  )
}
