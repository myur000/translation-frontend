import { createContext } from 'react'
import type { ProfileResponse, UpdateProfileRequest } from '../api/contracts/profile.ts'
import type { ApiCallOptions } from '../api/client.ts'
import type { ProfileAvatarState } from './useProfileAvatar.ts'

export type ProfileLoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface ProfileContextValue {
  profile: ProfileResponse | null
  state: ProfileLoadState
  isMutating: boolean
  avatar: ProfileAvatarState
  changeAvatar: (file: File | null, options?: ApiCallOptions) => Promise<void>
  reload: () => Promise<void>
  save: (request: UpdateProfileRequest, options?: ApiCallOptions) => Promise<ProfileResponse>
}

export const ProfileContext = createContext<ProfileContextValue | null>(null)
