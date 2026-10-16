import type { ProfileResponse, UpdateProfileRequest } from '../api/contracts/profile.ts'

export const PROFILE_FIELDS = ['display_name', 'username', 'nickname', 'profession', 'bio'] as const
export type ProfileField = typeof PROFILE_FIELDS[number]
export type ProfileValues = Record<ProfileField, string>
export const PROFILE_FIELD_LIMITS: Record<ProfileField, number> = {
  username: 30, display_name: 80, nickname: 50, profession: 100, bio: 1000,
}
export type ProfileValidationKey = 'profile.invalidUsername' | 'profile.tooLong'
export type ProfileValidationErrors = Partial<Record<ProfileField, ProfileValidationKey>>

export function profileToValues(profile: ProfileResponse): ProfileValues {
  return {
    display_name: profile.display_name ?? '', username: profile.username ?? '',
    nickname: profile.nickname ?? '', profession: profile.profession ?? '', bio: profile.bio ?? '',
  }
}

export function toProfileRequest(values: ProfileValues): UpdateProfileRequest {
  return Object.fromEntries(PROFILE_FIELDS.map((field) => [field, values[field].trim() || null])) as unknown as UpdateProfileRequest
}

export function validateProfileValues(values: ProfileValues): ProfileValidationErrors {
  const errors: ProfileValidationErrors = {}
  for (const field of PROFILE_FIELDS) {
    if (values[field].trim().length > PROFILE_FIELD_LIMITS[field]) errors[field] = 'profile.tooLong'
  }
  const username = values.username.trim()
  if (username && !/^[A-Za-z][A-Za-z0-9_]{2,29}$/.test(username)) errors.username = 'profile.invalidUsername'
  return errors
}

export function mapProfileFieldErrors(errors: Record<string, string>): Partial<Record<ProfileField, string>> {
  const result: Partial<Record<ProfileField, string>> = {}
  for (const [key, value] of Object.entries(errors)) {
    const field = key === 'displayName' ? 'display_name' : key
    if (PROFILE_FIELDS.includes(field as ProfileField)) result[field as ProfileField] = value
  }
  return result
}

/** PUT replaces every text field; preserve hidden fields from the latest loaded profile. */
export function toProfileNameRequest(profile: ProfileResponse, name: string): UpdateProfileRequest {
  return {
    display_name: name.trim() || null,
    username: profile.username,
    nickname: profile.nickname,
    profession: profile.profession,
    bio: profile.bio,
  }
}

export function validateProfileName(name: string): ProfileValidationErrors {
  return name.trim().length > PROFILE_FIELD_LIMITS.display_name
    ? { display_name: 'profile.tooLong' } : {}
}
