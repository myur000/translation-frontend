import type { TranslationStatus } from '../api/contracts/documents.ts'
import type { DocumentItem, DocumentStatus } from '../types/document.ts'

const TRANSLATION_STATUSES: ReadonlySet<string> =
  new Set<TranslationStatus>(['PENDING', 'PROCESSING', 'DONE', 'FAILED', 'CANCELED'])

/** Проверка статуса из ответа сервера: неизвестное значение не применяем к документу. */
export function isTranslationStatus(value: unknown): value is TranslationStatus {
  return typeof value === 'string' && TRANSLATION_STATUSES.has(value)
}

/** После финального статуса задача больше не меняется (кроме уточнения возврата страниц у `CANCELED`). */
export function isFinalTranslationStatus(status: TranslationStatus) {
  return status === 'DONE' || status === 'FAILED' || status === 'CANCELED'
}

export function toDocumentStatus(status: TranslationStatus): DocumentStatus {
  if (status === 'DONE') return 'ready'
  if (status === 'FAILED') return 'failed'
  if (status === 'CANCELED') return 'canceled'
  return 'processing'
}

/**
 * Задача закончилась без результата (ошибка или отмена): документ можно отправить
 * снова — локальным файлом или по исходнику, который сервер хранит сутки.
 */
export function endedWithoutResult(document: Pick<DocumentItem, 'status'>) {
  return document.status === 'failed' || document.status === 'canceled'
}

/** Перевод ещё можно отменить: задача на сервере в `PENDING` или `PROCESSING`. */
export function canCancelTranslation(document: Pick<DocumentItem, 'jobId' | 'status'>) {
  return Boolean(document.jobId) && document.status === 'processing'
}
