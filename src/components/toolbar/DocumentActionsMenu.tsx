import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './DocumentActionsMenu.module.css'

export interface DocumentAction {
  id: string
  label: string
  /** Shown as a tooltip when the action is disabled. */
  disabledReason?: string
  danger?: boolean
  onSelect: () => void
}

interface DocumentActionsMenuProps {
  actions: DocumentAction[]
}

/** "⋯" menu for less frequent document actions (WAI-ARIA menu button). */
export function DocumentActionsMenu({ actions }: DocumentActionsMenuProps) {
  const { t } = useTranslation()
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [isOpen, setOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    itemRefs.current.find((item) => item?.getAttribute('aria-disabled') !== 'true')?.focus()
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Disabled items stay out of arrow navigation but keep their tooltip.
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement =>
      Boolean(item && item.getAttribute('aria-disabled') !== 'true'))
    const index = enabled.indexOf(window.document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && enabled.length) {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      enabled[(index + step + enabled.length) % enabled.length].focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={t('documentActions.open')}
        title={t('documentActions.open')}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="12.5" cy="8" r="1.25" />
        </svg>
      </button>
      {isOpen ? (
        <div
          id={menuId}
          className={styles.menu}
          role="menu"
          aria-label={t('documentActions.open')}
          onKeyDown={handleMenuKeyDown}
        >
          {actions.map((action, index) => (
            <button
              key={action.id}
              ref={(element) => {
                itemRefs.current[index] = element
              }}
              type="button"
              role="menuitem"
              className={action.danger ? styles.danger : undefined}
              aria-disabled={Boolean(action.disabledReason)}
              title={action.disabledReason}
              onClick={() => {
                if (action.disabledReason) return
                setOpen(false)
                action.onSelect()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
