import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { MAX_BOOK_ZOOM, MIN_BOOK_ZOOM } from './useBookZoom.ts'
import { GESTURE_IDLE_MS, MAX_GESTURE_ZOOM_STEP, wheelZoomDelta } from '../viewer/zoomGesture.ts'

export function usePreviewZoom(
  viewportRef: RefObject<HTMLDivElement | null>,
  zoom: number,
  onZoomChange: (zoom: number) => void,
) {
  const [pageWidth, setPageWidth] = useState(560)
  const previousZoom = useRef(zoom)
  const changeRef = useRef(onZoomChange)
  const gestureRef = useRef({
    zoom, requestedZoom: zoom, delta: 0, frame: null as number | null,
    lastEventAt: -Infinity, clientX: 0, clientY: 0,
  })
  const anchorRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    changeRef.current = onZoomChange
    const gesture = gestureRef.current
    // An external change (buttons, keyboard or the synchronized panel) wins
    // over a gesture queued for the next frame. Acknowledging our own change
    // must retain fractional deltas, otherwise small pinches do nothing.
    if (gesture.requestedZoom !== zoom) {
      if (gesture.frame !== null) window.cancelAnimationFrame(gesture.frame)
      gesture.frame = null
      gesture.delta = 0
      gesture.zoom = zoom
      gesture.requestedZoom = zoom
      anchorRef.current = null
    }
    const viewport = viewportRef.current
    if (!viewport || previousZoom.current === zoom) return

    const ratio = zoom / previousZoom.current
    const anchor = anchorRef.current ?? {
      x: viewport.clientWidth / 2,
      y: viewport.clientHeight / 2,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    }
    viewport.scrollLeft = Math.max(0, (anchor.left + anchor.x) * ratio - anchor.x)
    viewport.scrollTop = Math.max(0, (anchor.top + anchor.y) * ratio - anchor.y)
    previousZoom.current = zoom
    anchorRef.current = null
  }, [zoom, onZoomChange, viewportRef])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => {
      if (!viewport.clientWidth) return
      const style = getComputedStyle(viewport)
      const available = viewport.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
      setPageWidth(Math.min(560, Math.max(180, available)))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [viewportRef])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const gesture = gestureRef.current
    const flushGesture = () => {
      gesture.frame = null
      const delta = Math.min(MAX_GESTURE_ZOOM_STEP, Math.max(-MAX_GESTURE_ZOOM_STEP, gesture.delta))
      gesture.delta = 0
      gesture.zoom = Math.min(MAX_BOOK_ZOOM, Math.max(MIN_BOOK_ZOOM, gesture.zoom + delta))
      const nextZoom = Math.round(gesture.zoom)
      if (nextZoom === gesture.requestedZoom) return
      const bounds = viewport.getBoundingClientRect()
      anchorRef.current = {
        x: gesture.clientX - bounds.left,
        y: gesture.clientY - bounds.top,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      }
      gesture.requestedZoom = nextZoom
      changeRef.current(nextZoom)
    }
    const handleWheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return
      const delta = wheelZoomDelta(event.deltaY, event.deltaMode, viewport.clientHeight)
      if (!delta) return
      event.preventDefault()
      const now = performance.now()
      if (gesture.frame === null && now - gesture.lastEventAt > GESTURE_IDLE_MS) {
        gesture.zoom = gesture.requestedZoom
      }
      gesture.lastEventAt = now
      gesture.clientX = event.clientX
      gesture.clientY = event.clientY
      gesture.delta += delta
      if (gesture.frame === null) gesture.frame = window.requestAnimationFrame(flushGesture)
    }
    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', handleWheel)
      if (gesture.frame !== null) window.cancelAnimationFrame(gesture.frame)
      gesture.frame = null
      gesture.delta = 0
    }
  }, [viewportRef])

  return pageWidth
}
