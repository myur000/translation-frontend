import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

export const NOTES_MIN_WIDTH = 240
export const NOTES_MAX_WIDTH = 480
export const NOTES_DEFAULT_WIDTH = 280

const KEYBOARD_RESIZE_STEP = 16

function clampNotesWidth(width: number) {
  return Math.min(NOTES_MAX_WIDTH, Math.max(NOTES_MIN_WIDTH, width))
}

export function useResizableNotesPanel() {
  const [width, setWidth] = useState(NOTES_DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const rightBoundaryRef = useRef(0)

  const handleResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    rightBoundaryRef.current =
      event.currentTarget.parentElement?.getBoundingClientRect().right ??
      window.innerWidth
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsResizing(true)
  }

  const handleResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isResizing) {
      return
    }

    setWidth(clampNotesWidth(rightBoundaryRef.current - event.clientX))
  }

  const handleResizeEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setIsResizing(false)
  }

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | undefined

    switch (event.key) {
      case 'ArrowLeft':
        nextWidth = width + KEYBOARD_RESIZE_STEP
        break
      case 'ArrowRight':
        nextWidth = width - KEYBOARD_RESIZE_STEP
        break
      case 'Home':
        nextWidth = NOTES_MIN_WIDTH
        break
      case 'End':
        nextWidth = NOTES_MAX_WIDTH
        break
      default:
        return
    }

    event.preventDefault()
    setWidth(clampNotesWidth(nextWidth))
  }

  return {
    width,
    isResizing,
    resetWidth: () => setWidth(NOTES_DEFAULT_WIDTH),
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    handleResizeKeyDown,
  }
}
