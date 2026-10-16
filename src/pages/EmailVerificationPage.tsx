import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { confirmEmailVerification } from '../api/auth.ts'
import { ApiClientError } from '../api/client.ts'
import { useAuth } from '../auth/useAuth.ts'
import { AuthStatusCard } from '../components/auth/AuthStatusCard.tsx'
import { useTranslation } from '../i18n/useTranslation.ts'
import type { TranslationKey } from '../i18n/translations.ts'

type VerificationState = 'loading' | 'success' | 'error'
interface VerificationResult { state: VerificationState; message: string }
type T = (key: TranslationKey, variables?: Record<string, string | number>) => string

function getVerificationError(error: unknown, t: T) {
  if (error instanceof ApiClientError) {
    if (error.status === 410) return t('verify.expired')
    if (error.status === 400) return t('verify.invalid')
  }
  return t('verify.error')
}

export function EmailVerificationPage() {
  const location = useLocation()
  const { invalidateSession } = useAuth()
  const { t } = useTranslation()
  const token = new URLSearchParams(location.search).get('token')?.trim() ?? ''
  const processedToken = useRef<string | null>(null)
  const [result, setResult] = useState<VerificationResult>(() =>
    token ? { state: 'loading', message: t('verify.checking') } : { state: 'error', message: t('verify.missingToken') },
  )

  useEffect(() => {
    if (!token || processedToken.current === token) return
    processedToken.current = token
    setResult({ state: 'loading', message: t('verify.checking') })
    void confirmEmailVerification({ token })
      .then(() => {
        invalidateSession()
        setResult({ state: 'success', message: t('verify.successMessage') })
      })
      .catch((error: unknown) => setResult({ state: 'error', message: getVerificationError(error, t) }))
  }, [invalidateSession, t, token])

  const title = result.state === 'loading'
    ? t('auth.verifyLabel')
    : result.state === 'success'
      ? t('verify.successTitle')
      : t('verify.errorTitle')

  return (
    <AuthStatusCard tone={result.state} title={title} description={<p>{result.message}</p>}>
      {result.state !== 'loading' ? <Link to="/login">{t('register.goToLogin')}</Link> : null}
    </AuthStatusCard>
  )
}
