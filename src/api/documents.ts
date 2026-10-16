import { apiClient, type AuthenticatedApiCallOptions } from './client.ts'
import type {
  DocumentHistoryQuery,
  DocumentHistoryResponse,
  DocumentUploadRequest,
  DocumentUploadResponse,
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

  return apiClient.request<DocumentUploadResponse>(
    API_ENDPOINTS.documents.upload,
    {
      method: 'POST',
      accessToken: options.accessToken,
      body: formData,
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
