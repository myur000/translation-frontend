import type { GraphLinkKind, GraphNode } from './graphModel.ts'

/**
 * Камера холста графа: какая точка мира в центре экрана и масштаб. Экранная точка
 * = (мировая − центр камеры) × масштаб + половина размера холста.
 */
export interface Camera {
  x: number
  y: number
  scale: number
}

export interface Size {
  width: number
  height: number
}

export const MIN_SCALE = 0.15
export const MAX_SCALE = 4

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

export function toScreen(camera: Camera, size: Size, point: { x: number; y: number }) {
  return {
    x: (point.x - camera.x) * camera.scale + size.width / 2,
    y: (point.y - camera.y) * camera.scale + size.height / 2,
  }
}

export function toWorld(camera: Camera, size: Size, x: number, y: number) {
  return {
    x: (x - size.width / 2) / camera.scale + camera.x,
    y: (y - size.height / 2) / camera.scale + camera.y,
  }
}

/** Масштаб колёсиком: точка под курсором остаётся под курсором. */
export function zoomAt(camera: Camera, size: Size, x: number, y: number, factor: number): Camera {
  const scale = clampScale(camera.scale * factor)
  const anchor = toWorld(camera, size, x, y)
  return {
    scale,
    x: anchor.x - (x - size.width / 2) / scale,
    y: anchor.y - (y - size.height / 2) / scale,
  }
}

/** Вписать точки в холст с полями; крупнее 1,4 не увеличиваем — мелкий граф не раздувается. */
export function fitCamera(points: readonly { x: number; y: number; radius: number }[], size: Size, padding = 48): Camera {
  if (!points.length || size.width <= 0 || size.height <= 0) return { x: 0, y: 0, scale: 1 }
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const point of points) {
    left = Math.min(left, point.x - point.radius)
    top = Math.min(top, point.y - point.radius)
    right = Math.max(right, point.x + point.radius)
    bottom = Math.max(bottom, point.y + point.radius)
  }
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const scale = clampScale(Math.min(1.4, (size.width - padding * 2) / width, (size.height - padding * 2) / height))
  return { x: (left + right) / 2, y: (top + bottom) / 2, scale }
}

/** Радиус узла при масштабе 1 — и для отрисовки, и для попадания курсором, и для раскладки. */
export function nodeRadius(node: Pick<GraphNode, 'kind' | 'degree'>) {
  switch (node.kind) {
    case 'book': return 20
    case 'summary': return 12
    case 'tag': return 16
    case 'missing': return 6
    default: return 5 + Math.min(node.degree, 6) * 1.2
  }
}

/** Длина связи: конспект держится у своей книги, теги — ближе, цитаты — свободнее. */
export function linkDistance(kind: GraphLinkKind) {
  switch (kind) {
    case 'about': return 52
    case 'tagged': return 64
    case 'links': return 80
    default: return 96
  }
}

/** Узел под точкой мира (ближайший из попавших); `slack` — запас для мелких кружков. */
export function nodeAt<T extends { x: number; y: number; radius: number }>(nodes: readonly T[], x: number, y: number, slack = 4): T | null {
  let best: T | null = null
  let bestDistance = Infinity
  for (const node of nodes) {
    const distance = Math.hypot(node.x - x, node.y - y)
    if (distance <= node.radius + slack && distance < bestDistance) {
      best = node
      bestDistance = distance
    }
  }
  return best
}
