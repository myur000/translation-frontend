import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from '../../i18n/useTranslation.ts'
import { POPULAR_LANGUAGES } from '../../languages/languageCatalog.ts'
import { useLanguageCatalog } from '../../languages/useLanguageCatalog.ts'
import styles from './LanguagePicker.module.css'

interface LanguagePickerProps {
  value: string
  /** Доступное имя элемента, например «Язык оригинала». */
  label: string
  /** Короткий видимый префикс, например «Из». */
  prefix?: string
  disabled?: boolean
  /** Куда открывается список: вниз по умолчанию, вверх — из нижней панели. */
  placement?: 'bottom' | 'top'
  /** Раскрыть список сразу при появлении: окно, открытое ради выбора языка. */
  autoOpen?: boolean
  onChange: (code: string) => void
}

interface PickerOption {
  id: string
  code: string
  label: string
  group: 'popular' | 'all' | 'search'
}

type PopoverAlign = 'start' | 'end'
type PopoverSide = 'bottom' | 'top'

/** Держать в соответствии с шириной `.popover` в LanguagePicker.module.css. */
const POPOVER_WIDTH = 300
/** Держать в соответствии с отступом `.popover` от кнопки. */
const POPOVER_GAP = 6
const VIEWPORT_GUTTER = 16
/** Наибольшая высота списка: около восьми строк, дальше — прокрутка. */
const LIST_MAX_HEIGHT = 280
/** Меньше этого список бесполезен: лучше упереться в край, чем показать две строки. */
const LIST_MIN_HEIGHT = 120
/** Высота строки поиска до первого замера, когда окно ещё не отрисовано. */
const FALLBACK_CHROME_HEIGHT = 41

/**
 * Открывается в ту сторону, где есть место: иначе список у правого края
 * вылез бы за окно и сдвинул всю рабочую область вбок.
 */
function popoverAlignFor(trigger: DOMRect, viewportWidth: number): PopoverAlign {
  const fitsRight = trigger.left + POPOVER_WIDTH <= viewportWidth - VIEWPORT_GUTTER
  const fitsLeft = trigger.right - POPOVER_WIDTH >= VIEWPORT_GUTTER
  return !fitsRight && fitsLeft ? 'end' : 'start'
}

/**
 * Выбирает сторону по вертикали и высоту списка так, чтобы окно целиком
 * помещалось в экран. Предпочтительная сторона сохраняется, пока на ней
 * хватает места для полного списка; иначе — та, где места больше.
 * `chromeHeight` — всё в окне, кроме списка: строка поиска, статус, ошибка.
 */
function popoverFitFor(
  trigger: DOMRect,
  viewportHeight: number,
  preferred: PopoverSide,
  chromeHeight: number,
): { side: PopoverSide; listMaxHeight: number } {
  const room: Record<PopoverSide, number> = {
    bottom: viewportHeight - trigger.bottom - POPOVER_GAP - VIEWPORT_GUTTER - chromeHeight,
    top: trigger.top - POPOVER_GAP - VIEWPORT_GUTTER - chromeHeight,
  }
  const other: PopoverSide = preferred === 'bottom' ? 'top' : 'bottom'
  const side =
    room[preferred] >= LIST_MAX_HEIGHT || room[preferred] >= room[other] ? preferred : other
  const listMaxHeight = Math.max(LIST_MIN_HEIGHT, Math.min(LIST_MAX_HEIGHT, Math.floor(room[side])))
  return { side, listMaxHeight }
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replaceAll('ё', 'е').trim()
}

