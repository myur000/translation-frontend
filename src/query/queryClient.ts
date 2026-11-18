import { QueryClient } from '@tanstack/react-query'
import { ApiClientError } from '../api/client.ts'

/** Ответ 4xx не исправится повтором: сеть и 5xx повторяем один раз. */
function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiClientError && error.status < 500) return false
  return failureCount < 1
}

/**
 * Кэш запросов приложения. Данные свежие 30 секунд: переходы между разделами
 * показывают их сразу и перечитывают в фоне. При возврате на вкладку сами не
 * перечитываются — заметки книги стоят десятка запросов.
 */
export function createQueryClient({ retry = true }: { retry?: boolean } = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: retry ? shouldRetry : false,
        retryDelay: 600,
        // Без повторов (тесты) кэш живёт до конца: таймеры сборки не переживают тест.
        ...(retry ? {} : { gcTime: Infinity }),
      },
    },
  })
}
