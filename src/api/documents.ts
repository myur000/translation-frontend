import { apiClient, type AuthenticatedApiCallOptions } from './client.ts'
import type {
  DocumentEstimateResponse,
  DocumentFeedbackRequest,
  DocumentFeedbackResponse,
  DocumentHistoryQuery,
  DocumentHistoryResponse,
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
      // The workspace explains 403 (unverified email) next to the action.
      notifyAccessErrors: false,
    },
  )
}

/** Billing pages a file would cost; nothing is stored or charged. */
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
      // Unverified accounts get 403 here; the estimate is optional.
      notifyAccessErrors: false,
    },
  )
}

/**
 * Translates an already uploaded document into another language using the
 * source file kept by the backend. The idempotency key makes a retried
 * request (lost response, double click) return the same job.
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

/** Deletes a finished document and its files; repeating it is harmless. */
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

/** Saves or replaces the owner's rating; only DONE documents accept it. */
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
