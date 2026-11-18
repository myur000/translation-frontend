import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { createQueryClient } from '../query/queryClient.ts'

/** Свой кэш запросов на каждый рендер теста, без повторов после ошибки. */
export function TestQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => createQueryClient({ retry: false }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
