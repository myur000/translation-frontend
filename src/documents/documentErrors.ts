import { hasApiErrorCode } from '../api/client.ts'

/**
 * Бэкенд отвечает 429 и при исчерпанной квоте, и при ограничении частоты запросов;
 * различаем их по машинному коду `USAGE_LIMIT_EXCEEDED`, а не по тексту сообщения.
 */
export function isQuotaExceeded(error: unknown) {
  return hasApiErrorCode(error, 'USAGE_LIMIT_EXCEEDED')
}
