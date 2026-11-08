import { useCallback, useState } from 'react'

/**
 * Высота элемента, который может менять размер (переносящаяся панель) или
 * исчезать (полноэкранный режим). Возвращает callback-ref и текущую высоту
 * в пикселях; 0, пока элемент не смонтирован.
 */
export function useElementHeight<T extends HTMLElement>() {
  const [height, setHeight] = useState(0)

  // React 19: если callback-ref возвращает функцию очистки, при отключении React
  // вызывает её, а не сам ref с null.
  const ref = useCallback((element: T | null) => {
    if (!element) return
    setHeight(element.getBoundingClientRect().height)
    if (typeof ResizeObserver === 'undefined') return () => setHeight(0)
    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      setHeight(0)
    }
  }, [])

  return [ref, height] as const
}
