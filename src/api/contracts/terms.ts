import type { ISO8601DateTime, UUID } from './common.ts'

export interface TermListItem {
  id: UUID
  term: string
  translation: string
  source_lang: string
  target_lang: string
  document_count: number
  updated_at: ISO8601DateTime
}

export interface TermListResponse {
  items: TermListItem[]
  page: number
  size: number
  total_elements: number
  total_pages: number
}

export interface TermListQuery {
  q?: string
  source_lang?: string
  target_lang?: string
  job_id?: string
  page?: number
  size?: number
}

/** Книга, к которой привязан термин; удалённая остаётся в списке с `document_available: false`. */
export interface TermDocument {
  job_id: UUID
  document_name: string
  document_available: boolean
  linked_at: ISO8601DateTime
}

/** GET/POST/PUT /api/terms/{id}. */
export interface TermResponse {
  id: UUID
  term: string
  translation: string
  source_lang: string
  target_lang: string
  created_at: ISO8601DateTime
  updated_at: ISO8601DateTime
  documents: TermDocument[]
}

/**
 * POST /api/terms. С `job_id` пара языков берётся из книги и термин сразу к ней
 * привязан; без него нужны оба языка. Термин — до 200 символов, перевод — до 500,
 * оба в одну строку. `409` — такой термин в паре уже есть или достигнут предел.
 */
export interface TermCreateRequest {
  term: string
  translation: string
  source_lang?: string
  target_lang?: string
  job_id?: UUID
}

/** PUT /api/terms/{id}: пара языков не меняется. */
export interface TermUpdateRequest {
  term: string
  translation: string
}
