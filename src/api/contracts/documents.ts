import type { ISO8601DateTime, UUID } from './common.ts'

export type TranslationStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
export type TranslationErrorCode = 'TRANSLATION_FAILED'
export type DocumentFileFormat = 'docx' | 'doc' | 'pdf'

export interface DocumentUploadRequest {
  file: File
  source_lang: string
  target_lang: string
}

export interface DocumentUploadResponse {
  job_id: UUID
}

export interface DocumentStatusResponse {
  job_id: UUID
  status: TranslationStatus
  progress: number
  error_code: TranslationErrorCode | null
  error_message: string | null
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
