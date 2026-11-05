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
