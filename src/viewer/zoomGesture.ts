// Percentage points per normalized pixel. Keep trackpad micro-deltas intact.
export const GESTURE_ZOOM_SENSITIVITY = 0.1
export const MAX_GESTURE_ZOOM_STEP = 5
export const GESTURE_IDLE_MS = 180
const MAX_EVENT_PIXELS = 50
const LINE_PIXELS = 16

export function wheelZoomDelta(deltaY: number, deltaMode: number, viewportHeight: number) {
  if (!Number.isFinite(deltaY)) return 0
  const unit = deltaMode === 1 ? LINE_PIXELS : deltaMode === 2 ? Math.max(1, viewportHeight) : 1
  const pixels = Math.min(MAX_EVENT_PIXELS, Math.max(-MAX_EVENT_PIXELS, deltaY * unit))
  return -pixels * GESTURE_ZOOM_SENSITIVITY
}
