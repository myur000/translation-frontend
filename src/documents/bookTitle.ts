/**
 * Название книги для полки: имя файла без расширения, дефисы и подчёркивания —
 * пробелы, первая буква заглавная. «lighthouse-keepers-ledger.docx» →
 * «Lighthouse keepers ledger». Само имя файла остаётся в подсказке и меню.
 */
export function bookTitle(fileName: string) {
  const title = fileName
    .replace(/\.[^.\s]{1,5}$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!title) return fileName
  return title.charAt(0).toLocaleUpperCase() + title.slice(1)
}

/** Буква на обложке: первая буква или цифра названия. */
export function coverInitial(title: string) {
  return title.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase() ?? '•'
}

/**
 * Число тонов обложек (`--cover-0` … в styles/tokens.css). Тон выбирается по
 * имени файла, а не по задаче: перевод той же книги на другой язык — та же обложка.
 */
export const COVER_TONES = 6

export function coverTone(fileName: string) {
  let hash = 0
  for (const char of fileName.toLocaleLowerCase()) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return hash % COVER_TONES
}

/** Поиск по полке: без учёта регистра и разницы «ё/е», по названию и имени файла. */
export function matchesBookQuery(fileName: string, query: string) {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
  const needle = normalize(query)
  if (!needle) return true
  return normalize(bookTitle(fileName)).includes(needle) || normalize(fileName).includes(needle)
}
