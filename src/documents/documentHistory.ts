import type {
  DocumentHistoryItemResponse,
  TranslationStatus,
} from '../api/contracts/documents.ts'
import type {
  DocumentItem,
  DocumentStatus,
  LanguageCode,
} from '../types/document.ts'

export interface StoredDocumentMetadata {
  name: string
  documentId: string
}

export type DocumentMetadataByJobId = Record<string, StoredDocumentMetadata>

const SUPPORTED_LANGUAGES = new Set<LanguageCode>(['en', 'ru', 'de'])

function toLanguageCode(value: string, fallback: LanguageCode): LanguageCode {
  return SUPPORTED_LANGUAGES.has(value as LanguageCode)
    ? (value as LanguageCode)
    : fallback
}

function toDocumentStatus(status: TranslationStatus): DocumentStatus {
  if (status === 'DONE') return 'ready'
  if (status === 'FAILED') return 'failed'
  return 'processing'
}

export function historyItemToDocument(
  item: DocumentHistoryItemResponse,
  metadata?: StoredDocumentMetadata,
): DocumentItem {
  return {
    id: metadata?.documentId ?? item.job_id,
    name:
      metadata?.name ??
      `document-${item.job_id.slice(0, 8)}.${item.format}`,
    sourceLanguage: toLanguageCode(item.source_lang, 'en'),
    targetLanguage: toLanguageCode(item.target_lang, 'ru'),
    pages: 0,
    format: item.format,
    status: toDocumentStatus(item.status),
    serverStatus: item.status,
    progress: Math.min(100, Math.max(0, item.progress)),
    jobId: item.job_id,
    errorMessage: item.error_message ?? undefined,
    createdAt: item.created_at,
  }
}
