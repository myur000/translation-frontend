import { ApiClientError } from '../api/client.ts'

/**
 * The backend answers 429 both for an exhausted quota and for rate limiting
 * and has no machine-readable code to tell them apart, so the quota case is
 * recognised by its message (UsageLimitExceededException).
 */
const QUOTA_EXCEEDED_MESSAGE = 'Лимит использования функции на текущий период исчерпан'

export function isQuotaExceeded(error: unknown) {
  return error instanceof ApiClientError &&
    error.status === 429 &&
    error.details?.message === QUOTA_EXCEEDED_MESSAGE
}
