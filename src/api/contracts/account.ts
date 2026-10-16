import type { ISO8601DateTime, UUID } from './common.ts'

export type SubscriptionStatus =
  | 'FREE'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'EXPIRED'

export type BillingPeriod = 'MONTH'
export type FeatureCode = 'DOCUMENT_TRANSLATION'
export type UsagePeriodType = 'MONTH'

export interface ProfileResponse {
  user_id: UUID
  email: string
  username: string | null
  display_name: string | null
  nickname: string | null
  profession: string | null
  bio: string | null
  has_avatar: boolean
  created_at: ISO8601DateTime
  updated_at: ISO8601DateTime
}

export interface UpdateProfileRequest {
  username?: string | null
  display_name?: string | null
  nickname?: string | null
  profession?: string | null
  bio?: string | null
}

export interface AccountUsageResponse {
  plan_code: string
  plan_display_name: string
  feature_code: FeatureCode
  period_type: UsagePeriodType
  unlimited: boolean
  limit_units: number | null
  used_units: number
  remaining_units: number | null
  resets_at: ISO8601DateTime
}

export interface AccountSubscriptionResponse {
  plan_code: string
  plan_display_name: string
  status: SubscriptionStatus
  current_period_start: ISO8601DateTime | null
  current_period_end: ISO8601DateTime | null
  cancel_at_period_end: boolean
}

export interface SubscriptionCancellationResponse {
  cancel_at_period_end: boolean
  effective_at: ISO8601DateTime
}

export interface SubscriptionOfferResponse {
  plan_code: string
  plan_display_name: string
  price_minor: number
  currency: string
  billing_period: BillingPeriod
}

export interface SubscriptionPurchaseStartRequest {
  plan_code: string
}

export interface SubscriptionPurchaseStartResponse {
  intent_id: UUID
  provider: string
  redirect_url: string
  expires_at: ISO8601DateTime
}
