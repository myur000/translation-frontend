import { ApiClientError } from '../api/client.ts'

/**
 * Бэкенд отвечает 429 и при исчерпанной квоте, и при ограничении частоты запросов,
 * а машиночитаемого кода, чтобы их различить, нет, поэтому квоту узнаём
 * по тексту сообщения (UsageLimitExceededException).
 */
const QUOTA_EXCEEDED_MESSAGE = 'Лимит использования функции на текущий период исчерпан'

export function isQuotaExceeded(error: unknown) {
  return error instanceof ApiClientError &&
    error.status === 429 &&
    error.details?.message === QUOTA_EXCEEDED_MESSAGE
}
