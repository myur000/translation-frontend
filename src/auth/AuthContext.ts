import { createContext } from 'react'
import type { LoginRequest } from '../api/contracts/auth.ts'
import type { AuthSession } from './authStorage.ts'

export interface AuthContextValue {
  session: AuthSession | null
  isAuthenticated: boolean
  isRestoring: boolean
  sessionIssue: import('./sessionController.ts').SessionIssue
  login: (credentials: LoginRequest) => Promise<void>
  logout: () => Promise<void>
  invalidateSession: () => void
  logoutEverywhere: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
