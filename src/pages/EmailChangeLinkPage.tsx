import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { cancelEmailChange, confirmEmailChange } from '../api/accountSecurity.ts'
import { ApiClientError, hasApiErrorCode } from '../api/client.ts'
import { readLinkToken } from '../auth/linkToken.ts'
import { useAuth } from '../auth/useAuth.ts'
import { AuthStatusCard } from '../components/auth/AuthStatusCard.tsx'
import { useTranslation } from '../i18n/useTranslation.ts'
import styles from './AuthPage.module.css'

type Action = 'confirm' | 'cancel'
type State = { status: 'idle' | 'sending' | 'done' } | { status: 'error'; message: string }

/**
 * Ссылки из писем о смене почты: подтверждение (на новый адрес) и отмена
 * (на старый). Запрос уходит по кнопке, а не при открытии: почтовые сканеры
 * открывают ссылки сами, и отмена завершила бы все сеансы без ведома человека.
 */
export function EmailChangeLinkPage({ action }: { action: Action }) {
  const location = useLocation()
  const { invalidateSession } = useAuth()
  const { t } = useTranslation()
  const [token] = useState(() => readLinkToken(location))
  const [state, setState] = useState<State>({ status: 'idle' })
  const prefix = action === 'confirm' ? 'emailChange.confirm' : 'emailChange.cancel'

  const send = async () => {
    setState({ status: 'sending' })
    try {
      await (action === 'confirm' ? confirmEmailChange : cancelEmailChange)({ token })
      // Бэк завершил все сеансы аккаунта, в том числе этот, если он открыт здесь.
      invalidateSession()
      setState({ status: 'done' })
    } catch (error) {
      setState({
        status: 'error',
        message: hasApiErrorCode(error, 'INVALID_ACTION_LINK') ? t(`${prefix}.invalid`)
          : hasApiErrorCode(error, 'EMAIL_ALREADY_USED') ? t('emailChange.confirm.taken')
            : error instanceof ApiClientError && error.status === 429 ? t('error.tooManyRequests')
              : t('emailChange.failed'),
      })
    }
  }

  if (!token) return (
    <AuthStatusCard tone="error" title={t('emailChange.invalidTitle')} description={<p>{t('emailChange.missingToken')}</p>}>
      <Link to="/login">{t('register.goToLogin')}</Link>
    </AuthStatusCard>
  )
  if (state.status === 'done') return (
    <AuthStatusCard tone="success" title={t(`${prefix}.doneTitle`)} description={<p>{t(`${prefix}.doneText`)}</p>}>
      <Link to="/login">{t('register.goToLogin')}</Link>
    </AuthStatusCard>
  )
  if (state.status === 'error') return (
    <AuthStatusCard tone="error" title={t('emailChange.invalidTitle')} description={<p>{state.message}</p>}>
      <Link to="/login">{t('register.goToLogin')}</Link>
    </AuthStatusCard>
  )

  return (
    <section aria-labelledby="email-change-title">
      <header className={styles.header}>
        <h1 id="email-change-title">{t(`${prefix}.title`)}</h1>
        <p>{t(`${prefix}.text`)}</p>
      </header>
      <div className={styles.form}>
        <button type="button" className={styles.submitButton} disabled={state.status === 'sending'} onClick={() => void send()}>
          {t(state.status === 'sending' ? 'emailChange.sending' : `${prefix}.action`)}
        </button>
      </div>
    </section>
  )
}
