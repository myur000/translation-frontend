const DEFAULT_API_BASE_URL = '/api'

function normalizeBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, '')
  return normalized || DEFAULT_API_BASE_URL
}

export const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
)

export function createApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}
