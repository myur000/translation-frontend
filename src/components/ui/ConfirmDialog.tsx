import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './ConfirmDialog.module.css'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { t } = useTranslation()
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = dialog.current!
    const previousFocus = document.activeElement as HTMLElement | null
    element.showModal()
    cancel.current?.focus()
    return () => {
      element.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])
  return createPortal(
    <dialog ref={dialog} className={styles.dialog} role="alertdialog"
      aria-labelledby={id + '-title'} aria-describedby={id + '-description'} aria-busy={props.busy}
      onCancel={(event) => { event.preventDefault(); if (!props.busy) props.onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget && !props.busy) props.onClose() }}>
      <h2 id={id + '-title'}>{props.title}</h2>
      <p id={id + '-description'}>{props.description}</p>
      {props.error ? <p className={styles.error} role="alert">{props.error}</p> : null}
      <div className={styles.actions}>
        <button ref={cancel} type="button" disabled={props.busy} onClick={props.onClose}>{t('common.cancel')}</button>
        <button type="button" className={styles.confirm} disabled={props.busy} onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    </dialog>, document.body,
  )
}
