import type { TranslationStatus } from '../api/contracts/documents.ts'

export type DocumentStatus = 'ready' | 'processing' | 'draft' | 'failed'
export type TranslationWaitingIssue = 'stalled' | 'unreachable'
export type LanguageCode = 'en' | 'ru' | 'de'
export type LanguageLabelLocale = 'ru' | 'en'

const LANGUAGE_LABELS: Record<
  LanguageCode,
  Record<LanguageLabelLocale, string>
> = {
  en: { ru: 'English', en: 'English' },
  ru: { ru: 'Русский', en: 'Russian' },
  de: { ru: 'Deutsch', en: 'German' },
}

export const LANGUAGE_OPTIONS: ReadonlyArray<{
  code: LanguageCode
  label: string
}> = (Object.keys(LANGUAGE_LABELS) as LanguageCode[]).map((code) => ({
  code,
  label: LANGUAGE_LABELS[code].ru,
}))

export function getLanguageLabel(
  code: LanguageCode,
  locale: LanguageLabelLocale = 'ru',
) {
  return LANGUAGE_LABELS[code]?.[locale] ?? code
}

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
