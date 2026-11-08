import { apiClient, type ApiCallOptions } from './client.ts'
import type { LanguageResponse } from './contracts/languages.ts'
import { API_ENDPOINTS } from './endpoints.ts'

/** Публичный каталог языков NLLB-200, отсортированный по русскому названию. */
export function getLanguages(options: ApiCallOptions = {}) {
  return apiClient.request<LanguageResponse[]>(API_ENDPOINTS.languages, {
    method: 'GET',
    signal: options.signal,
  })
}
