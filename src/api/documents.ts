import { apiClient, type AuthenticatedApiCallOptions } from './client.ts'
import type {
  DocumentEstimateResponse,
  DocumentFeedbackRequest,
  DocumentFeedbackResponse,
  DocumentHistoryQuery,
  DocumentHistoryResponse,
  DocumentStatusResponse,
  DocumentUploadRequest,
  DocumentUploadResponse,
  RetranslationRequest,
} from './contracts/documents.ts'
import { API_ENDPOINTS } from './endpoints.ts'

export function uploadDocument(
  request: DocumentUploadRequest,
  options: AuthenticatedApiCallOptions,
) {
  const formData = new FormData()
  formData.append('file', request.file)
  formData.append('source_lang', request.source_lang)
  formData.append('target_lang', request.target_lang)
  if (request.use_glossary) formData.append('use_glossary', 'true')

  return apiClient.request<DocumentUploadResponse>(
    API_ENDPOINTS.documents.upload,
    {
      method: 'POST',
      accessToken: options.accessToken,
      body: formData,
      signal: options.signal,
      // Рабочая область сама объясняет 403 (email не подтверждён) рядом с действием.
      notifyAccessErrors: false,
    },
  )
}

/** Сколько учётных страниц будет стоить файл; ничего не сохраняется и не списывается. */
export function estimateDocument(file: File, options: AuthenticatedApiCallOptions) {
  const formData = new FormData()
  formData.append('file', file)

  return apiClient.request<DocumentEstimateResponse>(
    API_ENDPOINTS.documents.estimate,
    {
      method: 'POST',
      accessToken: options.accessToken,
      body: formData,
      signal: options.signal,
      // Неподтверждённые аккаунты получают здесь 403; оценка стоимости необязательна.
      notifyAccessErrors: false,
    },
  )
}

/**
 * Переводит уже загруженный документ на другой язык по исходному файлу,
 * который хранит бэкенд. Ключ идемпотентности возвращает ту же задачу
 * при повторе запроса (потерянный ответ, двойной клик).
 */
export function retranslateDocument(
  jobId: string,
  request: RetranslationRequest,
  options: AuthenticatedApiCallOptions & { idempotencyKey: string },
) {
  return apiClient.request<DocumentUploadResponse>(
    API_ENDPOINTS.documents.translations(jobId),
    {
      method: 'POST',
      accessToken: options.accessToken,
      json: request,
      headers: { 'Idempotency-Key': options.idempotencyKey },
      signal: options.signal,
      notifyAccessErrors: false,
    },
  )
}

/**
 * Отменяет перевод в статусе `PENDING` или `PROCESSING`; ответ устроен как статус задачи
 * (`CANCELED` и `quota_refund`). Повторная отмена безопасна и возвращает текущее состояние;
 * у завершённой задачи — `409 DOCUMENT_ALREADY_FINISHED`.
 */
export function cancelDocumentTranslation(jobId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<DocumentStatusResponse>(API_ENDPOINTS.documents.cancel(jobId), {
    method: 'POST',
    accessToken: options.accessToken,
    signal: options.signal,
  })
}

/** Удаляет завершённый документ и его файлы; повторный вызов безвреден. */
export function deleteDocument(jobId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<void>(API_ENDPOINTS.documents.document(jobId), {
    method: 'DELETE',
    accessToken: options.accessToken,
    responseType: 'void',
    signal: options.signal,
  })
}

export function getDocumentFeedback(jobId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<DocumentFeedbackResponse>(
    API_ENDPOINTS.documents.feedback(jobId),
    { method: 'GET', accessToken: options.accessToken, signal: options.signal },
  )
}

/** Сохраняет или заменяет оценку владельца; принимается только для документов в статусе DONE. */
export function saveDocumentFeedback(
  jobId: string,
  request: DocumentFeedbackRequest,
  options: AuthenticatedApiCallOptions,
) {
  return apiClient.request<DocumentFeedbackResponse>(
    API_ENDPOINTS.documents.feedback(jobId),
    {
      method: 'PUT',
      accessToken: options.accessToken,
      json: request,
      signal: options.signal,
    },
  )
}

export function getDocumentHistory(
  options: AuthenticatedApiCallOptions,
  query: DocumentHistoryQuery = {},
) {
  const searchParams = new URLSearchParams()

  if (query.page !== undefined) {
    searchParams.set('page', String(query.page))
  }

  if (query.size !== undefined) {
    searchParams.set('size', String(query.size))
  }

  const queryString = searchParams.toString()
  const path = queryString
    ? `${API_ENDPOINTS.documents.history}?${queryString}`
    : API_ENDPOINTS.documents.history

  return apiClient.request<DocumentHistoryResponse>(path, {
    method: 'GET',
    accessToken: options.accessToken,
    signal: options.signal,
  })
}