export function LanguagePicker({
  value,
  label,
  prefix,
  disabled = false,
  placement = 'bottom',
  autoOpen = false,
  onChange,
}: LanguagePickerProps) {
  const { t } = useTranslation()
  const catalog = useLanguageCatalog()
  const { getLabel, load } = catalog
  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [isOpen, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [align, setAlign] = useState<PopoverAlign>('start')
  const [side, setSide] = useState<PopoverSide>(placement)
  const [listMaxHeight, setListMaxHeight] = useState(LIST_MAX_HEIGHT)

  const options = useMemo<PickerOption[]>(() => {
    const search = normalize(query)
    if (search) {
      const codes = catalog.languages.length
        ? catalog.languages.map((item) => item.code)
        : [...POPULAR_LANGUAGES]
      const ranked = codes
        .map((code) => {
          const text = getLabel(code)
          const haystacks = [text, catalog.names.get(code) ?? '', code].map(normalize)
          const rank = haystacks.some((item) => item.startsWith(search))
            ? 0
            : haystacks.some((item) => item.includes(search))
              ? 1
              : -1
          return { code, label: text, rank }
        })
        .filter((item) => item.rank >= 0)
        .sort((a, b) => a.rank - b.rank)
      return ranked.map((item) => ({
        id: `${baseId}-search-${item.code}`,
        code: item.code,
        label: item.label,
        group: 'search',
      }))
    }

    const popular = POPULAR_LANGUAGES.map<PickerOption>((code) => ({
      id: `${baseId}-popular-${code}`,
      code,
      label: getLabel(code),
      group: 'popular',
    }))
    const all = catalog.languages.map<PickerOption>((item) => ({
      id: `${baseId}-all-${item.code}`,
      code: item.code,
      label: getLabel(item.code),
      group: 'all',
    }))
    return [...popular, ...all]
  }, [baseId, catalog.languages, catalog.names, getLabel, query])

  const activeOption = options[Math.min(activeIndex, options.length - 1)]

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  // Фокус ставим синхронно при открытии, чтобы быстрый ввод не попал в кнопку.
  // preventScroll: фокусировка не должна прокручивать окружающие контейнеры.
  useLayoutEffect(() => {
    if (isOpen) searchRef.current?.focus({ preventScroll: true })
  }, [isOpen])

  // Размер окна подбирается до отрисовки кадра и пересчитывается при смене
  // размеров экрана и при появлении строки статуса (загрузка, ошибка),
  // чтобы окно не уходило за край и не обрезалось.
  const hasStatusRow = catalog.status === 'loading' || catalog.status === 'error'
  useLayoutEffect(() => {
    if (!isOpen) return
    const fit = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      if (!trigger) return
      const popover = popoverRef.current
      const list = listRef.current
      const measured = popover && list ? popover.offsetHeight - list.offsetHeight : 0
      const chromeHeight = measured > 0 ? measured : FALLBACK_CHROME_HEIGHT
      const next = popoverFitFor(trigger, window.innerHeight, placement, chromeHeight)
      setAlign(popoverAlignFor(trigger, window.innerWidth))
      setSide(next.side)
      setListMaxHeight(next.listMaxHeight)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [isOpen, placement, hasStatusRow])

  useEffect(() => {
    if (!isOpen || !activeOption) return
    document
      .getElementById(activeOption.id)
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [activeOption, isOpen])

  const open = () => {
    if (disabled) return
    void load()
    setQuery('')
    const selectedIndex = POPULAR_LANGUAGES.indexOf(value)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  // Эффект ребёнка срабатывает раньше эффекта окна-родителя, поэтому список
  // раскрывается после того, как окно поставит фокус, и фокус уходит в поиск.
  const openRef = useRef(open)
  useLayoutEffect(() => {
    openRef.current = open
  })
  useEffect(() => {
    if (autoOpen) openRef.current()
  }, [autoOpen])

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  const select = (code: string) => {
    if (code !== value) onChange(code)
    close(true)
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!options.length) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => (index + step + options.length) % options.length)
    } else if (event.key === 'Home' && options.length) {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End' && options.length) {
      event.preventDefault()
      setActiveIndex(options.length - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (activeOption) select(activeOption.code)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    }
  }

  const renderOption = (option: PickerOption) => {
    const isSelected = option.code === value
    const isActive = option.id === activeOption?.id
    return (
      <li
        key={option.id}
        id={option.id}
        role="option"
        aria-selected={isSelected}
        className={`${styles.option} ${isActive ? styles.optionActive : ''}`}
        onPointerMove={() => setActiveIndex(options.indexOf(option))}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => select(option.code)}
      >
        <span className={styles.optionLabel}>{option.label}</span>
        {isSelected ? (
          <svg className={styles.check} viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
        ) : null}
      </li>
    )
  }

  const popularOptions = options.filter((option) => option.group === 'popular')
  const allOptions = options.filter((option) => option.group === 'all')
  const searchOptions = options.filter((option) => option.group === 'search')
  const currentLabel = getLabel(value)

  return (
    <div
      className={styles.root}
      ref={rootRef}
      onBlur={(event) => {
        if (isOpen && !rootRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('languagePicker.value', { label, language: currentLabel })}
        disabled={disabled}
        onPointerEnter={() => void load()}
        onClick={() => (isOpen ? close(false) : open())}
      >
        {prefix ? <span className={styles.prefix}>{prefix}</span> : null}
        <span className={styles.value}>{currentLabel}</span>
        <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>

      {isOpen ? (
        <div
          ref={popoverRef}
          className={`${styles.popover} ${align === 'end' ? styles.popoverEnd : ''} ${side === 'top' ? styles.popoverTop : ''}`}
          data-align={align}
          data-side={side}
        >
          <div className={styles.searchRow}>
            <svg className={styles.searchIcon} viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" />
            </svg>
            <input
              ref={searchRef}
              className={styles.search}
              type="search"
              role="combobox"
              aria-label={t('languagePicker.search')}
              aria-expanded="true"
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeOption?.id}
              placeholder={t('languagePicker.search')}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value)
                setActiveIndex(0)
              }}
              onKeyDown={handleSearchKeyDown}
            />
          </div>

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={label}
            className={styles.list}
            style={{ maxHeight: listMaxHeight }}
          >
            {query ? (
              searchOptions.map(renderOption)
            ) : (
              <>
                <li role="presentation" className={styles.groupLabel}>
                  {t('languagePicker.popular')}
                </li>
                {popularOptions.map(renderOption)}
                {allOptions.length ? (
                  <li role="presentation" className={styles.groupLabel}>
                    {t('languagePicker.all', { count: allOptions.length })}
                  </li>
                ) : null}
                {allOptions.map(renderOption)}
              </>
            )}
          </ul>

          {query && !searchOptions.length && catalog.status !== 'loading' ? (
            <p className={styles.status}>{t('languagePicker.empty')}</p>
          ) : null}
          {catalog.status === 'loading' ? (
            <p className={styles.status} role="status">{t('languagePicker.loading')}</p>
          ) : null}
          {catalog.status === 'error' ? (
            <div className={styles.error} role="alert">
              <span>{t('languagePicker.error')}</span>
              <button type="button" onClick={() => void load()}>
                {t('languagePicker.retry')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
