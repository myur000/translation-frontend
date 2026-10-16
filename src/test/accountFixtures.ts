import type { AccountSubscriptionResponse, AccountUsageResponse } from '../api/contracts/account.ts'

export const freeUsage: AccountUsageResponse = {
  plan_code: 'FREE', plan_display_name: 'Free', feature_code: 'DOCUMENT_TRANSLATION',
  period_type: 'MONTH', unlimited: false, limit_units: 10, used_units: 3,
  remaining_units: 7, resets_at: '2026-11-01T00:00:00Z',
}
export const freeSubscription: AccountSubscriptionResponse = {
  plan_code: 'FREE', plan_display_name: 'Free', status: 'FREE',
  current_period_start: null, current_period_end: null, cancel_at_period_end: false,
}
export function accountFixture(input: RequestInfo | URL) {
  if (String(input) === '/api/account/usage') return freeUsage
  if (String(input) === '/api/account/subscription') return freeSubscription
  return null
}
