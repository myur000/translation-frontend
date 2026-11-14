import type { CSSProperties, Ref } from 'react'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './NotesPill.module.css'

interface NotesPillProps {
  /** Сколько заметок у книги; `null` — ещё не известно. */
  count: number | null
  /** id свёрнутого окна: кнопка его разворачивает. */
  controlsId: string
  className?: string
  style?: CSSProperties
  ref?: Ref<HTMLButtonElement>
  onExpand: () => void
}

/** Свёрнутое окно заметок: кнопка «Заметки · N» над нижней панелью. */
export function NotesPill({ count, controlsId, className = '', style, ref, onExpand }: NotesPillProps) {
  const { t } = useTranslation()
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.pill} ${className}`}
      style={style}
      aria-expanded={false}
      aria-controls={controlsId}
      title={t('notesWindow.expand')}
      onClick={onExpand}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5.5 2.8h6.6l3.4 3.4v9.6a1.4 1.4 0 0 1-1.4 1.4H5.5a1.4 1.4 0 0 1-1.4-1.4V4.2a1.4 1.4 0 0 1 1.4-1.4Z" />
        <path d="M12 2.8v3.5h3.5M7 10h6M7 13h4" />
      </svg>
      {count === null ? t('notesWindow.pillEmpty') : t('notesWindow.pill', { count })}
    </button>
  )
}
