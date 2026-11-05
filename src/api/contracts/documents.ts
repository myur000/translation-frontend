import type { ISO8601DateTime, UUID } from './common.ts'

export type TranslationStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
export type TranslationErrorCode = 'TRANSLATION_FAILED'
export type DocumentFileFormat = 'docx' | 'doc' | 'pdf'

export interface DocumentUploadRequest {
  file: File
  source_lang: string
  target_lang: string
  /** Apply the owner's terms for this language pair. */
  use_glossary?: boolean
}

export interface DocumentUploadResponse {
  job_id: UUID
  /** Billing pages charged for this document. */
  billed_units: number
  /** `null` — glossary not requested; `0` — requested, no terms for the pair. */
  glossary_term_count: number | null
}

export interface RetranslationRequest {
  target_lang: string
  use_glossary?: boolean
}

export interface DocumentEstimateResponse {
  format: DocumentFileFormat
  /** Characters with spaces that count toward billing pages. */
  characters: number
  billed_units: number
  unlimited: boolean
  /** `null` for unlimited plans. */
  remaining_units: number | null
  enough_quota: boolean
}

export interface DocumentStatusResponse {
  job_id: UUID
  status: TranslationStatus
  progress: number
  error_code: TranslationErrorCode | null
  error_message: string | null
  /** Cleaned user file name; `null` for jobs created before names were stored. */
  file_name: string | null
  glossary_term_count: number | null
}

export interface DocumentFeedbackRequest {
  rating: number
  comment?: string | null
}

export interface DocumentFeedbackResponse {
  job_id: UUID
  rating: number
  comment: string | null
  created_at: ISO8601DateTime
  updated_at: ISO8601DateTime
}

/** `data` of the `job` event in GET /api/documents/events. */
export interface DocumentJobEvent {
  job_id: UUID
  status: TranslationStatus
  progress: number
}

export interface DocumentHistoryItemResponse {
  job_id: UUID
  source_lang: string
  target_lang: string
  format: DocumentFileFormat
  status: TranslationStatus
  progress: number
  created_at: ISO8601DateTime
  updated_at: ISO8601DateTime
  error_code: TranslationErrorCode | null
  error_message: string | null
  billed_units: number
  file_name: string | null
  glossary_term_count: number | null
}

export interface DocumentHistoryResponse {
  items: DocumentHistoryItemResponse[]
  page: number
  size: number
  total_elements: number
  total_pages: number
  first: boolean
  last: boolean
}

export interface DocumentHistoryQuery {
  page?: number
  size?: number
}
