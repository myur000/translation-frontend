import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useAuth } from '../auth/useAuth.ts'
import {
  clampNotesWidth,
  DEFAULT_NOTES_PANEL,
  NOTES_DEFAULT_WIDTH,
  NOTES_MAX_WIDTH,
  NOTES_MIN_WIDTH,
  readNotesPanel,
  rememberNotesPanel,
  type NotesPanelSettings,
} from './notesPanelStorage.ts'

const KEYBOARD_RESIZE_STEP = 16

/**
 * Состояние заметок в рабочей области: показаны ли и ширина колонки.
 * Запоминается для аккаунта; пока колонку тянут мышью, сохраняется только итог.
 */
export function useNotesPanel() {
  const { session } = useAuth()
  const email = session?.email ?? null
  const [settings, setSettings] = useState<NotesPanelSettings>(() =>
    email ? readNotesPanel(email) : DEFAULT_NOTES_PANEL)
  const [isResizing, setResizing] = useState(false)
  // Внешний край колонки, от которого считается ширина при перетаскивании.
  const outerEdgeRef = useRef(0)

  useEffect(() => {
    if (email && !isResizing) rememberNotesPanel(email, settings)
  }, [email, settings, isResizing])

  const update = useCallback((patch: Partial<NotesPanelSettings>) =>
    setSettings((current) => ({ ...current, ...patch })), [])
  const reveal = useCallback(() => update({ isOpen: true }), [update])
  const close = useCallback(() => update({ isOpen: false }), [update])

  return {
    ...settings,
    /** Колонку тянут за край: книге нужен курсор ресайза и запрет выделения. */
    isResizing,
    reveal,
    close,
    resizeHandle: {
      minWidth: NOTES_MIN_WIDTH,
      maxWidth: NOTES_MAX_WIDTH,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        event.preventDefault()
        const panel = event.currentTarget.parentElement?.getBoundingClientRect()
        // Колонка всегда справа: ширина считается от её правого края.
        outerEdgeRef.current = panel ? panel.right : window.innerWidth
        event.currentTarget.setPointerCapture(event.pointerId)
        setResizing(true)
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!isResizing) return
        update({ width: clampNotesWidth(outerEdgeRef.current - event.clientX) })
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        setResizing(false)
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        // Стрелка «к книге» (влево) расширяет колонку, «к краю» (вправо) — сужает.
        const next = event.key === 'ArrowLeft' ? settings.width + KEYBOARD_RESIZE_STEP
          : event.key === 'ArrowRight' ? settings.width - KEYBOARD_RESIZE_STEP
            : event.key === 'Home' ? NOTES_MIN_WIDTH
              : event.key === 'End' ? NOTES_MAX_WIDTH
                : null
        if (next === null) return
        event.preventDefault()
        update({ width: clampNotesWidth(next) })
      },
      onDoubleClick: () => update({ width: NOTES_DEFAULT_WIDTH }),
    },
  }
}

export type NotesPanelController = ReturnType<typeof useNotesPanel>

/**
 * Как заметки показаны прямо сейчас: колонка справа под шапкой, на узком экране —
 * шторка. В сравнении двум страницам и так тесно: заметка открывается карточкой у
 * слова или метки (`popover`), а не колонкой, и только по щелчку.
 */
export type NotesPresentation = 'hidden' | 'column' | 'sheet' | 'popover'

export function notesPresentation(
  settings: Pick<NotesPanelSettings, 'isOpen'>,
  { isNarrow, isCompare = false, isPopoverOpen = false }: { isNarrow: boolean; isCompare?: boolean; isPopoverOpen?: boolean },
): NotesPresentation {
  if (isCompare && !isNarrow) return isPopoverOpen ? 'popover' : 'hidden'
  if (!settings.isOpen) return 'hidden'
  return isNarrow ? 'sheet' : 'column'
}
