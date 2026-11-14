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
import type { FloatRect } from './notesWindowGeometry.ts'

const KEYBOARD_RESIZE_STEP = 16

/**
 * Состояние заметок в рабочей области: открыты ли, вид (окно или колонка),
 * свёрнуто ли окно, ширина колонки и место окна. Запоминается для аккаунта;
 * пока окно или колонку тянут мышью, сохраняется только итог.
 */
export function useNotesPanel() {
  const { session } = useAuth()
  const email = session?.email ?? null
  const [settings, setSettings] = useState<NotesPanelSettings>(() =>
    email ? readNotesPanel(email) : DEFAULT_NOTES_PANEL)
  // Перетаскивание окна, его угла или края колонки.
  const [isInteracting, setInteracting] = useState(false)
  const [isResizing, setResizing] = useState(false)
  // Внешний край колонки, от которого считается ширина при перетаскивании.
  const outerEdgeRef = useRef(0)

  useEffect(() => {
    if (email && !isInteracting && !isResizing) rememberNotesPanel(email, settings)
  }, [email, settings, isInteracting, isResizing])

  const update = useCallback((patch: Partial<NotesPanelSettings>) =>
    setSettings((current) => ({ ...current, ...patch })), [])
  const isRight = settings.side === 'right'
  /** Показать заметки в выбранном виде: из закрытого состояния и из пилюли. */
  const reveal = useCallback(() => update({ isOpen: true, isCollapsed: false }), [update])
  const close = useCallback(() => update({ isOpen: false, isCollapsed: false }), [update])
  const collapse = useCallback(() => update({ isCollapsed: true }), [update])
  const dock = useCallback(() => update({ mode: 'docked', isCollapsed: false }), [update])
  const undock = useCallback(() => update({ mode: 'floating', isCollapsed: false }), [update])
  const setFloatRect = useCallback((floatRect: FloatRect) => update({ floatRect }), [update])

  return {
    ...settings,
    /** Колонку тянут за край: книге нужен курсор ресайза и запрет выделения. */
    isResizing,
    reveal,
    close,
    collapse,
    dock,
    undock,
    setFloatRect,
    setInteracting,
    switchSide: () => update({ side: isRight ? 'left' : 'right' }),
    resizeHandle: {
      minWidth: NOTES_MIN_WIDTH,
      maxWidth: NOTES_MAX_WIDTH,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        event.preventDefault()
        const panel = event.currentTarget.parentElement?.getBoundingClientRect()
        outerEdgeRef.current = panel ? (isRight ? panel.right : panel.left) : (isRight ? window.innerWidth : 0)
        event.currentTarget.setPointerCapture(event.pointerId)
        setResizing(true)
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!isResizing) return
        update({ width: clampNotesWidth(isRight ? outerEdgeRef.current - event.clientX : event.clientX - outerEdgeRef.current) })
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        setResizing(false)
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        // Стрелка «к книге» расширяет колонку, «к краю» — сужает, с какой бы стороны она ни стояла.
        const towardBook = isRight ? 'ArrowLeft' : 'ArrowRight'
        const towardEdge = isRight ? 'ArrowRight' : 'ArrowLeft'
        const next = event.key === towardBook ? settings.width + KEYBOARD_RESIZE_STEP
          : event.key === towardEdge ? settings.width - KEYBOARD_RESIZE_STEP
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
 * Как заметки показаны прямо сейчас. Колонка — часть раскладки, и полноэкранный
 * режим её прячет; окно и пилюля остаются, ради сценария «только перевод и
 * заметки». На узком экране места ни для окна, ни для колонки нет: всё — шторка.
 */
export type NotesPresentation = 'hidden' | 'docked' | 'floating' | 'collapsed' | 'sheet'

export function notesPresentation(
  settings: Pick<NotesPanelSettings, 'isOpen' | 'mode' | 'isCollapsed'>,
  { isImmersive, isNarrow }: { isImmersive: boolean; isNarrow: boolean },
): NotesPresentation {
  if (!settings.isOpen) return 'hidden'
  if (settings.mode === 'docked' && isImmersive) return 'hidden'
  if (isNarrow) return 'sheet'
  if (settings.mode === 'docked') return 'docked'
  return settings.isCollapsed ? 'collapsed' : 'floating'
}
