import { useCallback, useState } from 'react'

/**
 * Height of an element that may change size (a toolbar that wraps) or
 * disappear (fullscreen). Returns a callback ref and the current height in
 * pixels; 0 while the element is not mounted.
 */
export function useElementHeight<T extends HTMLElement>() {
  const [height, setHeight] = useState(0)

  // React 19: when a callback ref returns a cleanup, React calls that cleanup
  // on detach instead of calling the ref with null.
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
