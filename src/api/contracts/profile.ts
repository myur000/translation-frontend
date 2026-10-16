import type { ISO8601DateTime, UUID } from './common.ts'

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
  username: string | null
  display_name: string | null
  nickname: string | null
  profession: string | null
  bio: string | null
}
