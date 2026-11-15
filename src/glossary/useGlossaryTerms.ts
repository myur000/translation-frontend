import { useCallback, useEffect, useState } from 'react'
import type { TermListItem, TermResponse } from '../api/contracts/terms.ts'
import { getTerms } from '../api/terms.ts'
import { useAuth } from '../auth/useAuth.ts'

/** Лимит сервера. */
const PAGE_SIZE = 100
/** Больше выражение на колонку становится слишком тяжёлым. */
const MAX_PAGES = 20

interface Loaded {
  key: string
  terms: TermListItem[]
}

export interface GlossaryTerms {
  terms: TermListItem[]
  isLoaded: boolean
  upsert: (term: TermResponse) => void
}

const toListItem = (term: TermResponse): TermListItem => ({
  id: term.id,
  term: term.term,
  translation: term.translation,
  source_lang: term.source_lang,
  target_lang: term.target_lang,
  document_count: term.documents.length,
  updated_at: term.updated_at,
})

/** Глоссарий общий для пары, поэтому в книге видны и термины из других книг. */
export function useGlossaryTerms(sourceLanguage: string | null, targetLanguage: string | null): GlossaryTerms {
  const { session } = useAuth()
  const accessToken = session?.accessToken ?? null
  const key = sourceLanguage && targetLanguage && sourceLanguage !== targetLanguage
    ? `${session?.email ?? ''}\n${sourceLanguage}>${targetLanguage}`
    : null
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!key || !accessToken || !sourceLanguage || !targetLanguage) return
    const controller = new AbortController()
    const load = async () => {
      const terms: TermListItem[] = []
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const response = await getTerms(
          { source_lang: sourceLanguage, target_lang: targetLanguage, page, size: PAGE_SIZE },
          { accessToken, signal: controller.signal },
        )
        terms.push(...response.items)
        if (page + 1 >= response.total_pages) break
      }
      return terms
    }
    load().then(
      (terms) => { if (!controller.signal.aborted) setLoaded({ key, terms }) },
      () => { if (!controller.signal.aborted) setLoaded({ key, terms: [] }) },
    )
    return () => controller.abort()
  }, [accessToken, key, sourceLanguage, targetLanguage])

  const upsert = useCallback((term: TermResponse) => {
    setLoaded((current) => {
      if (!current) return current
      const item = toListItem(term)
      const others = current.terms.filter((existing) => existing.id !== term.id)
      return { ...current, terms: [...others, item] }
    })
  }, [])

  const isLoaded = Boolean(key) && loaded?.key === key
  return { terms: isLoaded ? loaded!.terms : NO_TERMS, isLoaded, upsert }
}

const NO_TERMS: TermListItem[] = []
