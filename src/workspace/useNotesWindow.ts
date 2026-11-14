import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import {
  moveFloatRectBy,
  NOTES_WINDOW_STEP,
  placeFloatRect,
  resizeFloatRectBy,
  resolveFloatRect,
  sizeFloatRect,
  type FloatRect,
  type PixelRect,
  type WindowArea,
} from './notesWindowGeometry.ts'

/** Обработчики, которые окно вешает на заголовок (перетаскивание) и ручку (клавиатура). */
export interface NotesWindowHandle {
  header: PointerHandlers
  onHandleKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

interface PointerHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void
}

interface Gesture {
  kind: 'move' | 'size'
  pointerX: number
  pointerY: number
  start: PixelRect
  startRect: FloatRect
}

/** Нажатие на кнопку, вкладку или поле в заголовке — это нажатие, а не начало перетаскивания. */
const INTERACTIVE = 'button:not([data-window-handle]), a, input, select, textarea, [role="tab"]'

const ARROWS: Partial<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

interface NotesWindowOptions {
  rect: FloatRect
  /** Где окну можно лежать; `null` — область ещё не измерена. */
  area: WindowArea | null
  onChange: (rect: FloatRect) => void
  /** Начало и конец жеста: пока окно тянут, место не сохраняется на каждый пиксель. */
  onInteractionChange: (isActive: boolean) => void
}

/**
 * Перетаскивание окна за заголовок, ресайз за правый нижний угол и то же
 * самое с клавиатуры: стрелки двигают окно, Shift и стрелки меняют размер.
 * Все пересчёты идут через геометрию окна, поэтому область оно не покидает.
 */
export function useNotesWindow({ rect, area, onChange, onInteractionChange }: NotesWindowOptions) {
  const gestureRef = useRef<Gesture | null>(null)
  const pixel = area ? resolveFloatRect(rect, area) : null

  const start = (kind: Gesture['kind']) => (event: PointerEvent<HTMLElement>) => {
    if (!area || !pixel || event.button !== 0) return
    if (kind === 'move' && event.target instanceof Element && event.target.closest(INTERACTIVE)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    gestureRef.current = { kind, pointerX: event.clientX, pointerY: event.clientY, start: pixel, startRect: rect }
    onInteractionChange(true)
  }
  const move = (event: PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current
    if (!gesture || !area) return
    const dx = event.clientX - gesture.pointerX
    const dy = event.clientY - gesture.pointerY
    onChange(gesture.kind === 'move'
      ? placeFloatRect(gesture.startRect, area, gesture.start.left + dx, gesture.start.top + dy)
      : sizeFloatRect(gesture.startRect, area, gesture.start.width + dx, gesture.start.height + dy))
  }
  const end = (event: PointerEvent<HTMLElement>) => {
    // Отпускание после клика по кнопке заголовка — не конец жеста.
    if (!gestureRef.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    gestureRef.current = null
    onInteractionChange(false)
  }
  const handlers = (kind: Gesture['kind']): PointerHandlers => ({
    onPointerDown: start(kind),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  })

  const handle: NotesWindowHandle = {
    header: handlers('move'),
    onHandleKeyDown: (event) => {
      const arrow = ARROWS[event.key]
      if (!arrow || !area || event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      const [dx, dy] = arrow.map((value) => value * NOTES_WINDOW_STEP)
      onChange(event.shiftKey ? resizeFloatRectBy(rect, area, dx, dy) : moveFloatRectBy(rect, area, dx, dy))
    },
  }

  return { pixel, handle, grip: handlers('size') }
}
