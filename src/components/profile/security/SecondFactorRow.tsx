import { useId, useState, type FormEvent } from 'react'
import {
  disableSecondFactor, enableSecondFactor, regenerateRecoveryCodes, setupSecondFactor,
} from '../../../api/accountSecurity.ts'
import type { SecondFactorSetup } from '../../../api/contracts/accountSecurity.ts'
import { securityError, type SecurityError } from '../../../account/securityErrors.ts'
import { useAccountAccess, useAccountCache, useSecondFactorStatus } from '../../../account/securityQueries.ts'
import { useTranslation } from '../../../i18n/useTranslation.ts'
import { AuthField } from '../../auth/AuthField.tsx'
import { RecoveryCodesDialog } from './RecoveryCodesDialog.tsx'
import styles from '../../../pages/ProfilePage.module.css'

type Flow =
  | { kind: 'idle' }
  | { kind: 'password' }
  | { kind: 'code'; setup: SecondFactorSetup }
  | { kind: 'regenerate' }
  | { kind: 'disable' }

/** Когда кодов почти не осталось, напоминаем выпустить новые. */
const FEW_CODES = 2
const APP_CODE = /^\d{6}$/

/** Секрет группами по четыре: так его легче перепечатать в приложение. */
const grouped = (secret: string) => secret.replace(/(.{4})(?=.)/g, '$1 ')

