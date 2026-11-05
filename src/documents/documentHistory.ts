import type {
  DocumentHistoryItemResponse,
  TranslationStatus,
} from '../api/contracts/documents.ts'
import type { DocumentItem, DocumentStatus } from '../types/document.ts'

export interface StoredDocumentMetadata {
  name: string
  documentId: string
}

export type DocumentMetadataByJobId = Record<string, StoredDocumentMetadata>

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
    // Kept as sent by the backend: legacy codes are shown as is.
    sourceLanguage: item.source_lang,
    targetLanguage: item.target_lang,
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
