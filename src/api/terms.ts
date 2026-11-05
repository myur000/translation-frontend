import { apiClient, type AuthenticatedApiCallOptions } from './client.ts'
import type { TermListQuery, TermListResponse } from './contracts/terms.ts'
import { API_ENDPOINTS } from './endpoints.ts'

export function getTerms(query: TermListQuery, options: AuthenticatedApiCallOptions) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const search = params.toString()

  return apiClient.request<TermListResponse>(
    search ? `${API_ENDPOINTS.terms}?${search}` : API_ENDPOINTS.terms,
    { method: 'GET', accessToken: options.accessToken, signal: options.signal },
  )
}
