import { apiClient, type AuthenticatedApiCallOptions } from './client.ts'
import type { TermCreateRequest, TermListQuery, TermListResponse, TermResponse, TermUpdateRequest } from './contracts/terms.ts'
import { API_ENDPOINTS } from './endpoints.ts'

export function getTerms(query: TermListQuery, options: AuthenticatedApiCallOptions) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const search = params.toString()

  return apiClient.request<TermListResponse>(
    search ? `${API_ENDPOINTS.terms.list}?${search}` : API_ENDPOINTS.terms.list,
    { method: 'GET', accessToken: options.accessToken, signal: options.signal },
  )
}

/** `409` — такой термин в паре уже есть или достигнут предел терминов. */
export function createTerm(request: TermCreateRequest, options: AuthenticatedApiCallOptions) {
  return apiClient.request<TermResponse>(API_ENDPOINTS.terms.list, {
    method: 'POST',
    accessToken: options.accessToken,
    json: request,
    signal: options.signal,
    notifyAccessErrors: false,
  })
}

/** `409` — новое написание совпало с другим термином пары. */
export function updateTerm(termId: string, request: TermUpdateRequest, options: AuthenticatedApiCallOptions) {
  return apiClient.request<TermResponse>(API_ENDPOINTS.terms.term(termId), {
    method: 'PUT',
    accessToken: options.accessToken,
    json: request,
    signal: options.signal,
    notifyAccessErrors: false,
  })
}

/** Привязать термин к книге той же пары языков; повторная привязка ничего не меняет. */
export function linkTermDocument(termId: string, jobId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<TermResponse>(API_ENDPOINTS.terms.documents(termId), {
    method: 'POST',
    accessToken: options.accessToken,
    json: { job_id: jobId },
    signal: options.signal,
    notifyAccessErrors: false,
  })
}

export function getTerm(termId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<TermResponse>(API_ENDPOINTS.terms.term(termId), {
    method: 'GET',
    accessToken: options.accessToken,
    signal: options.signal,
  })
}

export function deleteTerm(termId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<void>(API_ENDPOINTS.terms.term(termId), {
    method: 'DELETE',
    accessToken: options.accessToken,
    responseType: 'void',
    signal: options.signal,
    notifyAccessErrors: false,
  })
}

/** Удалённую книгу тоже можно отвязать. */
export function unlinkTermDocument(termId: string, jobId: string, options: AuthenticatedApiCallOptions) {
  return apiClient.request<void>(`${API_ENDPOINTS.terms.documents(termId)}/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    accessToken: options.accessToken,
    responseType: 'void',
    signal: options.signal,
    notifyAccessErrors: false,
  })
}
