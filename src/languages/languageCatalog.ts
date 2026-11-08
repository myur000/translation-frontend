import type { LanguageResponse } from '../api/contracts/languages.ts'
import { getLanguages } from '../api/languages.ts'

export type LanguageCatalogStatus = 'idle' | 'loading' | 'ready' | 'error'
export type LanguageLabelLocale = 'ru' | 'en'

export interface LanguageCatalogState {
  status: LanguageCatalogStatus
  languages: readonly LanguageResponse[]
  /** Код NLLB → русское название с бэкенда. */
  names: ReadonlyMap<string, string>
}

export const DEFAULT_SOURCE_LANGUAGE = 'eng_Latn'
export const DEFAULT_TARGET_LANGUAGE = 'rus_Cyrl'

/** Показываются первыми в списке и доступны, даже если каталог не загрузился. */
export const POPULAR_LANGUAGES: readonly string[] = [
  'rus_Cyrl',
  'eng_Latn',
  'deu_Latn',
  'fra_Latn',
  'spa_Latn',
  'ita_Latn',
  'zho_Hans',
  'jpn_Jpan',
]

/** Документы, загруженные до перехода на NLLB, всё ещё хранят эти коды. */
const LEGACY_CODES: Readonly<Record<string, string>> = {
  en: 'eng_Latn',
  ru: 'rus_Cyrl',
  de: 'deu_Latn',
}

/**
 * Языки, которые есть в каталоге более чем в одной письменности. Английские
 * названия для них получают имя письменности, например «Chinese (Simplified Han)».
 */
const MULTI_SCRIPT_LANGUAGES = new Set([
  'ace', 'arb', 'bjn', 'kas', 'knc', 'min', 'taq', 'zho',
])

const NLLB_CODE = /^([a-z]{2,3})_([A-Z][a-z]{3})$/

const EMPTY_STATE: LanguageCatalogState = {
  status: 'idle',
  languages: [],
  names: new Map(),
}

let state = EMPTY_STATE
let pending: Promise<void> | null = null
const listeners = new Set<() => void>()

function setState(next: LanguageCatalogState) {
  state = next
  listeners.forEach((listener) => listener())
}

export function subscribeLanguageCatalog(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getLanguageCatalogState() {
  return state
}

/** Загружает каталог один раз на страницу; неудачную загрузку можно повторить. */
export function loadLanguageCatalog(): Promise<void> {
  if (state.status === 'ready') return Promise.resolve()
  if (pending) return pending

  setState({ ...state, status: 'loading' })
  pending = getLanguages()
    .then((languages) => {
      setState({
        status: 'ready',
        languages,
        names: new Map(languages.map((item) => [item.code, item.name])),
      })
    })
    .catch(() => {
      setState({ ...state, status: 'error' })
    })
    .finally(() => {
      pending = null
    })
  return pending
}

export function resetLanguageCatalogForTests() {
  pending = null
  state = EMPTY_STATE
}

/** Переводит старый двухбуквенный код в код NLLB; остальные коды возвращаются как есть. */
export function toCatalogLanguageCode(code: string) {
  return LEGACY_CODES[code] ?? code
}

/** Тег BCP 47 для HTML-атрибута `lang`: `eng_Latn` → `en-Latn`. */
export function languageTag(code: string) {
  const match = NLLB_CODE.exec(code)
  const candidate = match ? `${match[1]}-${match[2]}` : code
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? undefined
  } catch {
    return undefined
  }
}

/** Короткая подпись для списков: `eng_Latn` → `EN`, `yue_Hant` → `YUE`. */
export function shortLanguageCode(code: string) {
  return (languageTag(code) ?? code).split('-')[0].toUpperCase()
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>()

function displayNames(locale: LanguageLabelLocale, type: 'language' | 'script') {
  const key = `${locale}:${type}`
  if (!displayNamesCache.has(key)) {
    try {
      displayNamesCache.set(
        key,
        new Intl.DisplayNames([locale], { type, fallback: 'none' }),
      )
    } catch {
      displayNamesCache.set(key, null)
    }
  }
  return displayNamesCache.get(key) ?? null
}

function capitalize(value: string) {
  return value ? value[0].toLocaleUpperCase() + value.slice(1) : value
}

function intlLanguageName(code: string, locale: LanguageLabelLocale) {
  const match = NLLB_CODE.exec(code)
  const language = match ? match[1] : code
  let name: string | undefined
  try {
    name = displayNames(locale, 'language')?.of(language)
  } catch {
    return null
  }
  if (!name || name.toLowerCase() === language) return null

  if (match && MULTI_SCRIPT_LANGUAGES.has(language)) {
    let script: string | undefined
    try {
      script = displayNames(locale, 'script')?.of(match[2])
    } catch {
      script = undefined
    }
    if (script) return `${capitalize(name)} (${script})`
  }
  return capitalize(name)
}

/**
 * Понятное человеку название языка. Для русского берётся каталог бэкенда — он
 * источник истины; английское даёт Intl. Неизвестные коды (старые документы,
 * каталог не загружен, нет данных Intl) деградируют до русского названия или самого кода.
 */
export function formatLanguageName(
  code: string,
  locale: LanguageLabelLocale,
  names: ReadonlyMap<string, string> = state.names,
) {
  const catalogName = names.get(code)
  if (locale === 'ru' && catalogName) return catalogName
  return intlLanguageName(code, locale) ?? catalogName ?? code
}
