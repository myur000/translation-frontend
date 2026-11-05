import type { TranslationStatus } from '../api/contracts/documents.ts'

export type DocumentStatus = 'ready' | 'processing' | 'draft' | 'failed'
export type TranslationWaitingIssue = 'stalled' | 'unreachable'
/**
 * NLLB-200 code (`eng_Latn`). Documents created before the switch keep their
 * legacy two-letter codes (`en`), so any string from the backend is accepted.
 */
export type LanguageCode = string

export interface DocumentItem {
  id: string
  name: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  pages: number
  status: DocumentStatus
  serverStatus?: TranslationStatus
  waitingIssue?: TranslationWaitingIssue
  progress?: number
  jobId?: string
  sourceFile?: File
  format?: 'pdf' | 'docx' | 'doc'
  errorMessage?: string
  createdAt?: string
  /** Billing pages charged for the job. */
  billedUnits?: number
  /** Terms passed to the translator; `null` when the glossary was not requested. */
  glossaryTermCount?: number | null
}

export interface DocumentContent {
  eyebrow: string
  title: string
  paragraphs: string[]
}

export interface DocumentPreviewContent {
  original: DocumentContent
  translation: DocumentContent
}
