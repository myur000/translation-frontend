import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../../i18n/useTranslation.ts'
import styles from './DocumentActionsMenu.module.css'

export type DocumentActionIcon = 'note' | 'summary' | 'download' | 'pin' | 'unpin' | 'read' | 'unread' | 'star' | 'language' | 'cancel' | 'trash'

/** Контуры иконок пунктов меню в сетке 16×16, рисуются линией. */
const ACTION_ICON_PATHS: Record<DocumentActionIcon, string> = {
  note: 'M4 2.5h5.2L12 5.3v8.2H4zM9.2 2.5v2.8H12M6.2 8.2h3.6M6.2 10.7h2.4',
  // Тетрадь с корешком — конспект книги.
  summary: 'M4 2.5h8.5v11H4zM4 2.5v11M2.5 5h3M2.5 8h3M2.5 11h3M7 6h3.5',
  download: 'M8 2.5v8m0 0 3-3m-3 3-3-3M3 12.5h10',
  pin: 'M6 2.5h4l-.6 4 2.1 2.2H4.5l2.1-2.2zM8 8.7v4.8',
  unpin: 'M6 2.5h4l-.6 4 2.1 2.2H4.5l2.1-2.2zM8 8.7v4.8M2.5 2.5l11 11',
  // Раскрытая книга: с галочкой — «отметить прочитанной», пустая — «снять отметку».
  read: 'M8 4.2C6.6 3.2 4.6 2.8 2 3v8.6c2.6-.2 4.6.2 6 1.2 1.4-1 3.4-1.4 6-1.2V3c-2.6-.2-4.6.2-6 1.2zM8 4.2v8.6M9.8 8.2l1.2 1.2 2-2.4',
  unread: 'M8 4.2C6.6 3.2 4.6 2.8 2 3v8.6c2.6-.2 4.6.2 6 1.2 1.4-1 3.4-1.4 6-1.2V3c-2.6-.2-4.6.2-6 1.2zM8 4.2v8.6',
  star: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z',
  language: 'M2 3.5h6.5M5.2 2v1.5M7.4 3.5c-.4 2.6-2 4.5-4.6 5.7M4.4 5.8c.8 1.5 2 2.6 3.6 3.3M8.8 14l2.6-6.2L14 14M9.6 12.2h3.6',
  cancel: 'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8zM5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4',
  trash: 'M2.8 4.5h10.4M6.3 4.5V2.8h3.4v1.7M4.3 4.5l.7 8.7h6l.7-8.7M6.7 7v3.8M9.3 7v3.8',
}

export interface DocumentAction {
  id: string
  label: string
  icon?: DocumentActionIcon
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
              {action.icon ? (
                <svg viewBox="0 0 16 16" aria-hidden="true" className={styles.icon}>
                  <path d={ACTION_ICON_PATHS[action.icon]} />
                </svg>
              ) : null}
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
