import { useCallback, useState } from 'react'

export interface ElementSize {
  width: number
  height: number
}

const EMPTY: ElementSize = { width: 0, height: 0 }

/**
 * Размер элемента, который меняется вместе с окном браузера, боковой панелью
 * или раскладкой. Возвращает callback-ref и размер в пикселях; нули, пока
 * элемент не смонтирован.
 */
export function useElementSize<T extends HTMLElement>() {
  const [size, setSize] = useState<ElementSize>(EMPTY)

  const ref = useCallback((element: T | null) => {
    if (!element) return
    const measure = (width: number, height: number) => setSize((current) =>
      current.width === width && current.height === height ? current : { width, height })
    measure(element.clientWidth, element.clientHeight)
    if (typeof ResizeObserver === 'undefined') return () => setSize(EMPTY)
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize?.[0]
      measure(box ? box.inlineSize : element.clientWidth, box ? box.blockSize : element.clientHeight)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      setSize(EMPTY)
    }
  }, [])

  return [ref, size] as const
}
