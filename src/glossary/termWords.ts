import { cleanTermText } from './termMatch.ts'

/** Термин — слово или словосочетание: длиннее уже не термин, а фраза. */
export const MAX_TERM_WORDS = 8
/** Выделение длиннее — предложение или абзац: круг «В глоссарий» над ним не показываем. */
export const MAX_SELECTION_WORDS = 20

/** Слова, включённые в термин: непрерывный отрезок `[from, to]` слов выделения. */
export interface WordRange {
  from: number
  to: number
}

/** Артикли в начале выделения по языку (первые три буквы кода NLLB: `eng_Latn` → `eng`). */
const ARTICLES: Record<string, readonly string[]> = {
  eng: ['the', 'a', 'an'],
  deu: ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer'],
  fra: ['le', 'la', 'les', "l'", 'l’', 'un', 'une', 'des'],
  spa: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas'],
  ita: ['il', 'lo', 'la', 'i', 'gli', 'le', "l'", 'l’', 'un', 'uno', 'una'],
  por: ['o', 'a', 'os', 'as', 'um', 'uma'],
  nld: ['de', 'het', 'een'],
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

export function countWords(text: string) {
  return splitWords(cleanTermText(text)).length
}

/** Выделение может стать термином (с обрезкой лишнего). */
export function canBeTerm(text: string) {
  const count = countWords(text)
  return count > 0 && count <= MAX_SELECTION_WORDS
}

const bare = (word: string) => word.replace(EDGE_PUNCTUATION, '').toLocaleLowerCase()

/**
 * Что сразу отрезать: слова без букв и цифр по краям («—», «,»), а в начале — артикль
 * языка выделения. Хотя бы одно слово остаётся.
 */
export function autoRange(words: readonly string[], language: string): { range: WordRange; article: string | null } {
  const articles = ARTICLES[language.slice(0, 3)] ?? []
  let from = 0
  let to = words.length - 1
  while (from < to && !LETTER_OR_DIGIT.test(words[from])) from += 1
  while (to > from && !LETTER_OR_DIGIT.test(words[to])) to -= 1
  let article: string | null = null
  if (from < to && articles.includes(bare(words[from]))) {
    article = words[from].replace(EDGE_PUNCTUATION, '')
    from += 1
  }
  return { range: { from, to }, article }
}

/** Текст термина из включённых слов: знаки по краям отрезаны. */
export function rangeText(words: readonly string[], range: WordRange) {
  return cleanTermText(words.slice(range.from, range.to + 1).join(' '))
}

/** Отрезаны ли знаки препинания: у крайних слов или целые слова-знаки по краям. */
export function hasTrimmedPunctuation(words: readonly string[], range: WordRange) {
  const joined = words.slice(range.from, range.to + 1).join(' ')
  const edgeWords = words.slice(0, range.from).concat(words.slice(range.to + 1))
  return cleanTermText(joined) !== joined || edgeWords.some((word) => !LETTER_OR_DIGIT.test(word))
}

/**
 * Щелчок по слову-чипу:
 * - крайнее слово термина убирается (последнее оставшееся — нет);
 * - слово в середине — термин обрезается перед ним («keeper | of the light» → «keeper»);
 * - убранное слово возвращается вместе со всеми между ним и термином.
 */
export function clickWord(range: WordRange, index: number): WordRange {
  if (index < range.from) return { ...range, from: index }
  if (index > range.to) return { ...range, to: index }
  if (range.from === range.to) return range
  if (index === range.from) return { ...range, from: index + 1 }
  if (index === range.to) return { ...range, to: index - 1 }
  return { ...range, to: index - 1 }
}

/** Что сделает щелчок по слову — для подписи кнопки. */
export function wordAction(range: WordRange, index: number): 'restore' | 'remove' | 'cut' | 'keep' {
  if (index < range.from || index > range.to) return 'restore'
  if (range.from === range.to) return 'keep'
  if (index === range.from || index === range.to) return 'remove'
  return 'cut'
}
