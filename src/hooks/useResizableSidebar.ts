import {
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 380
export const SIDEBAR_DEFAULT_WIDTH = 244
export const SIDEBAR_COLLAPSED_WIDTH = 72

const KEYBOARD_RESIZE_STEP = 16

function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
}

export function useResizableSidebar() {
  const [expandedWidth, setExpandedWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  const handleResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsResizing(true)
  }

  const handleResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isResizing) {
      return
    }

    setExpandedWidth(clampSidebarWidth(event.clientX))
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
        nextWidth = expandedWidth - KEYBOARD_RESIZE_STEP
        break
      case 'ArrowRight':
        nextWidth = expandedWidth + KEYBOARD_RESIZE_STEP
        break
      case 'Home':
        nextWidth = SIDEBAR_MIN_WIDTH
        break
      case 'End':
        nextWidth = SIDEBAR_MAX_WIDTH
        break
      default:
        return
    }

    event.preventDefault()
    setExpandedWidth(clampSidebarWidth(nextWidth))
  }

  return {
    currentWidth: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : expandedWidth,
    expandedWidth,
    isCollapsed,
    isResizing,
    toggleCollapsed: () => setIsCollapsed((collapsed) => !collapsed),
    resetWidth: () => setExpandedWidth(SIDEBAR_DEFAULT_WIDTH),
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    handleResizeKeyDown,
  }
}
