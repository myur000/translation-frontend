import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth.ts'
import { useTranslation } from '../i18n/useTranslation.ts'
import styles from './AuthProvider.module.css'

export function ProtectedRoute() {
  const { isAuthenticated, isRestoring, sessionIssue, session } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()
  const returnState = { from: {
    pathname: location.pathname, search: location.search, hash: location.hash,
  } }

  if (isRestoring) return <div className={styles.sessionState} role="status">{t('auth.restoringSession')}</div>

  if (!isAuthenticated) {
    if (sessionIssue === 'unavailable' || sessionIssue === 'coordination') {
      return (
        <section className={styles.sessionState} role="alert">
          <p>{t(sessionIssue === 'coordination' ? 'auth.coordinationUnavailable' : 'auth.renewalUnavailable')}</p>
          <Link to="/login" state={returnState}>{t('auth.signInAgain')}</Link>
        </section>
      )
    }
    return <Navigate to="/login" replace state={returnState} />
  }

  // Switching accounts in another tab must not retain the previous user's workspace.
  return <Outlet key={session?.email} />
}
