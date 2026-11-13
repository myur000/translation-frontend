import type { NoteQuoteRequest, NoteQuoteSide } from '../api/contracts/notes.ts'
import type { DocumentText } from '../api/documentText.ts'

/** Пределы backend для цитаты и парного абзаца. */
export const QUOTE_MAX_LENGTH = 2000
export const PAIRED_TEXT_MAX_LENGTH = 4000

/** Выделение в колонке документа, ещё не привязанное к абзацу. */
export interface QuoteSelection {
  side: NoteQuoteSide
  /** Выделенный текст как его вернул браузер. */
  text: string
  /** Текст блока (абзаца, пункта, ячейки), где началось выделение: уточняет абзац при повторах. */
  blockText: string | null
  /** Номер абзаца, если колонка показывает текст с сервера (`data-paragraph-index`). */
  paragraphIndex: number | null
}

export type QuoteLocation =
  | { status: 'found'; quote: Omit<NoteQuoteRequest, 'job_id'>; truncated: boolean }
  | { status: 'sourceRemoved' }
  | { status: 'notFound' }

/** Сравнение текстов из разных источников: DOM, PDF-слой и `/text` расходятся в пробелах и переносах. */
export function normalizeQuoteText(text: string) {
  return text
    .replace(/­/g, '')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Находит абзац `/text`, из которого сделано выделение. Backend хранит номер абзаца,
 * а смещения внутри него — нет: «frontend находит цитату в абзаце по тексту».
 * Выделение через несколько абзацев привязывается к первому из них.
 */
export function locateQuote(selection: QuoteSelection, text: DocumentText): QuoteLocation {
  if (selection.side === 'SOURCE' && !text.sourceAvailable) return { status: 'sourceRemoved' }
  const sideText = (index: number) => {
    const paragraph = text.paragraphs[index]
    return (selection.side === 'SOURCE' ? paragraph?.source : paragraph?.translation) ?? ''
  }
  const quote = normalizeQuoteText(selection.text)
  if (!quote) return { status: 'notFound' }
  // Опорный кусок — первая строка выделения: дальше оно может уйти в следующий абзац,
  // причём в PDF — без переноса строки между абзацами.
  const firstLine = normalizeQuoteText(selection.text.split(/\n+/).find((line) => line.trim()) ?? '')
  const head = firstLine.slice(0, 12)
  const block = selection.blockText ? normalizeQuoteText(selection.blockText) : ''
  /** Выделение начинается в этом абзаце: целиком внутри него или с его хвоста уходит дальше. */
  const startsIn = (position: number) => {
    const paragraph = normalizeQuoteText(sideText(position))
    if (paragraph.includes(firstLine.slice(0, 200))) return true
    for (let at = paragraph.indexOf(head); at >= 0; at = paragraph.indexOf(head, at + 1)) {
      if (firstLine.startsWith(paragraph.slice(at))) return true
    }
    return false
  }

  let index = selection.paragraphIndex !== null && startsIn(selection.paragraphIndex) ? selection.paragraphIndex : -1
  if (index < 0) {
    const candidates = text.paragraphs.map((_, position) => position).filter(startsIn)
    // Одна и та же фраза может встречаться в нескольких абзацах: блок, где началось выделение, решает.
    index = candidates.find((position) => block && normalizeQuoteText(sideText(position)) === block)
      ?? candidates.find((position) => block && block.includes(normalizeQuoteText(sideText(position))))
      ?? candidates.find((position) => block && normalizeQuoteText(sideText(position)).includes(block))
      ?? candidates[0]
      ?? -1
  }
  if (index < 0) return { status: 'notFound' }

  const paragraph = text.paragraphs[index]
  const paired = text.aligned
    ? (selection.side === 'SOURCE' ? paragraph.translation : paragraph.source)
    : null
  return {
    status: 'found',
    truncated: quote.length > QUOTE_MAX_LENGTH,
    quote: {
      side: selection.side,
      paragraph_index: paragraph.index,
      quote: clip(quote, QUOTE_MAX_LENGTH),
      paired_text: paired ? clip(paired, PAIRED_TEXT_MAX_LENGTH) : null,
    },
  }
}
