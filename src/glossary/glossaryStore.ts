import { useEffect, useSyncExternalStore } from 'react'
import type { TermListItem, TermResponse } from '../api/contracts/terms.ts'
import { getTerms } from '../api/terms.ts'
import { useAuth } from '../auth/useAuth.ts'

const PAGE_SIZE = 100
/** Предел сервера — 5000 терминов на аккаунт. */
const MAX_PAGES = 50

export type GlossaryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface State {
  /** Аккаунт, чей это глоссарий. */
  key: string | null
  status: GlossaryStatus
  terms: TermListItem[]
  /** Растёт на каждую правку: выборку терминов книги пора перечитать. */
  revision: number
}

let state: State = { key: null, status: 'idle', terms: [], revision: 0 }
const listeners = new Set<() => void>()
let controller: AbortController | null = null

function setState(next: State) {
  state = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const getSnapshot = () => state

async function loadAll(accessToken: string, signal: AbortSignal) {
  const terms: TermListItem[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await getTerms({ page, size: PAGE_SIZE }, { accessToken, signal })
    terms.push(...response.items)
    if (page + 1 >= response.total_pages) break
  }
  return terms
}

/** Перечитать глоссарий; уже показанный список остаётся на месте, пока идёт загрузка. */
export function loadGlossary(key: string, accessToken: string) {
  controller?.abort()
  const current = new AbortController()
  controller = current
  const isSameAccount = state.key === key
  setState({
    key,
    status: isSameAccount && state.status === 'ready' ? 'ready' : 'loading',
    terms: isSameAccount ? state.terms : [],
    revision: state.revision,
  })
  loadAll(accessToken, current.signal).then(
    (terms) => { if (!current.signal.aborted) setState({ key, status: 'ready', terms, revision: state.revision + 1 }) },
    () => { if (!current.signal.aborted) setState({ ...state, key, status: 'error' }) },
  )
}

export function upsertGlossaryTerm(term: TermResponse) {
  const item: TermListItem = {
    id: term.id,
    term: term.term,
    translation: term.translation,
    source_lang: term.source_lang,
    target_lang: term.target_lang,
    document_count: term.documents.length,
    updated_at: term.updated_at,
  }
  setState({ ...state, terms: [...state.terms.filter((existing) => existing.id !== term.id), item], revision: state.revision + 1 })
}

export function removeGlossaryTerm(termId: string) {
  setState({ ...state, terms: state.terms.filter((existing) => existing.id !== termId), revision: state.revision + 1 })
}

/** Глоссарий аккаунта; `refresh` — перечитать при показе раздела. */
export function useGlossary(enabled: boolean) {
  const { session } = useAuth()
  const accessToken = session?.accessToken ?? null
  const key = session?.email ?? null
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  useEffect(() => {
    if (enabled && key && accessToken) loadGlossary(key, accessToken)
    // Токен обновляется сам по себе — перечитывать из-за этого не нужно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])
  const isOwn = key !== null && snapshot.key === key
  return {
    status: isOwn ? snapshot.status : 'idle' as GlossaryStatus,
    terms: isOwn ? snapshot.terms : NO_TERMS,
    revision: snapshot.revision,
    retry: () => { if (key && accessToken) loadGlossary(key, accessToken) },
  }
}

const NO_TERMS: TermListItem[] = []

/** Только для тестов: глоссарий хранится на модуле. */
export function resetGlossaryStore() {
  controller?.abort()
  controller = null
  state = { key: null, status: 'idle', terms: [], revision: 0 }
}
