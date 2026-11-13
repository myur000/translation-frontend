import type { ISO8601DateTime, UUID } from './common.ts'

/** `DONE`, `FAILED` и `CANCELED` — финальные статусы. */
export type TranslationStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'CANCELED'
export type TranslationErrorCode = 'TRANSLATION_FAILED'
/**
 * Что стало со страницами отменённого документа:
 * - `REFUNDED` — перевод не начинался, страницы вернули;
 * - `PENDING` — ждём ответа сервиса перевода (обычно секунды, не дольше суток);
 * - `NONE` — перевод уже начался, страницы не возвращаются.
 */
export type QuotaRefund = 'REFUNDED' | 'PENDING' | 'NONE'
export type DocumentFileFormat = 'docx' | 'doc' | 'pdf'

export interface DocumentUploadRequest {
  file: File
  source_lang: string
  target_lang: string
  /** Применить термины владельца для этой языковой пары. */
  use_glossary?: boolean
}

export interface DocumentUploadResponse {
  job_id: UUID
  /** Учётные страницы, списанные за этот документ. */
  billed_units: number
  /** `null` — глоссарий не запрашивали; `0` — запросили, но терминов для пары нет. */
  glossary_term_count: number | null
}

export interface RetranslationRequest {
  target_lang: string
  use_glossary?: boolean
}

export interface DocumentEstimateResponse {
  format: DocumentFileFormat
  /** Символы с пробелами, из которых считаются учётные страницы. */
  characters: number
  billed_units: number
  unlimited: boolean
  /** `null` для безлимитных тарифов. */
  remaining_units: number | null
  enough_quota: boolean
}

export interface DocumentStatusResponse {
  job_id: UUID
  status: TranslationStatus
  progress: number
  error_code: TranslationErrorCode | null
  error_message: string | null
  /** Очищенное имя файла пользователя; `null` у задач, созданных до того, как имена начали сохранять. */
  file_name: string | null
  glossary_term_count: number | null
  /** Только у `CANCELED`; у остальных статусов `null`. */
  quota_refund: QuotaRefund | null
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

/** `data` события `job` в GET /api/documents/events. */
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
  /** Только у `CANCELED`; у остальных статусов `null`. */
  quota_refund: QuotaRefund | null
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

/** Пара абзацев с одинаковым номером; сторона без текста приходит как `null`. */
export interface DocumentTextParagraph {
  index: number
  source: string | null
  translation: string | null
}

/** GET /api/documents/{jobId}/text — текст оригинала и перевода по абзацам, постранично. */
export interface DocumentTextResponse {
  job_id: UUID
  file_format: 'DOCX' | 'DOC' | 'PDF'
  source_lang: string
  target_lang: string
  /** `false`, когда исходник удалён по сроку хранения: у всех абзацев `source: null`. */
  source_available: boolean
  /** Абзац N оригинала соответствует абзацу N перевода (DOCX/DOC с равным числом абзацев). */
  aligned: boolean
  source_paragraphs: number | null
  translation_paragraphs: number
  /** Документ длиннее лимита просмотра — конец не показан. */
  truncated: boolean
  page: number
  size: number
  total_paragraphs: number
  total_pages: number
  paragraphs: DocumentTextParagraph[]
}

export interface DocumentTextQuery {
  page?: number
  /** До 500 абзацев за запрос. */
  size?: number
}
