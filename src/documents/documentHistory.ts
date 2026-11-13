import type { DocumentHistoryItemResponse } from '../api/contracts/documents.ts'
import type { DocumentItem } from '../types/document.ts'
import { toDocumentStatus } from './translationStatus.ts'

export interface StoredDocumentMetadata {
  name: string
  documentId: string
}

export type DocumentMetadataByJobId = Record<string, StoredDocumentMetadata>

export function historyItemToDocument(
  item: DocumentHistoryItemResponse,
  metadata?: StoredDocumentMetadata,
): DocumentItem {
  return {
    id: metadata?.documentId ?? item.job_id,
    // Имя с бэкенда работает на всех устройствах; локальное покрывает задачи,
    // созданные до того, как бэкенд начал хранить имена.
    name:
      item.file_name ??
      metadata?.name ??
      `document-${item.job_id.slice(0, 8)}.${item.format}`,
    // Оставляем как прислал бэкенд: старые коды показываются как есть.
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
    quotaRefund: item.quota_refund ?? undefined,
  }
}

/**
 * Превращает страницу истории в документы с уникальными id. Повтор неудачного
 * документа сохраняет его id для новой задачи, а этот id может совпадать с id
 * другой задачи (документы из истории используют свой job id). Поэтому
 * собственный id задачи главнее: сохранённый id берётся, только если он не
 * принадлежит другой задаче из списка и его не заняла более новая (история идёт от новых к старым).
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
