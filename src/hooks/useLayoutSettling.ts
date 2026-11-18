import { useEffect, useState } from 'react'

/** Сколько ждать после последнего изменения масштаба или ширины, прежде чем показать слой снова. */
export const LAYOUT_SETTLE_MS = 180

/**
 * Идёт ли сейчас масштабирование или ресайз колонки книги. Метки и заметки на
 * полях пересчитываются на кадр позже страницы, поэтому во время масштабирования
 * колёсиком они бы прыгали. Пока колонка «успокаивается», их слой прячут, а
 * показывают уже на новом месте.
 *
 * Свой правый отступ под заметки (`--margin-notes-space`) ширину колонки не
 * меняет и сюда не попадает — иначе слой прятался бы от собственного пересчёта.
 */
export function useLayoutSettling(host: HTMLElement | null, { zoom: watchZoom = true }: { zoom?: boolean } = {}) {
  const [isSettling, setSettling] = useState(false)
  useEffect(() => {
    if (!host) return
    let timer = 0
    let zoom = host.dataset.zoom
    let width = host.clientWidth
    const settle = () => {
      setSettling(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setSettling(false), LAYOUT_SETTLE_MS)
    }
    // Слою, который масштабируется вместе со страницей, прятаться от масштаба не нужно.
    const zoomChanges = new MutationObserver(() => {
      if (host.dataset.zoom === zoom) return
      zoom = host.dataset.zoom
      settle()
    })
    if (watchZoom) zoomChanges.observe(host, { attributes: true, attributeFilter: ['data-zoom'] })
    const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (host.clientWidth === width) return
      width = host.clientWidth
      settle()
    })
    resizes?.observe(host)
    return () => {
      window.clearTimeout(timer)
      zoomChanges.disconnect()
      resizes?.disconnect()
      setSettling(false)
    }
  }, [host, watchZoom])
  return isSettling
}
