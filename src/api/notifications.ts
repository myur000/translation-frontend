import { apiClient, type AuthenticatedApiCallOptions } from './client.ts'
import type { NotificationSettings } from './contracts/notifications.ts'
import { API_ENDPOINTS } from './endpoints.ts'

export function parseNotificationSettings(value: unknown): NotificationSettings {
  if (typeof value !== 'object' || value === null || typeof (value as NotificationSettings).document_ready !== 'boolean') {
    throw new Error('Invalid notification settings')
  }
  return { document_ready: (value as NotificationSettings).document_ready }
}

export async function getNotificationSettings(options: AuthenticatedApiCallOptions) {
  return parseNotificationSettings(await apiClient.request<unknown>(API_ENDPOINTS.account.notifications, {
    method: 'GET', accessToken: options.accessToken, signal: options.signal,
  }))
}

/** PUT заменяет все настройки писем; ответ — сохранённые значения. */
export async function updateNotificationSettings(settings: NotificationSettings, options: AuthenticatedApiCallOptions) {
  return parseNotificationSettings(await apiClient.request<unknown>(API_ENDPOINTS.account.notifications, {
    method: 'PUT', json: settings, accessToken: options.accessToken, signal: options.signal,
  }))
}
