import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './DocumentActionsMenu.module.css'

export interface DocumentAction {
  id: string
  label: string
  /** Подсказка, которая показывается, когда действие недоступно. */
  disabledReason?: string
  danger?: boolean
  /** Переключатель вместо команды: пункт показывает галочку (menuitemcheckbox). */
  checked?: boolean
  onSelect: () => void
}

interface DocumentActionsMenuProps {
  actions: DocumentAction[]
  /** Доступное имя кнопки; по умолчанию «Действия с документом». */
  label?: string
  /** Дополнительные классы корня, например чтобы показывать кнопку только при наведении. */
  className?: string
  /** `quiet` — кнопка без рамки для плотных списков. */
  variant?: 'default' | 'quiet'
  /**
   * Отрисовывать меню на уровне страницы с фиксированным позиционированием.
   * Нужно внутри прокручиваемых контейнеров (список в боковой панели), которые бы его обрезали.
   */
  portal?: boolean
  /** Иконка кнопки: «⋯» для действий с документом, «+» для добавления. */
  icon?: 'more' | 'plus'
  /** По какому краю кнопки выравнивается меню. */
  align?: 'start' | 'end'
}

const MENU_WIDTH = 230
const MENU_ITEM_HEIGHT = 34

function fixedMenuPosition(trigger: DOMRect, itemCount: number, align: 'start' | 'end'): CSSProperties {
  const height = itemCount * MENU_ITEM_HEIGHT + 8
  const opensUp = trigger.bottom + 6 + height > window.innerHeight - 8
  const left = align === 'start' ? trigger.left : trigger.right - MENU_WIDTH
  return {
    position: 'fixed',
    top: opensUp ? Math.max(8, trigger.top - 6 - height) : trigger.bottom + 6,
    left: Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8)),
    right: 'auto',
  }
}

/** Меню «⋯» для редких действий с документом (кнопка меню по WAI-ARIA). */
export function DocumentActionsMenu({
  actions,
  label,
  className,
  variant = 'default',
  portal = false,
  icon = 'more',
  align = 'end',
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
    // Недоступные пункты пропускаются при навигации стрелками, но сохраняют подсказку.
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
          // Внутри элемента списка клик не должен заодно выбирать этот элемент.
          event.stopPropagation()
          if (!isOpen && portal) {
            setMenuStyle(fixedMenuPosition(event.currentTarget.getBoundingClientRect(), actions.length, align))
          }
          setOpen((value) => !value)
        }}
      >
        {icon === 'plus' ? (
          <svg viewBox="0 0 16 16" aria-hidden="true" className={styles.plusIcon}>
            <path d="M8 3v10M3 8h10" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="3.5" cy="8" r="1.25" />
            <circle cx="8" cy="8" r="1.25" />
            <circle cx="12.5" cy="8" r="1.25" />
          </svg>
        )}
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
              role={action.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              className={action.danger ? styles.danger : undefined}
              aria-checked={action.checked}
              aria-disabled={Boolean(action.disabledReason)}
              title={action.disabledReason}
              onClick={() => {
                if (action.disabledReason) return
                setOpen(false)
                action.onSelect()
              }}
            >
              {action.checked !== undefined ? (
                <svg viewBox="0 0 16 16" aria-hidden="true" className={styles.check} data-checked={action.checked || undefined}>
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              ) : null}
              {action.label}
            </button>
          ))}
        </div>
    )
    return portal ? createPortal(menu, window.document.body) : menu
  }
}
