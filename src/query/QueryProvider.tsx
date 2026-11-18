import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth.ts'
import { createQueryClient } from './queryClient.ts'

/**
 * Кэш запросов на сеанс вкладки. Ключи начинаются с email, а при выходе или смене
 * аккаунта кэш очищается целиком: личные данные одного человека не должны
 * мелькнуть у другого. Клиент создаётся в компоненте, а не в модуле, — у каждого
 * монтирования приложения (и у каждого теста) свой кэш.
 */
export function QueryProvider({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient())
  const { session } = useAuth()
  const owner = session?.email ?? null
  const previous = useRef(owner)
  useEffect(() => {
    if (previous.current === owner) return
    previous.current = owner
    queryClient.clear()
  }, [owner, queryClient])
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
