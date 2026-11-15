/**
 * Цитаты внутри текста заметки. Это обычная Markdown-цитата, последняя строка
 * которой — ссылка на цитату с сервера:
 *
 *     > Незадолго до полуночи он увидел свет…
 *     > — [¶5 · перевод](quote:3f2a…)
 *
 * В приложении блок рисуется карточкой цитаты («В книге →», второй язык), а в
 * любом другом месте (экспорт, исходник) остаётся читаемой цитатой. Сама цитата
 * по-прежнему хранится на сервере: метки на полях, подсветка и граф её видят.
 */

export const QUOTE_LINK_SCHEME = 'quote:'

/** Текст заметки, разрезанный на обычный Markdown и цитаты из книг. */
export type BodySegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'quote'; quoteId: string; text: string; label: string }

const QUOTE_LINE = /^ {0,3}>/
const QUOTE_PREFIX = /^ {0,3}> ?/
const SOURCE_LINE = /^ {0,3}>\s*—\s*\[([^\]\n]*)\]\(quote:([\w-]+)\)\s*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * Разрезает текст на Markdown и цитаты. Цитатой считается только блок `>`, который
 * кончается строкой-источником; внутри блоков кода ничего не ищется.
 */
export function splitQuoteEmbeds(body: string): BodySegment[] {
  const lines = body.split('\n')
  const segments: BodySegment[] = []
  let markdown: string[] = []
  let fence: string | null = null
  const flush = () => {
    const text = markdown.join('\n')
    if (text.trim()) segments.push({ kind: 'markdown', text })
    markdown = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMark = FENCE.exec(line)?.[1]
    if (fence) {
      if (fenceMark && fenceMark[0] === fence[0] && fenceMark.length >= fence.length) fence = null
      markdown.push(line)
      continue
    }
    if (fenceMark) {
      fence = fenceMark
      markdown.push(line)
      continue
    }
    if (!QUOTE_LINE.test(line)) {
      markdown.push(line)
      continue
    }
    let end = index
    while (end + 1 < lines.length && QUOTE_LINE.test(lines[end + 1])) end += 1
    const block = lines.slice(index, end + 1)
    const source = SOURCE_LINE.exec(block[block.length - 1])
    if (source && block.length > 1) {
      flush()
      segments.push({
        kind: 'quote',
        quoteId: source[2],
        label: source[1].trim(),
        text: block.slice(0, -1).map((item) => item.replace(QUOTE_PREFIX, '')).join('\n').trim(),
      })
    } else {
      markdown.push(...block)
    }
    index = end
  }
  flush()
  return segments
}

/** Какие цитаты уже стоят в тексте: остальные показываются отдельно, чтобы не потерялись. */
export function embeddedQuoteIds(body: string) {
  return new Set(splitQuoteEmbeds(body).flatMap((segment) => (segment.kind === 'quote' ? [segment.quoteId] : [])))
}

/** Блок цитаты для текста заметки; `where` — подпись источника («¶5 · перевод»). */
export function quoteEmbed(quote: { id: string; quote: string }, where: string) {
  const lines = quote.quote.trim().split(/\r?\n/).filter((line) => line.trim())
  return [...lines.map((line) => `> ${line}`), `> — [${where.replace(/[[\]]/g, '')}](${QUOTE_LINK_SCHEME}${quote.id})`].join('\n')
}

/** Подпись источника: номер абзаца с единицы и сторона («¶5 · перевод»). */
export function quoteWhere(paragraphIndex: number, sideLabel: string) {
  return `¶${paragraphIndex + 1} · ${sideLabel.toLocaleLowerCase()}`
}
