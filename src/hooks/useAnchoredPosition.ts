import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** То, к чему привязана карточка: слово (Range), метка или панель (Element). */
export interface FloatingAnchor {
  getBoundingClientRect(): DOMRect
}

export interface AnchoredPosition {
  top: number
  left: number
  maxHeight: number
  /** Пока якорь и высота карточки не измерены, карточку не показываем: иначе мелькнёт не там. */
  isReady: boolean
}

interface Options {
  width: number
  maxHeight: number
  /** Ниже этой высоты карточку не сжимаем, а сдвигаем внутрь экрана. */
  minHeight?: number
  gap?: number
}

const FALLBACK_TOP = 64

type Rect = { top: number; bottom: number; left: number; width: number }
type Side = 'above' | 'below'

/**
 * Позиция плавающей карточки у якоря: под ним или над ним, где больше места,
 * по центру якоря и в пределах экрана. Карточка едет за якорем при прокрутке;
 * сторона выбирается один раз на якорь, иначе карточка перескакивала бы.
 */
export function useAnchoredPosition(
  anchor: FloatingAnchor | null,
  cardRef: RefObject<HTMLElement | null>,
  { width, maxHeight, minHeight = 200, gap = 10 }: Options,
): AnchoredPosition | null {
  const [rect, setRect] = useState<{ anchor: FloatingAnchor; rect: Rect; side: Side } | null>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (!anchor) return
    let frame = 0
    const follow = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const next = anchor.getBoundingClientRect()
        const isEmpty = !next.width && !next.height
        const measured = { top: next.top, bottom: next.bottom, left: next.left, width: next.width }
        setRect((current) => {
          if (current?.anchor === anchor) {
            // Узлы слова пропали при перерисовке: карточка остаётся, где была.
            return isEmpty ? current : { ...current, rect: measured }
          }
          // Якорь не на экране с самого начала: карточка встаёт в правом верхнем углу.
          const start = isEmpty ? { top: FALLBACK_TOP, bottom: FALLBACK_TOP, left: window.innerWidth, width: 0 } : measured
          return { anchor, rect: start, side: pickSide(start, maxHeight, gap) }
        })
      })
    }
    follow()
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [anchor, gap, maxHeight])

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setHeight(card.offsetHeight))
    observer.observe(card)
    return () => observer.disconnect()
  }, [cardRef, anchor])

  if (!anchor || rect?.anchor !== anchor) return null
  const { rect: box, side } = rect
  const space = side === 'below' ? window.innerHeight - box.bottom - gap * 2 : box.top - gap * 2
  const limit = Math.max(minHeight, Math.min(maxHeight, space))
  const shown = Math.min(height, limit)
  const wanted = side === 'below' ? box.bottom + gap : box.top - gap - shown
  return {
    top: Math.max(gap, Math.min(wanted, window.innerHeight - shown - gap)),
    left: Math.max(gap, Math.min(box.left + box.width / 2 - width / 2, window.innerWidth - width - gap)),
    maxHeight: limit,
    isReady: height > 0,
  }
}

function pickSide(rect: Rect, maxHeight: number, gap: number): Side {
  const below = window.innerHeight - rect.bottom - gap * 2
  const above = rect.top - gap * 2
  return below >= Math.min(maxHeight, 360) || below >= above ? 'below' : 'above'
}
