import type { TranslationStatus } from '../api/contracts/documents.ts'

export type DocumentStatus = 'ready' | 'processing' | 'draft' | 'failed'
export type TranslationWaitingIssue = 'stalled' | 'unreachable'
/**
 * Код NLLB-200 (`eng_Latn`). Документы, созданные до перехода, хранят старые
 * двухбуквенные коды (`en`), поэтому принимается любая строка с бэкенда.
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
  /** Учётные страницы, списанные за задачу. */
  billedUnits?: number
  /** Термины, переданные переводчику; `null`, если глоссарий не запрашивали. */
  glossaryTermCount?: number | null
  /** Стоимость черновика до загрузки; отсутствует, пока неизвестна или недоступна. */
  estimate?: DocumentEstimate
}

export interface DocumentEstimate {
  billedUnits: number
  enoughQuota: boolean
  unlimited: boolean
  remainingUnits: number | null
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
