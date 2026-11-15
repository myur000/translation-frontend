import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './QuoteChoiceMenu.module.css'

export interface QuoteChoice {
  noteId: string
  title: string
  kind: 'note' | 'summary'
}

interface QuoteChoiceMenuProps {
  /** Точка клика на экране: меню встаёт под ней. */
  x: number
  y: number
  choices: readonly QuoteChoice[]
  /** Тон обложки книги (`--cover-N`): значок конспекта — её цвета. */
  summaryTone: number
  onPick: (choice: QuoteChoice) => void
  onClose: () => void
}

const MENU_WIDTH = 280
const EDGE = 8

/**
 * Слово есть и в заметке, и в конспекте: клик по нему не угадывает молча, что
 * открыть, а предлагает выбор прямо у слова. Стрелки и Enter, Esc и клик мимо
 * закрывают меню.
 */
export function QuoteChoiceMenu({ x, y, choices, summaryTone, onPick, onClose }: QuoteChoiceMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [onClose])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length]?.focus()
    } else if (event.key === 'Escape') {
      // Полноэкранный режим слушает Esc на window: меню закрывается, режим остаётся.
      event.preventDefault()
      event.stopPropagation()
      onClose()
    } else if (event.key === 'Tab') {
      onClose()
    }
  }

  const left = Math.max(EDGE, Math.min(x - 16, window.innerWidth - MENU_WIDTH - EDGE))
  const top = Math.min(y + 12, window.innerHeight - EDGE - 44 * choices.length)
  return (
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label={t('quoteChoice.label')}
      style={{ left, top, width: MENU_WIDTH, '--summary-tone': `var(--cover-${summaryTone})` } as CSSProperties}
      onKeyDown={handleKeyDown}
    >
      {choices.map((choice) => (
        <button
          key={`${choice.kind}:${choice.noteId}`}
          type="button"
          role="menuitem"
          className={styles.item}
          onClick={() => onPick(choice)}
        >
          <span className={choice.kind === 'summary' ? styles.summaryMark : styles.noteMark} aria-hidden="true" />
          <span className={styles.text}>
            {t(choice.kind === 'summary' ? 'quoteChoice.summary' : 'quoteChoice.note', { title: choice.title })}
          </span>
        </button>
      ))}
    </div>
  )
}