export function SecondFactorRow() {
  const { t } = useTranslation()
  const { token } = useAccountAccess()
  const status = useSecondFactorStatus()
  const { setSecondFactor, sessionsChanged } = useAccountCache()
  const id = useId()
  const [flow, setFlow] = useState<Flow>({ kind: 'idle' })
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [error, setError] = useState<SecurityError | null>(null)
  const [busy, setBusy] = useState(false)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [notice, setNotice] = useState<'disabled' | null>(null)

  const start = (next: Flow) => {
    setFlow(next); setPassword(''); setCode(''); setUseRecovery(false); setError(null); setNotice(null)
  }
  const run = async (work: (accessToken: string) => Promise<void>) => {
    if (!token) return
    setBusy(true)
    setError(null)
    try { await work(token) } catch (failure) { setError(securityError(failure, t)) } finally { setBusy(false) }
  }
  const needPassword = () => {
    if (password) return true
    setError({ message: t('validation.passwordRequired'), field: 'password' })
    return false
  }
  const needCode = (allowRecovery: boolean) => {
    const value = code.replace(/\s/g, '')
    if (allowRecovery && useRecovery ? value.length >= 12 : APP_CODE.test(value)) return value
    setError({ message: t(allowRecovery && useRecovery ? 'login.recoveryCodeFormat' : 'login.codeFormat'), field: 'code' })
    return null
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (flow.kind === 'password') {
      if (!needPassword()) return
      void run(async (accessToken) => {
        const setup = await setupSecondFactor(password, { accessToken })
        setPassword('')
        setFlow({ kind: 'code', setup })
      })
    } else if (flow.kind === 'code') {
      const value = needCode(false)
      if (!value) return
      void run(async (accessToken) => {
        const result = await enableSecondFactor(value, { accessToken })
        setSecondFactor({ enabled: true, recoveryCodesLeft: result.recoveryCodes.length })
        // Остальные сеансы бэк завершил: их открыли одним паролем.
        sessionsChanged()
        start({ kind: 'idle' })
        setCodes(result.recoveryCodes)
      })
    } else if (flow.kind === 'regenerate') {
      if (!needPassword()) return
      const value = needCode(false)
      if (!value) return
      void run(async (accessToken) => {
        const result = await regenerateRecoveryCodes({ currentPassword: password, code: value }, { accessToken })
        setSecondFactor({ enabled: true, recoveryCodesLeft: result.recoveryCodes.length })
        start({ kind: 'idle' })
        setCodes(result.recoveryCodes)
      })
    } else if (flow.kind === 'disable') {
      if (!needPassword()) return
      const value = needCode(true)
      if (!value) return
      void run(async (accessToken) => {
        await disableSecondFactor(useRecovery ? { currentPassword: password, recoveryCode: value }
          : { currentPassword: password, code: value }, { accessToken })
        setSecondFactor({ enabled: false, recoveryCodesLeft: 0 })
        start({ kind: 'idle' })
        setNotice('disabled')
      })
    }
  }

  const passwordField = (
    <AuthField id={id + '-password'} label={t('security.currentPassword')} type="password" value={password}
      autoComplete="current-password" autoFocus disabled={busy}
      error={error?.field === 'password' ? error.message : undefined}
      onChange={(event) => { setPassword(event.currentTarget.value); setError(null) }} />
  )
  const codeField = (allowRecovery: boolean) => (
    <AuthField key={useRecovery ? 'recovery' : 'app'} id={id + '-code'} type="text"
      label={t(allowRecovery && useRecovery ? 'login.recoveryCode' : 'login.appCode')}
      value={code} disabled={busy} spellCheck={false} className={styles.secret}
      autoComplete={allowRecovery && useRecovery ? 'off' : 'one-time-code'}
      inputMode={allowRecovery && useRecovery ? 'text' : 'numeric'} maxLength={allowRecovery && useRecovery ? 16 : 7}
      autoFocus={flow.kind === 'code'}
      error={error?.field === 'code' ? error.message : undefined}
      onChange={(event) => { setCode(event.currentTarget.value); setError(null) }} />
  )

  const data = status.data
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <p className={styles.rowTitle}>
          {t('security.secondFactor')}
          {data ? <span className={`${styles.pill} ${data.enabled ? styles.pillOn : styles.pillOff}`}>
            {t(data.enabled ? 'security.on' : 'security.off')}
          </span> : null}
        </p>
        <p className={styles.rowText}>
          {data?.enabled ? t('security.secondFactorOnHint', { count: data.recoveryCodesLeft }) : t('security.secondFactorOffHint')}
        </p>
        {status.isPending ? <p className={styles.rowText} role="status">{t('security.loading')}</p> : null}
        {status.isError && !data ? <p className={styles.error} role="alert">
          {t('security.statusError')} <button type="button" className={styles.inlineButton}
            onClick={() => void status.refetch()}>{t('profile.retry')}</button>
        </p> : null}
      </div>
      {data && flow.kind === 'idle' ? (
        <div className={styles.rowActions}>
          {data.enabled ? <>
            <button type="button" className={styles.secondary} onClick={() => start({ kind: 'regenerate' })}>
              {t('security.newCodes')}
            </button>
            <button type="button" className={styles.dangerButton} onClick={() => start({ kind: 'disable' })}>
              {t('security.turnOff')}
            </button>
          </> : (
            <button type="button" className={styles.secondary} onClick={() => start({ kind: 'password' })}>
              {t('security.turnOn')}
            </button>
          )}
        </div>
      ) : null}
      {data?.enabled && data.recoveryCodesLeft <= FEW_CODES && flow.kind === 'idle' ? (
        <p className={styles.warningNotice} role="status" style={{ flex: '1 1 100%' }}>{t('security.fewCodes')}</p>
      ) : null}
      {notice ? <p className={styles.notice} role="status">{t('security.secondFactorDisabled')}</p> : null}

      {flow.kind !== 'idle' ? (
        <form className={styles.panel} noValidate aria-busy={busy} onSubmit={submit}
          aria-label={t(flow.kind === 'disable' ? 'security.turnOff' : flow.kind === 'regenerate' ? 'security.newCodes' : 'security.turnOn')}>
          {flow.kind === 'password' ? <>
            <p className={styles.rowText}>{t('security.enableStep1')}</p>
            <div className={styles.panelFields}>{passwordField}</div>
          </> : null}
          {flow.kind === 'code' ? <>
            <ol className={styles.steps}>
              <li>{t('security.enableStepApp')}</li>
              <li>{t('security.enableStepKey')}</li>
              <li>{t('security.enableStepCode')}</li>
            </ol>
            <div>
              <p className={styles.rowText}>{t('security.secretLabel')}</p>
              <p className={styles.secret}>{grouped(flow.setup.secret)}</p>
              {/* На телефоне ссылка сразу открывает приложение-аутентификатор. */}
              <a className={styles.inlineButton} href={flow.setup.otpauthUri}>{t('security.openInApp')}</a>
            </div>
            <div className={styles.panelFields}>{codeField(false)}</div>
            <p className={styles.warningNotice}>{t('security.enableWarning')}</p>
          </> : null}
          {flow.kind === 'regenerate' || flow.kind === 'disable' ? <>
            <p className={styles.rowText}>{t(flow.kind === 'disable' ? 'security.disableHint' : 'security.newCodesHint')}</p>
            <div className={styles.panelFields}>{passwordField}{codeField(flow.kind === 'disable')}</div>
            {flow.kind === 'disable' ? (
              <button type="button" className={styles.inlineButton} style={{ justifySelf: 'start' }}
                onClick={() => { setUseRecovery((value) => !value); setCode(''); setError(null) }}>
                {t(useRecovery ? 'login.useAppCode' : 'login.useRecoveryCode')}
              </button>
            ) : null}
          </> : null}
          {error && !error.field ? <p className={styles.error} role="alert">{error.message}</p> : null}
          <div className={styles.panelActions}>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => start({ kind: 'idle' })}>
              {t('common.cancel')}
            </button>
            <button type="submit" className={flow.kind === 'disable' ? styles.dangerButton : styles.primary} disabled={busy}>
              {t(busy ? 'security.saving'
                : flow.kind === 'password' ? 'security.continue'
                  : flow.kind === 'code' ? 'security.turnOn'
                    : flow.kind === 'disable' ? 'security.turnOff' : 'security.issueCodes')}
            </button>
          </div>
        </form>
      ) : null}
      {codes ? <RecoveryCodesDialog codes={codes} onClose={() => setCodes(null)} /> : null}
    </li>
  )
}
