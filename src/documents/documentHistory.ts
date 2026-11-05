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
    // The backend name works across devices; the local one covers jobs created
    // before the backend stored names.
    name:
      item.file_name ??
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
    billedUnits: item.billed_units,
    glossaryTermCount: item.glossary_term_count,
  }
}

/**
 * Maps a history page to documents with unique ids. Retrying a failed
 * document keeps the document's id for the new job, and that id can be
 * another job's id (documents restored from history use their job id). A
 * job's own id therefore wins: a stored id is used only when no other job
 * in the list owns it and no newer job (history is newest first) took it.
 */
export function historyItemsToDocuments(
  items: readonly DocumentHistoryItemResponse[],
  metadata: DocumentMetadataByJobId,
  reservedIds: ReadonlySet<string> = new Set(),
): DocumentItem[] {
  const jobIds = new Set(items.map((item) => item.job_id))
  const usedIds = new Set(reservedIds)
  return items.map((item) => {
    const document = historyItemToDocument(item, metadata[item.job_id])
    const ownsStoredId = document.id === item.job_id || !jobIds.has(document.id)
    const id = ownsStoredId && !usedIds.has(document.id) ? document.id : item.job_id
    usedIds.add(id)
    return id === document.id ? document : { ...document, id }
  })
}
