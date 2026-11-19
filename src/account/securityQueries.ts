import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { getSecondFactorStatus, listSessions } from '../api/accountSecurity.ts'
import type { AccountSession, SecondFactorStatus } from '../api/contracts/accountSecurity.ts'
import { useAuth } from '../auth/useAuth.ts'

/** Ключи кэша аккаунта; владелец в ключе, кэш очищается при смене аккаунта (`QueryProvider`). */
export const accountKeys = {
  all: (owner: string) => ['account', owner] as const,
  sessions: (owner: string) => ['account', owner, 'sessions'] as const,
  secondFactor: (owner: string) => ['account', owner, 'second-factor'] as const,
  notifications: (owner: string) => ['account', owner, 'notifications'] as const,
}

export function useAccountAccess() {
  const { session } = useAuth()
  return { owner: session?.email ?? '', token: session?.accessToken ?? null }
}

/** Сеансы: текущий первым, остальные — от недавних к давним. */
function sortSessions(sessions: AccountSession[]) {
  return [...sessions].sort((first, second) => Number(second.current) - Number(first.current) ||
    Date.parse(second.last_used_at) - Date.parse(first.last_used_at))
}

export function useAccountSessions() {
  const { owner, token } = useAccountAccess()
  return useQuery({
    queryKey: accountKeys.sessions(owner),
    queryFn: async ({ signal }) => sortSessions(await listSessions({ accessToken: token!, signal })),
    enabled: Boolean(token),
    // Список меняют и другие устройства: при возврате на вкладку перечитываем.
    refetchOnWindowFocus: true,
  })
}

export function useSecondFactorStatus() {
  const { owner, token } = useAccountAccess()
  return useQuery({
    queryKey: accountKeys.secondFactor(owner),
    queryFn: ({ signal }) => getSecondFactorStatus({ accessToken: token!, signal }),
    enabled: Boolean(token),
  })
}

/** Записать итог действия в кэш, не дожидаясь перечитывания. */
export function useAccountCache() {
  const queryClient = useQueryClient()
  const { owner } = useAccountAccess()
  const setSecondFactor = useCallback((status: SecondFactorStatus) => {
    queryClient.setQueryData(accountKeys.secondFactor(owner), status)
  }, [owner, queryClient])
  const removeSession = useCallback((sessionId: string) => {
    queryClient.setQueryData<AccountSession[]>(accountKeys.sessions(owner),
      (current) => current?.filter((item) => item.id !== sessionId))
  }, [owner, queryClient])
  const sessionsChanged = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: accountKeys.sessions(owner) })
  }, [owner, queryClient])
  return { setSecondFactor, removeSession, sessionsChanged }
}
