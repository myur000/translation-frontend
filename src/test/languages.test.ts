import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatLanguageName,
  getLanguageCatalogState,
  languageTag,
  loadLanguageCatalog,
  resetLanguageCatalogForTests,
  toCatalogLanguageCode,
} from '../languages/languageCatalog.ts'

const names = new Map([
  ['eng_Latn', 'Английский'],
  ['zho_Hans', 'Китайский (упрощённый)'],
  ['acm_Arab', 'Месопотамский арабский'],
])

afterEach(() => {
  resetLanguageCatalogForTests()
  vi.unstubAllGlobals()
})

describe('language labels', () => {
  it('uses backend names in Russian and Intl names in English', () => {
    expect(formatLanguageName('eng_Latn', 'ru', names)).toBe('Английский')
    expect(formatLanguageName('eng_Latn', 'en', names)).toBe('English')
  })

  it('adds the script for languages listed in several scripts', () => {
    expect(formatLanguageName('zho_Hans', 'en', names)).toMatch(/^Chinese \(.+\)$/)
    expect(formatLanguageName('zho_Hans', 'ru', names)).toBe('Китайский (упрощённый)')
  })

  it('falls back to the Russian name or the code when Intl has no data', () => {
    expect(formatLanguageName('acm_Arab', 'en', names)).toBe('Месопотамский арабский')
    expect(formatLanguageName('xyz_Latn', 'en', names)).toBe('xyz_Latn')
  })

  it('labels legacy two-letter codes of old documents', () => {
    expect(formatLanguageName('de', 'ru', names)).toBe('Немецкий')
    expect(formatLanguageName('de', 'en', names)).toBe('German')
    expect(toCatalogLanguageCode('de')).toBe('deu_Latn')
    expect(toCatalogLanguageCode('fra_Latn')).toBe('fra_Latn')
  })

  it('builds BCP 47 tags for the lang attribute', () => {
    expect(languageTag('eng_Latn')).toBe('en-Latn')
    expect(languageTag('pes_Arab')).toBe('fa-Arab')
    expect(languageTag('ru')).toBe('ru')
    expect(languageTag('not a code')).toBeUndefined()
  })
})

describe('language catalog', () => {
  it('requests the catalog once and allows a retry after an error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(
        new Response(JSON.stringify([{ code: 'eng_Latn', name: 'Английский' }]), {
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await loadLanguageCatalog()
    expect(getLanguageCatalogState().status).toBe('error')

    await Promise.all([loadLanguageCatalog(), loadLanguageCatalog()])
    await loadLanguageCatalog()
    expect(getLanguageCatalogState().status).toBe('ready')
    expect(getLanguageCatalogState().names.get('eng_Latn')).toBe('Английский')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/languages')
  })
})
