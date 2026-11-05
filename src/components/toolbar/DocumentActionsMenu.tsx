import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
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
  /** Accessible name of the trigger; defaults to "Document actions". */
  label?: string
  /** Extra classes for the root, e.g. to show the trigger only on hover. */
  className?: string
  /** `quiet` — borderless trigger for dense lists. */
  variant?: 'default' | 'quiet'
  /**
   * Render the menu at the page level with fixed positioning. Needed inside
   * scrolling containers (the sidebar list), which would clip it.
   */
  portal?: boolean
}

const MENU_WIDTH = 230
const MENU_ITEM_HEIGHT = 34

function fixedMenuPosition(trigger: DOMRect, itemCount: number): CSSProperties {
  const height = itemCount * MENU_ITEM_HEIGHT + 8
  const opensUp = trigger.bottom + 6 + height > window.innerHeight - 8
  return {
    position: 'fixed',
    top: opensUp ? Math.max(8, trigger.top - 6 - height) : trigger.bottom + 6,
    left: Math.max(8, Math.min(trigger.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    right: 'auto',
  }
}

/** "⋯" menu for less frequent document actions (WAI-ARIA menu button). */
export function DocumentActionsMenu({
  actions,
  label,
  className,
  variant = 'default',
  portal = false,
}: DocumentActionsMenuProps) {
  const { t } = useTranslation()
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [isOpen, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>(undefined)
  const name = label ?? t('documentActions.open')

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
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
    <div className={`${styles.root} ${className ?? ''}`} ref={rootRef} data-open={isOpen || undefined}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${variant === 'quiet' ? styles.quiet : ''}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={name}
        title={name}
        onClick={(event) => {
          // Inside a list item the click must not also select the item.
          event.stopPropagation()
          if (!isOpen && portal) {
            setMenuStyle(fixedMenuPosition(event.currentTarget.getBoundingClientRect(), actions.length))
          }
          setOpen((value) => !value)
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.25" />
          <circle cx="8" cy="8" r="1.25" />
          <circle cx="12.5" cy="8" r="1.25" />
        </svg>
      </button>
      {isOpen ? renderMenu() : null}
    </div>
  )

  function renderMenu() {
    const menu = (
        <div
          ref={menuRef}
          id={menuId}
          className={styles.menu}
          style={portal ? menuStyle : undefined}
          role="menu"
          aria-label={name}
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
    )
    return portal ? createPortal(menu, window.document.body) : menu
  }
}
