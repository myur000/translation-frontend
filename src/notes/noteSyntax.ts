/**
 * Синтаксис заметок в духе Obsidian. Правила повторяют backend
 * (`NoteRules`, `NoteMarkup`): что frontend подсвечивает как ссылку или тег,
 * то backend и сохраняет как связь.
 */

export const NOTE_TITLE_MAX_LENGTH = 200
export const NOTE_BODY_MAX_LENGTH = 50_000
const TAG_MAX_LENGTH = 100
/** Символы со значением внутри `[[Название#Заголовок^блок|подпись]]`. */
const TITLE_FORBIDDEN = /[[\]|#^]/
// eslint-disable-next-line no-control-regex -- управляющие символы и есть то, что запрещено
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

export type NoteTitleProblem = 'empty' | 'tooLong' | 'forbidden'

/** Ошибка названия до отправки на сервер; `null` — название допустимо. */
export function noteTitleProblem(raw: string): NoteTitleProblem | null {
  const title = raw.trim()
  if (!title) return 'empty'
  if (title.length > NOTE_TITLE_MAX_LENGTH) return 'tooLong'
  if (TITLE_FORBIDDEN.test(title) || CONTROL.test(title)) return 'forbidden'
  return null
}

// type, а не interface: значение кладётся в Token.meta, который ждёт индексную сигнатуру.
export type WikiLink = {
  /** Название заметки; `null` — ссылка внутри той же заметки (`[[#Заголовок]]`) или недопустимое название. */
  target: string | null
  /** Что показать в тексте: подпись после `|` или исходный текст ссылки. */
  label: string
}

/** Разбирает содержимое `[[…]]`: «Название#Заголовок|подпись» → цель «Название». */
export function parseWikiLink(inner: string): WikiLink {
  const aliasAt = inner.indexOf('|')
  const reference = aliasAt >= 0 ? inner.slice(0, aliasAt) : inner
  const alias = aliasAt >= 0 ? inner.slice(aliasAt + 1).trim() : ''
  const anchorAt = reference.search(/[#^]/)
  const target = (anchorAt >= 0 ? reference.slice(0, anchorAt) : reference).trim()
  return {
    target: noteTitleProblem(target) === null ? target : null,
    label: alias || reference.trim(),
  }
}

/** Ключ сравнения названий: backend ищет заметку по названию без учёта регистра. */
export function noteTitleKey(title: string) {
  return title.trim().toLocaleLowerCase('ru')
}

/** Символы, после которых `#` не начинает тег (как lookbehind в backend). */
const TAG_BLOCKED_BEFORE = /[\p{L}\p{N}_#/&[]/u
const TAG_BODY = /^[\p{L}\p{N}_/-]+/u

/** Тег, начинающийся в `text[position]` с символа `#`, или `null`. */
export function readTag(text: string, position: number): { raw: string; tag: string } | null {
  if (text[position] !== '#') return null
  if (position > 0 && TAG_BLOCKED_BEFORE.test(text[position - 1])) return null
  const match = TAG_BODY.exec(text.slice(position + 1))
  if (!match) return null
  const tag = match[0].replace(/^\/+|\/+$/g, '')
  if (!tag || tag.length > TAG_MAX_LENGTH || /^\p{N}+$/u.test(tag)) return null
  return { raw: `#${match[0]}`, tag: tag.toLocaleLowerCase('ru') }
}

/**
 * Начало текста заметки (`excerpt` от backend — сырой Markdown) без разметки:
 * `[[Название|подпись]]` → «подпись», `**жирный**` → «жирный». Теги остаются: это часть смысла.
 */
export function plainExcerpt(markdown: string) {
  return markdown
    .replace(/\[\[([^[\]\n]+?)\]\]/g, (_match, inner: string) => parseWikiLink(inner).label)
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/(\*\*|__|~~|`)(.+?)\1/g, '$2')
    .replace(/(^|[^\p{L}\p{N}*_])[*_]([^*_\n]+)[*_](?=$|[^\p{L}\p{N}*_])/gu, '$1$2')
    .replace(/`{3,}|~{3,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Название новой заметки из цитаты: начало фразы целыми словами, без символов ссылок. */
export function titleFromQuote(quote: string, maxLength = 60) {
  const clean = quote.replace(/[[\]|#^]/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  const cut = clean.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:—-]+$/, '')}…`
}

/** Текст дописывается в конец заметки отдельным абзацем; пустой ничего не меняет. */
export function appendToBody(body: string, text: string) {
  const addition = text.trim()
  if (!addition) return body
  const base = body.trimEnd()
  return base ? `${base}\n\n${addition}` : addition
}
