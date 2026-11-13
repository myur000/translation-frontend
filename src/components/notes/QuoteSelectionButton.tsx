import { useTranslation } from '../../i18n/useTranslation.ts'
import type { ActiveQuoteSelection } from '../../hooks/useQuoteSelection.ts'
import styles from './QuoteSelectionButton.module.css'

const BUTTON_WIDTH = 132
const BUTTON_HEIGHT = 36
const GAP = 8

interface QuoteSelectionButtonProps {
  selection: ActiveQuoteSelection
  onQuote: () => void
}

/** Кнопка над выделенным текстом книги. Положение — от прямоугольника выделения. */
export function QuoteSelectionButton({ selection, onQuote }: QuoteSelectionButtonProps) {
  const { t } = useTranslation()
  const { rect } = selection
  // Выделение ушло за край экрана при прокрутке — кнопку не показываем.
  if (rect.top + rect.height < 0 || rect.top > window.innerHeight) return null
  // Над выделением, а если сверху нет места (под плавающей шапкой) — под ним.
  const above = rect.top - BUTTON_HEIGHT - GAP
  const top = above > 64 ? above : Math.min(rect.top + rect.height + GAP, window.innerHeight - BUTTON_HEIGHT - GAP)
  const left = Math.max(GAP, Math.min(rect.left + rect.width / 2 - BUTTON_WIDTH / 2, window.innerWidth - BUTTON_WIDTH - GAP))
  return (
    <button
      type="button"
      className={styles.button}
      style={{ top, left, width: BUTTON_WIDTH }}
      // mousedown не снимает выделение: иначе текст пропадёт раньше, чем мы его прочитаем.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onQuote}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M5.5 3h6.5l3.5 3.5v9A1.5 1.5 0 0 1 14 17H5.5A1.5 1.5 0 0 1 4 15.5v-11A1.5 1.5 0 0 1 5.5 3Z" />
        <path d="M10 8.5v5M7.5 11h5" />
      </svg>
      {t('quote.toNote')}
    </button>
  )
}
