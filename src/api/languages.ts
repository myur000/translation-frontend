import { apiClient, type ApiCallOptions } from './client.ts'
import type { LanguageResponse } from './contracts/languages.ts'
import { API_ENDPOINTS } from './endpoints.ts'

/** Public catalog of NLLB-200 languages, sorted by Russian name. */
export function getLanguages(options: ApiCallOptions = {}) {
  return apiClient.request<LanguageResponse[]>(API_ENDPOINTS.languages, {
    method: 'GET',
    signal: options.signal,
  })
}
