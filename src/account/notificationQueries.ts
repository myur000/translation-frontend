import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NotificationSettings } from '../api/contracts/notifications.ts'
import { getNotificationSettings, updateNotificationSettings } from '../api/notifications.ts'
import { accountKeys, useAccountAccess } from './securityQueries.ts'

export function useNotificationSettings() {
  const { owner, token } = useAccountAccess()
  return useQuery({
    queryKey: accountKeys.notifications(owner),
    queryFn: ({ signal }) => getNotificationSettings({ accessToken: token!, signal }),
    enabled: Boolean(token),
  })
}

/**
 * Переключатель меняется сразу, запрос идёт следом. При ошибке возвращается
 * прежнее значение; ответ сервера записывается в кэш как сохранённое.
 */
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()
  const { owner, token } = useAccountAccess()
  const key = accountKeys.notifications(owner)
  return useMutation({
    // Быстрые переключения подряд уходят по очереди, последнее значение побеждает.
    scope: { id: 'notification-settings' },
    mutationFn: (settings: NotificationSettings) => updateNotificationSettings(settings, { accessToken: token! }),
    onMutate: async (settings) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<NotificationSettings>(key)
      queryClient.setQueryData(key, settings)
      return { previous }
    },
    onError: (_error, _settings, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
    },
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  })
}
