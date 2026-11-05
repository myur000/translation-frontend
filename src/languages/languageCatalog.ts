import type { LanguageResponse } from '../api/contracts/languages.ts'
import { getLanguages } from '../api/languages.ts'

export type LanguageCatalogStatus = 'idle' | 'loading' | 'ready' | 'error'
export type LanguageLabelLocale = 'ru' | 'en'

export interface LanguageCatalogState {
  status: LanguageCatalogStatus
  languages: readonly LanguageResponse[]
  /** NLLB code → Russian name from the backend. */
  names: ReadonlyMap<string, string>
}

export const DEFAULT_SOURCE_LANGUAGE = 'eng_Latn'
export const DEFAULT_TARGET_LANGUAGE = 'rus_Cyrl'

/** Shown first in the picker and available even if the catalog fails to load. */
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

/** Documents uploaded before the NLLB switch still carry these codes. */
const LEGACY_CODES: Readonly<Record<string, string>> = {
  en: 'eng_Latn',
  ru: 'rus_Cyrl',
  de: 'deu_Latn',
}

/**
 * Languages present in the catalog in more than one script. English labels
 * for them get the script name, e.g. "Chinese (Simplified Han)".
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

/** Loads the catalog once per page; a failed load can be retried. */
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

/** Maps a legacy two-letter code to its NLLB code; other codes are returned as is. */
export function toCatalogLanguageCode(code: string) {
  return LEGACY_CODES[code] ?? code
}

/** BCP 47 tag for the HTML `lang` attribute: `eng_Latn` → `en-Latn`. */
export function languageTag(code: string) {
  const match = NLLB_CODE.exec(code)
  const candidate = match ? `${match[1]}-${match[2]}` : code
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? undefined
  } catch {
    return undefined
  }
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
 * Human-readable language name. Russian uses the backend catalog, which is
 * the source of truth; English comes from Intl. Unknown codes (old documents,
 * catalog not loaded, no Intl data) degrade to the Russian name or the code.
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
