import { useCallback, useEffect, useLayoutEffect, useRef, type UIEventHandler } from 'react'
import type { BookPanel } from './useBookZoom.ts'

interface ScrollPosition {
  top: number
  left: number
}

interface ScrollBookmark extends ScrollPosition {
  verticalProgress: number | null
  horizontalProgress: number | null
}

function scrollProgress(position: number, range: number) {
  return range > 0 ? Math.min(1, Math.max(0, position / range)) : null
}

function readBookmark(viewport: HTMLDivElement, previous: ScrollBookmark | null): ScrollBookmark {
  return {
    top: viewport.scrollTop,
    left: viewport.scrollLeft,
    verticalProgress: scrollProgress(viewport.scrollTop, viewport.scrollHeight - viewport.clientHeight)
      ?? previous?.verticalProgress ?? null,
    horizontalProgress: scrollProgress(viewport.scrollLeft, viewport.scrollWidth - viewport.clientWidth)
      ?? previous?.horizontalProgress ?? null,
  }
}

function restoredPosition(progress: number | null, position: number, range: number) {
  return progress === null ? Math.max(0, position) : progress * Math.max(0, range)
}

export function useSynchronizedScroll(isEnabled: boolean, layoutKey: string) {
  const originalRef = useRef<HTMLDivElement>(null)
  const translationRef = useRef<HTMLDivElement>(null)
  const bookmarksRef = useRef<Record<BookPanel, ScrollBookmark | null>>({
    original: null,
    translation: null,
  })
  const expectedScrollPositionsRef = useRef(
    new WeakMap<HTMLDivElement, ScrollPosition>(),
  )

  const applyBookmark = useCallback((viewport: HTMLDivElement, bookmark: ScrollBookmark) => {
    const top = restoredPosition(bookmark.verticalProgress, bookmark.top, viewport.scrollHeight - viewport.clientHeight)
    const left = restoredPosition(bookmark.horizontalProgress, bookmark.left, viewport.scrollWidth - viewport.clientWidth)
    if (Math.abs(viewport.scrollTop - top) < 1 && Math.abs(viewport.scrollLeft - left) < 1) return

    viewport.scrollTop = top
    viewport.scrollLeft = left
    // Programmatic scroll events must not become new user input or feed back
    // into the other panel. Read the actual position after browser clamping.
    expectedScrollPositionsRef.current.set(viewport, {
      top: viewport.scrollTop,
      left: viewport.scrollLeft,
    })
  }, [])

  const restoreOriginalScroll = useCallback(() => {
    const bookmark = bookmarksRef.current.original
    if (originalRef.current && bookmark) applyBookmark(originalRef.current, bookmark)
  }, [applyBookmark])

  const restoreTranslationScroll = useCallback(() => {
    const bookmark = bookmarksRef.current.translation
    if (translationRef.current && bookmark) applyBookmark(translationRef.current, bookmark)
  }, [applyBookmark])

  const synchronize = useCallback(
    (panel: BookPanel, source: HTMLDivElement, target: HTMLDivElement | null) => {
      const expectedPosition =
        expectedScrollPositionsRef.current.get(source)

      if (expectedPosition !== undefined) {
        expectedScrollPositionsRef.current.delete(source)

        if (
          Math.abs(source.scrollTop - expectedPosition.top) < 1 &&
          Math.abs(source.scrollLeft - expectedPosition.left) < 1
        ) {
          return
        }
      }

      const bookmark = readBookmark(source, bookmarksRef.current[panel])
      bookmarksRef.current[panel] = bookmark
      if (!isEnabled) return

      const otherPanel = panel === 'original' ? 'translation' : 'original'
      // Keep a logical position even when the other panel is unmounted.
      bookmarksRef.current[otherPanel] = bookmark
      if (target) applyBookmark(target, bookmark)
    },
    [isEnabled, applyBookmark],
  )

  const handleOriginalScroll: UIEventHandler<HTMLDivElement> = useCallback(
    (event) => synchronize('original', event.currentTarget, translationRef.current),
    [synchronize],
  )

  const handleTranslationScroll: UIEventHandler<HTMLDivElement> = useCallback(
    (event) => synchronize('translation', event.currentTarget, originalRef.current),
    [synchronize],
  )

  useEffect(() => {
    if (!isEnabled) {
      expectedScrollPositionsRef.current = new WeakMap()
      return
    }

    if (isEnabled && originalRef.current && translationRef.current) {
      synchronize('original', originalRef.current, translationRef.current)
    }
  }, [isEnabled, synchronize])

  useLayoutEffect(() => {
    restoreOriginalScroll()
    restoreTranslationScroll()
  }, [layoutKey, restoreOriginalScroll, restoreTranslationScroll])

  return {
    originalRef,
    translationRef,
    handleOriginalScroll,
    handleTranslationScroll,
    restoreOriginalScroll,
    restoreTranslationScroll,
  }
}
