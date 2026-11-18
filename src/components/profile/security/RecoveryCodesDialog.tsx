import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../../../i18n/useTranslation.ts'
import styles from '../../../pages/ProfilePage.module.css'

/**
 * Резервные коды показываются один раз. Окно закрывается только кнопкой:
 * случайный Esc или щелчок мимо потеряли бы коды без возможности их увидеть.
 */
export function RecoveryCodesDialog({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  const text = codes.join('\n')

  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'parallel-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return createPortal(
    <dialog ref={dialog} className={styles.codesDialog} aria-labelledby={id + '-title'} aria-describedby={id + '-text'}
      onCancel={(event) => event.preventDefault()}>
      <h2 id={id + '-title'}>{t('security.codesTitle')}</h2>
      <p id={id + '-text'}>{t('security.codesText')}</p>
      <ul className={styles.codes} aria-label={t('security.codesList')}>
        {codes.map((code) => <li key={code}>{code}</li>)}
      </ul>
      <div className={styles.avatarButtons}>
        <button type="button" className={styles.secondary} onClick={() => void copy()}>{t('security.copy')}</button>
        <button type="button" className={styles.secondary} onClick={download}>{t('security.download')}</button>
        {copied ? <span className={copied === 'ok' ? styles.success : styles.error} role="status" style={{ margin: 0 }}>
          {t(copied === 'ok' ? 'security.copied' : 'security.copyFailed')}
        </span> : null}
      </div>
      <div className={styles.actions}>
        <span />
        <button type="button" className={styles.primary} autoFocus onClick={onClose}>{t('security.codesSaved')}</button>
      </div>
    </dialog>, document.body,
  )
}
