import { apiClient, type AuthenticatedApiCallOptions } from './client.ts'
import type { AccountSubscriptionResponse, AccountUsageResponse, SubscriptionStatus } from './contracts/account.ts'
import { API_ENDPOINTS } from './endpoints.ts'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
function date(value: unknown): value is string {
  return text(value) && Number.isFinite(Date.parse(value))
}
function units(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function parseAccountUsage(value: unknown): AccountUsageResponse {
  if (!record(value) || !text(value.plan_code) || !text(value.plan_display_name) ||
      value.feature_code !== 'DOCUMENT_TRANSLATION' || value.period_type !== 'MONTH' ||
      typeof value.unlimited !== 'boolean' || !units(value.used_units) || !date(value.resets_at)) {
    throw new Error('Invalid account usage response')
  }
  if (value.unlimited) {
    if (value.limit_units !== null || value.remaining_units !== null) throw new Error('Invalid unlimited usage')
  } else if (!units(value.limit_units) || value.limit_units === 0 ||
      !units(value.remaining_units) || value.remaining_units > value.limit_units) {
    throw new Error('Invalid finite usage')
  }
  // Use the server's remaining_units: occupied units can exceed a newly reduced limit.
  return value as unknown as AccountUsageResponse
}

const statuses: readonly SubscriptionStatus[] = ['FREE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED']
export function parseAccountSubscription(value: unknown): AccountSubscriptionResponse {
  if (!record(value) || !text(value.plan_code) || !text(value.plan_display_name) ||
      !statuses.includes(value.status as SubscriptionStatus) ||
      typeof value.cancel_at_period_end !== 'boolean' ||
      !(value.current_period_start === null || date(value.current_period_start)) ||
      !(value.current_period_end === null || date(value.current_period_end))) {
    throw new Error('Invalid account subscription response')
  }
  return value as unknown as AccountSubscriptionResponse
}

export async function getAccountUsage(options: AuthenticatedApiCallOptions) {
  return parseAccountUsage(await apiClient.request<unknown>(API_ENDPOINTS.account.usage, {
    method: 'GET', accessToken: options.accessToken, signal: options.signal,
  }))
}

export async function getAccountSubscription(options: AuthenticatedApiCallOptions) {
  return parseAccountSubscription(await apiClient.request<unknown>(API_ENDPOINTS.account.subscription, {
    method: 'GET', accessToken: options.accessToken, signal: options.signal,
  }))
}
