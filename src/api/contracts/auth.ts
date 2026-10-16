import type { ISO8601DateTime, UUID } from './common.ts'

export interface RegisterRequest {
  email: string
  password: string
}

export interface RegisterResponse {
  id: UUID
  email: string
  createdAt: ISO8601DateTime
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
}

export interface AccountEmailRequest {
  email: string
}

export interface AccountTokenRequest {
  token: string
}

export interface PasswordResetConfirmRequest {
  token: string
  password: string
}

export interface AccessTokenHeader {
  alg: 'HS256'
  typ: 'JWT'
  kid: string
}

export interface AccessTokenClaims {
  sub: UUID
  iss: string
  aud: string[]
  email: string
  email_verified: boolean
  auth_version: number
  sid?: UUID
  iat: number
  exp: number
}
