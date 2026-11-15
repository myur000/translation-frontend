import styles from './GlyphIcon.module.css'

export type GlyphName = 'plus' | 'arrowLeft' | 'history' | 'notes' | 'graph' | 'books' | 'glossary' | 'search' | 'chevronUp' | 'check' | 'warning'
  | 'user' | 'card' | 'gear' | 'logout'

/** Контуры в сетке 16×16, рисуются линией цвета текста. */
const GLYPH_PATHS: Record<GlyphName, string> = {
  plus: 'M8 3v10M3 8h10',
  arrowLeft: 'M13 8H3.5m0 0L7 4.5M3.5 8 7 11.5',
  history: 'M3.2 6.2A5.2 5.2 0 1 1 3 9.6M3 3v3.4h3.4M8 5.3V8l1.9 1.4',
  notes: 'M4 2.5h5.2L12 5.3v8.2H4zM9.2 2.5v2.8H12M6.2 8.2h3.6M6.2 10.7h2.4',
  // Три узла и связи между ними — граф заметок.
  graph: 'M5.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0M13.5 4a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0M9.5 12a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0M5.5 4.8l5-.6M4.8 6.4l2.5 4.2M11.3 5.4l-2.5 5.2',
  // Три корешка на полке, крайний наклонён.
  books: 'M2.8 2.8h2.6v10.4H2.8zM6.7 2.8h2.6v10.4H6.7zM10.4 3.6l2.5-.7 2.1 9.9-2.5.6z',
  // «文A» — знак глоссария: иероглиф и латинская буква.
  glossary: 'M4.5 1.8v1.4M1.5 3.4h6M6.2 3.4C5.7 5.6 4.2 7.6 1.8 8.9M2.8 3.4c.6 2.1 2.1 4 4.5 5.3M7.6 14.4 10.6 6.6h.8l3 7.8M8.7 11.9h4.6',
  search: 'M7 11.6a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2zM10.4 10.4l3.2 3.2',
  chevronUp: 'm4 10 4-4 4 4',
  check: 'm3.5 8.5 3 3 6-7',
  // Треугольник с восклицательным знаком: предупреждение читается не только цветом.
  warning: 'M8 2.4 14.2 13.2H1.8ZM8 6.4v3M8 11.2v.1',
  // Пункты меню аккаунта: профиль, тариф, настройки, выход.
  user: 'M8 8a2.8 2.8 0 1 0 0-5.6A2.8 2.8 0 0 0 8 8zM2.8 13.6c.6-2.6 2.7-4 5.2-4s4.6 1.4 5.2 4',
  card: 'M2 4.2h12v7.6H2zM2 6.8h12M4.4 9.6h2.4',
  gear: 'M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM8 1.8v1.9M8 12.3v1.9M1.8 8h1.9M12.3 8h1.9M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M3.6 12.4l1.3-1.3M11.1 4.9l1.3-1.3',
  logout: 'M6.5 2.5H3.2v11h3.3M7 8h6.5M10.8 5.2 13.5 8l-2.7 2.8',
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
