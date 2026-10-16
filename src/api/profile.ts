import {
  apiClient,
  type AuthenticatedApiCallOptions,
} from './client.ts'
import type {
  ProfileResponse,
  UpdateProfileRequest,
} from './contracts/profile.ts'
import { API_ENDPOINTS } from './endpoints.ts'

export function isProfileResponse(value: unknown): value is ProfileResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const profile = value as Record<string, unknown>
  return typeof profile.user_id === 'string' && profile.user_id.length > 0 &&
    typeof profile.email === 'string' && profile.email.length > 0 &&
    ['username', 'display_name', 'nickname', 'profession', 'bio'].every((field) =>
      profile[field] === null || typeof profile[field] === 'string') &&
    typeof profile.has_avatar === 'boolean' &&
    typeof profile.created_at === 'string' && Number.isFinite(Date.parse(profile.created_at)) &&
    typeof profile.updated_at === 'string' && Number.isFinite(Date.parse(profile.updated_at))
}

export function getProfile(options: AuthenticatedApiCallOptions) {
  return apiClient.request<ProfileResponse>(API_ENDPOINTS.profile.details, {
    method: 'GET',
    accessToken: options.accessToken,
    signal: options.signal,
  })
}

export async function updateProfile(
  request: UpdateProfileRequest,
  options: AuthenticatedApiCallOptions,
) {
  const profile = await apiClient.request<unknown>(API_ENDPOINTS.profile.details, {
    method: 'PUT',
    accessToken: options.accessToken,
    json: request,
    signal: options.signal,
  })
  if (!isProfileResponse(profile)) throw new Error('Invalid profile response')
  return profile
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_TYPES = ['image/jpeg', 'image/png'] as const

export async function getAvatar(options: AuthenticatedApiCallOptions): Promise<Blob> {
  const response = await apiClient.requestBinary(API_ENDPOINTS.profile.avatar, {
    method: 'GET', accessToken: options.accessToken, signal: options.signal,
  })
  const type = response.contentType?.split(';')[0]?.trim().toLowerCase()
  if (!response.blob.size || !AVATAR_TYPES.some((allowed) => allowed === type)) throw new Error('Invalid avatar response')
  return response.blob
}

export function uploadAvatar(file: File, options: AuthenticatedApiCallOptions) {
  const body = new FormData()
  body.append('file', file)
  return apiClient.request<void>(API_ENDPOINTS.profile.avatar, {
    method: 'PUT', body, responseType: 'void', accessToken: options.accessToken, signal: options.signal,
  })
}

export function deleteAvatar(options: AuthenticatedApiCallOptions) {
  return apiClient.request<void>(API_ENDPOINTS.profile.avatar, {
    method: 'DELETE', responseType: 'void', accessToken: options.accessToken, signal: options.signal,
  })
}
