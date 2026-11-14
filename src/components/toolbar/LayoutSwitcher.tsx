import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { usePreferences } from '../../preferences/usePreferences.ts'
import { LAYOUT_PRESET_ORDER, type LayoutPreset } from '../../workspace/workspaceLayout.ts'
import styles from './LayoutSwitcher.module.css'

/** Язык колонки: код — в имени для диктора («Перевод RU»), полное название — в подписи меню. */
export interface PaneLanguage {
  code: string
  label: string
}

interface LayoutSwitcherProps {
  value: LayoutPreset
  onChange: (preset: LayoutPreset) => void
  source: PaneLanguage
  target: PaneLanguage
  /** Синхронная прокрутка колонок — пункт-галочка того же меню: она нужна только в сравнении. */
  scrollSync: { isEnabled: boolean; onToggle: () => void }
}

/**
 * Вид документа — кнопка с меню. Читают почти всегда перевод, а сравнение и
 * оригинал нужны изредка, поэтому три режима не стоят в нижней панели рядом,
 * а спрятаны в меню. На кнопке — тонкая иконка колонок и название вида, её имя
 * называет вид с кодом языка («Вид: Перевод RU»). Меню по WAI-ARIA: пункты menuitemradio, стрелки,
 * Home/End, Esc возвращает фокус на кнопку. Открывается вверх: панель внизу.
 */
export function LayoutSwitcher({ value, onChange, source, target, scrollSync }: LayoutSwitcherProps) {
  const { t } = useTranslation()
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const isOpen = menuStyle !== null
  // Подсветка цитат — настройка чтения, а не раскладки документа: хранится в настройках интерфейса.
  const { isQuoteHighlightEnabled, setQuoteHighlightEnabled } = usePreferences()

  const options: Record<LayoutPreset, { name: string; label: string; hint: string; languages: string; icon: ReactElement }> = {
    translation: {
      name: t('layout.translationName'),
      label: t('layout.translationOption', { code: target.code }),
      hint: t('layout.translationHint', { language: target.label }),
      languages: target.label,
      icon: <ColumnsIcon count={1} />,
    },
    compare: {
      name: t('layout.compareName'),
      label: t('layout.compareOption', { source: source.code, target: target.code }),
      hint: t('layout.compareHint', { source: source.label, target: target.label }),
      languages: t('layout.compareLanguages', { source: source.label, target: target.label }),
      icon: <ColumnsIcon count={2} />,
    },
    original: {
      name: t('layout.originalName'),
      label: t('layout.originalOption', { code: source.code }),
      hint: t('layout.originalHint', { language: source.label }),
      languages: source.label,
      icon: <ColumnsIcon count={1} />,
    },
  }

  useEffect(() => {
    if (!isOpen) return
    itemRefs.current[LAYOUT_PRESET_ORDER.indexOf(value)]?.focus()
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setMenuStyle(null)
    }
    const handleResize = () => setMenuStyle(null)
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', handleResize)
    }
    // value меняется только выбором пункта, а он закрывает меню: фокус ставится один раз.
  }, [isOpen, value])

  const open = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    // Меню в портале с фиксированным положением: нижняя панель обрезала бы его.
    // Над кнопкой и по её левому краю, но не за краем окна.
    setMenuStyle(rect
      ? { position: 'fixed', bottom: window.innerHeight - rect.top + 8, left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)) }
      : { position: 'fixed', bottom: 72, left: 8 })
  }
  const close = () => {
    setMenuStyle(null)
    triggerRef.current?.focus()
  }
  const choose = (preset: LayoutPreset) => {
    close()
    if (preset !== value) onChange(preset)
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter((item): item is HTMLButtonElement =>
      Boolean(item && item.getAttribute('aria-disabled') !== 'true'))
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? index + 1
      : event.key === 'ArrowUp' ? index - 1
        : event.key === 'Home' ? 0
          : event.key === 'End' ? items.length - 1
            : null
    if (event.key === 'Escape') {
      event.preventDefault()
      // Esc закрывает меню, а не полноэкранный режим.
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      setMenuStyle(null)
    } else if (next !== null && items.length) {
      event.preventDefault()
      items[(next + items.length) % items.length].focus()
    }
  }

  const current = options[value]
  // Связывать прокрутку можно только в сравнении; настройка при этом сохраняется.
  const canSyncScroll = value === 'compare'
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={t('layout.menu', { current: current.label })}
        title={current.hint}
        onClick={() => (isOpen ? setMenuStyle(null) : open())}
        onKeyDown={(event) => {
          // Стрелка вверх открывает меню, как у кнопки меню в нижней части экрана.
          if (event.key === 'ArrowUp' && !isOpen) {
            event.preventDefault()
            open()
          }
        }}
      >
        {current.icon}
        <span className={styles.triggerName}>{current.name}</span>
        <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg>
      </button>
      {isOpen ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          className={styles.menu}
          style={menuStyle}
          role="menu"
          aria-label={t('layout.label')}
          onKeyDown={handleMenuKeyDown}
        >
          {LAYOUT_PRESET_ORDER.map((preset, index) => (
            <button
              key={preset}
              ref={(element) => { itemRefs.current[index] = element }}
              type="button"
              role="menuitemradio"
              aria-checked={value === preset}
              aria-label={options[preset].label}
              aria-description={options[preset].hint}
              className={styles.item}
              onClick={() => choose(preset)}
            >
              <span className={styles.itemIcon} aria-hidden="true">{options[preset].icon}</span>
              <span className={styles.itemText} aria-hidden="true">
                <span className={styles.itemName}>{options[preset].name}</span>
                <span className={styles.itemHint}>{options[preset].languages}</span>
              </span>
              <svg className={styles.check} viewBox="0 0 16 16" aria-hidden="true" data-checked={value === preset || undefined}>
                <path d="m3.5 8.5 3 3 6-7" />
              </svg>
            </button>
          ))}
          <div className={styles.separator} role="separator" />
          <button
            ref={(element) => { itemRefs.current[LAYOUT_PRESET_ORDER.length] = element }}
            type="button"
            role="menuitemcheckbox"
            aria-checked={scrollSync.isEnabled}
            // aria-disabled, а не disabled: пункт виден и объясняет, почему недоступен.
            aria-disabled={!canSyncScroll || undefined}
            aria-label={t('layout.scrollSync')}
            aria-description={t(canSyncScroll ? 'layout.scrollSyncHint' : 'layout.scrollSyncCompareOnly')}
            className={styles.item}
            onClick={() => {
              if (!canSyncScroll) return
              close()
              scrollSync.onToggle()
            }}
          >
            <span className={styles.itemIcon} aria-hidden="true"><ScrollSyncIcon /></span>
            <span className={styles.itemText} aria-hidden="true">
              <span className={styles.itemName}>{t('layout.scrollSync')}</span>
              <span className={styles.itemHint}>{t(canSyncScroll ? 'layout.scrollSyncHint' : 'layout.scrollSyncCompareOnly')}</span>
            </span>
            <svg className={styles.check} viewBox="0 0 16 16" aria-hidden="true" data-checked={scrollSync.isEnabled || undefined}>
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
          </button>
          <button
            ref={(element) => { itemRefs.current[LAYOUT_PRESET_ORDER.length + 1] = element }}
            type="button"
            role="menuitemcheckbox"
            aria-checked={isQuoteHighlightEnabled}
            aria-label={t('layout.quoteHighlight')}
            aria-description={t('layout.quoteHighlightHint')}
            className={styles.item}
            onClick={() => {
              close()
              setQuoteHighlightEnabled(!isQuoteHighlightEnabled)
            }}
          >
            <span className={styles.itemIcon} aria-hidden="true"><HighlightIcon /></span>
            <span className={styles.itemText} aria-hidden="true">
              <span className={styles.itemName}>{t('layout.quoteHighlight')}</span>
              <span className={styles.itemHint}>{t('layout.quoteHighlightHint')}</span>
            </span>
            <svg className={styles.check} viewBox="0 0 16 16" aria-hidden="true" data-checked={isQuoteHighlightEnabled || undefined}>
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
          </button>
        </div>,
        document.body,
      ) : null}
    </>
  )
}

