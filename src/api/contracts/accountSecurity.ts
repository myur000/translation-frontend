import type { ISO8601DateTime, UUID } from './common.ts'

// Имена полей — как отдаёт бэк: в этих запросах camelCase, в списке сеансов
// snake_case (docs/backend-issues.md, п. 6).

/** `POST /account/password`. Ответ — новая сессия (`LoginResponse`): остальные завершаются. */
export interface PasswordChangeRequest {
  currentPassword: string
  newPassword: string
}

/** `POST /account/email-change`, 202 без тела, в том числе для занятого адреса. */
export interface EmailChangeRequest {
  newEmail: string
  currentPassword: string
}

/** Один вход в веб-версию (`GET /account/sessions`). */
export interface AccountSession {
  id: UUID
  /** «Chrome, macOS»; `null`, если клиент не распознан. */
  device: string | null
  created_at: ISO8601DateTime
  /** Вход или последнее продление. */
  last_used_at: ISO8601DateTime
  expires_at: ISO8601DateTime
  /** Сеанс этого запроса. */
  current: boolean
}

export interface SecondFactorStatus {
  enabled: boolean
  recoveryCodesLeft: number
}

/** Шаг 1 подключения: секрет показывается один раз, для приложения-аутентификатора. */
export interface SecondFactorSetup {
  secret: string
  otpauthUri: string
}

/** Ровно одно из двух: код из приложения или резервный код. */
export type SecondFactorProof =
  | { code: string; recoveryCode?: never }
  | { recoveryCode: string; code?: never }

/** Резервные коды: показываются один раз, бэк хранит только их хеши. */
export interface RecoveryCodes {
  recoveryCodes: string[]
}

/** 202 на `POST /auth/login`, если у аккаунта включена двухэтапная проверка. */
export interface SecondFactorChallenge {
  secondFactorRequired: true
  challenge: string
  /** Секунды на ввод кода. */
  expiresIn: number
}

export type SecondFactorLoginRequest = { challenge: string } & SecondFactorProof
