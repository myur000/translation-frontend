import { createContext } from 'react'
import type { LoginRequest, LoginResponse } from '../api/contracts/auth.ts'
import type { SecondFactorLoginRequest } from '../api/contracts/accountSecurity.ts'
import type { AuthSession } from './authStorage.ts'

export interface AuthContextValue {
  session: AuthSession | null
  isAuthenticated: boolean
  isRestoring: boolean
  sessionIssue: import('./sessionController.ts').SessionIssue
  login: (credentials: LoginRequest) => Promise<import('./sessionController.ts').LoginResult>
  completeSecondFactor: (request: SecondFactorLoginRequest, email: string) => Promise<void>
  /** Выполнить действие, которое выдаёт этому устройству новую сессию (смена пароля). */
  replaceSession: (perform: (accessToken: string) => Promise<LoginResponse>) => Promise<void>
  logout: () => Promise<void>
  invalidateSession: () => void
  logoutEverywhere: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