/** Ширина меню вида: под самую длинную подпись языков («Английский и Русский»). */
const MENU_WIDTH = 240

/** Строка текста с цветной полосой маркера под словами — подсветка цитат. */
function HighlightIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 5.5h11M2.5 9h6.5M2.5 12.5h9" />
      <rect className={styles.marker} x="2" y="7.4" width="8" height="3.2" rx="1" />
    </svg>
  )
}

/** Две полосы прокрутки с ползунками на одной высоте — колонки листаются вместе. */
function ScrollSyncIcon() {
  return (
    <svg className={styles.syncIcon} viewBox="0 0 24 24" aria-hidden="true">
      <rect className={styles.track} x="4.5" y="3" width="5" height="18" rx="2.5" />
      <rect className={styles.thumb} x="5.5" y="5" width="3" height="7" rx="1.5" />
      <rect className={styles.track} x="14.5" y="3" width="5" height="18" rx="2.5" />
      <rect className={styles.thumb} x="15.5" y="5" width="3" height="7" rx="1.5" />
    </svg>
  )
}

/**
 * Колонки на экране тонкой линией, как остальные иконки нижней панели: одна —
 * перевод или оригинал, две — сравнение. Какой текст в колонке, говорит подпись.
 */
function ColumnsIcon({ count }: { count: 1 | 2 }) {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
      {count === 1 ? (
        <path d="M4 2.5h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
      ) : (
        <path d="M2.5 2.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM8 2.5v11M3.5 5.5h3M3.5 8h3M9.5 5.5h3M9.5 8h3" />
      )}
    </svg>
  )
}
