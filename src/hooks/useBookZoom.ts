import { useState } from 'react'

export type BookPanel = 'original' | 'translation'
export const MIN_BOOK_ZOOM = 50
export const MAX_BOOK_ZOOM = 250
export const BOOK_ZOOM_STEP = 10

export function useBookZoom(isSynchronized: boolean) {
  const [state, setState] = useState({
    original: 100,
    translation: 100,
    lastChanged: 'original' as BookPanel,
  })

  const changeZoom = (panel: BookPanel, value: number) => {
    const zoom = Math.min(MAX_BOOK_ZOOM, Math.max(MIN_BOOK_ZOOM, Math.round(value)))
    setState((current) =>
      isSynchronized
        ? { original: zoom, translation: zoom, lastChanged: panel }
        : { ...current, [panel]: zoom, lastChanged: panel },
    )
  }

  const synchronizeZoom = () => {
    setState((current) => ({
      ...current,
      original: current[current.lastChanged],
      translation: current[current.lastChanged],
    }))
  }

  return { original: state.original, translation: state.translation, changeZoom, synchronizeZoom }
}
