import {
  useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode,
} from 'react'
import { apiClient, subscribeToAccessErrors } from '../api/client.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import { AuthContext, type AuthContextValue } from './AuthContext.ts'
import { clearAuthSession, readAuthSession } from './authStorage.ts'
import { SessionController } from './sessionController.ts'
import styles from './AuthProvider.module.css'

interface AuthProviderProps { children: ReactNode }

export function AuthProvider({ children }: AuthProviderProps) {
  const { t } = useTranslation()
  const [controller] = useState(() => new SessionController(readAuthSession()))
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { session, isRestoring, issue } = snapshot
  const [accessNotice, setAccessNotice] = useState('')

  useEffect(() => {
    // Migrate an existing valid access token once, then keep all JWTs in memory.
    clearAuthSession()
    const disconnect = controller.connect()
    const removeRecovery = apiClient.setSessionRecovery(controller)
    void controller.bootstrap()
    return () => { removeRecovery(); disconnect() }
  }, [controller])

  useEffect(() => {
    if (!session || issue) return
    const renew = () => {
      if (session.expiresAt - Date.now() <= 60_000) {
        void controller.refresh().catch(() => undefined)
      }
    }
    const delay = Math.max(0, session.expiresAt - Date.now() - 60_000)
    const timeout = window.setTimeout(renew, Math.min(delay, 2_147_483_647))
    const handleVisibility = () => { if (document.visibilityState === 'visible') renew() }
    window.addEventListener('focus', renew)
    window.addEventListener('online', renew)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('focus', renew)
      window.removeEventListener('online', renew)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [controller, session, issue])

  useEffect(() => subscribeToAccessErrors((error) => {
    if (error.status === 403) setAccessNotice(t('auth.accessDenied'))
  }), [controller, t])

  const dismissNotice = useCallback(() => setAccessNotice(''), [])
  const value = useMemo<AuthContextValue>(() => ({
    session, isAuthenticated: session !== null, isRestoring, sessionIssue: issue,
    login: controller.login, logout: controller.logout,
    logoutEverywhere: controller.logoutEverywhere,
    invalidateSession: controller.invalidate,
  }), [controller, session, isRestoring, issue])

  const issueNotice = issue === 'expired' ? t('auth.sessionExpired')
    : issue === 'logoutFailed' ? t('auth.logoutFailed')
    : issue === 'coordination' ? t('auth.coordinationUnavailable')
    : issue === 'unavailable' && session ? t('auth.renewalUnavailable') : ''
  const notice = accessNotice || issueNotice

  return (
    <AuthContext.Provider value={value}>
      {children}
      {notice ? (
        <div className={styles.notice} role="alert">
          <span>{notice}</span>
          {accessNotice ? (
            <button type="button" aria-label={t('auth.closeAccessNotice')} onClick={dismissNotice}>×</button>
          ) : null}
        </div>
      ) : null}
    </AuthContext.Provider>
  )
}
