import { useTranslation } from '../../i18n/useTranslation.ts'
import type { ActiveQuoteSelection } from '../../hooks/useQuoteSelection.ts'
import { GlyphIcon } from '../ui/GlyphIcon.tsx'
import styles from './QuoteSelectionButton.module.css'

const NOTE_WIDTH = 132
const SUMMARY_WIDTH = 140
const BUTTON_HEIGHT = 36
const GLOSSARY_WIDTH = BUTTON_HEIGHT
/** Между «таблеткой» и кругом глоссария. */
const SPLIT = 6
const GAP = 8

interface QuoteSelectionButtonProps {
  selection: ActiveQuoteSelection
  onQuote: () => void
  /** «В конспект»: дописать выделение в текущий конспект книги; без него кнопки нет. */
  onSummary?: () => void
  /** «В глоссарий»: отдельный круг со знаком «文A»; без него круга нет. */
  onGlossary?: () => void
}

/**
 * Кнопки над выделенным текстом книги: «В заметку» — отдельная мысль у абзаца,
 * «В конспект» — выписка в тетрадь книги, круг «文A» — термин в глоссарий. Положение — от прямоугольника выделения.
 */
export function QuoteSelectionButton({ selection, onQuote, onSummary, onGlossary }: QuoteSelectionButtonProps) {
  const { t } = useTranslation()
  const { rect } = selection
  const pillWidth = NOTE_WIDTH + (onSummary ? SUMMARY_WIDTH : 0)
  const width = pillWidth + (onGlossary ? SPLIT + GLOSSARY_WIDTH : 0)
  // Выделение ушло за край экрана при прокрутке — кнопки не показываем.
  if (rect.top + rect.height < 0 || rect.top > window.innerHeight) return null
  // Над выделением, а если сверху нет места (под плавающей шапкой) — под ним.
  const above = rect.top - BUTTON_HEIGHT - GAP
  const top = above > 64 ? above : Math.min(rect.top + rect.height + GAP, window.innerHeight - BUTTON_HEIGHT - GAP)
  const left = Math.max(GAP, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - GAP))
  return (
    <div className={styles.bar} role="group" aria-label={t('quote.selectionActions')} style={{ top, left, width }}>
      <div className={styles.group} style={{ width: pillWidth }}>
        <button
          type="button"
          className={styles.button}
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
        {onSummary ? (
          <button
            type="button"
            className={styles.button}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onSummary}
          >
            {/* Тетрадь с корешком — значок конспекта везде, где он есть. */}
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M5.5 3h9.3a1.2 1.2 0 0 1 1.2 1.2v11.6a1.2 1.2 0 0 1-1.2 1.2H5.5Z" />
              <path d="M5.5 3v14M3.5 6.5h3.4M3.5 10h3.4M3.5 13.5h3.4" />
            </svg>
            {t('quote.toSummary')}
          </button>
        ) : null}
      </div>
      {onGlossary ? (
        <button
          type="button"
          className={styles.glossary}
          aria-label={t('glossary.toGlossary')}
          title={t('glossary.toGlossary')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onGlossary}
        >
          <GlyphIcon name="glossary" />
        </button>
      ) : null}
    </div>
  )
}
