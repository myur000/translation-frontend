import styles from './GlyphIcon.module.css'

export type GlyphName = 'plus' | 'arrowLeft' | 'history' | 'notes' | 'books' | 'search' | 'chevronUp' | 'check' | 'warning'

/** Контуры в сетке 16×16, рисуются линией цвета текста. */
const GLYPH_PATHS: Record<GlyphName, string> = {
  plus: 'M8 3v10M3 8h10',
  arrowLeft: 'M13 8H3.5m0 0L7 4.5M3.5 8 7 11.5',
  history: 'M3.2 6.2A5.2 5.2 0 1 1 3 9.6M3 3v3.4h3.4M8 5.3V8l1.9 1.4',
  notes: 'M4 2.5h5.2L12 5.3v8.2H4zM9.2 2.5v2.8H12M6.2 8.2h3.6M6.2 10.7h2.4',
  // Три корешка на полке, крайний наклонён.
  books: 'M2.8 2.8h2.6v10.4H2.8zM6.7 2.8h2.6v10.4H6.7zM10.4 3.6l2.5-.7 2.1 9.9-2.5.6z',
  search: 'M7 11.6a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2zM10.4 10.4l3.2 3.2',
  chevronUp: 'm4 10 4-4 4 4',
  check: 'm3.5 8.5 3 3 6-7',
  // Треугольник с восклицательным знаком: предупреждение читается не только цветом.
  warning: 'M8 2.4 14.2 13.2H1.8ZM8 6.4v3M8 11.2v.1',
}

interface GlyphIconProps {
  name: GlyphName
  className?: string
}

/**
 * Значок размером с букву вместо символов «＋ ← ↺ ⌃ ✓». В шрифтах интерфейса
 * (Golos, Literata) этих символов нет, и браузер брал их из системных шрифтов:
 * на каждой ОС они выглядели по-своему, а «＋» на macOS рисовался китайским шрифтом.
 */
export function GlyphIcon({ name, className }: GlyphIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={`${styles.glyph} ${name === 'warning' ? styles.warning : ''} ${className ?? ''}`}>
      <path d={GLYPH_PATHS[name]} />
    </svg>
  )
}
