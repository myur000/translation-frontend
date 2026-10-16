import { createContext } from 'react'
import type { AccountSubscriptionResponse, AccountUsageResponse } from '../api/contracts/account.ts'

export interface AccountResource<T> {
  data: T | null
  loading: boolean
  failed: boolean
}
export interface AccountContextValue {
  usage: AccountResource<AccountUsageResponse>
  subscription: AccountResource<AccountSubscriptionResponse>
  reload: () => void
}
export const AccountContext = createContext<AccountContextValue | null>(null)
