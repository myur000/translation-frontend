/**
 * Геометрия плавающего окна заметок.
 *
 * Положение хранится не в пикселях, а долей свободного места: `x = 0` — окно у
 * левого края, `x = 1` — у правого, `0.5` — посередине (так же `y` по вертикали).
 * Размер хранится в пикселях: окно заметок не должно расти вместе с монитором.
 * Пиксельное положение всегда выводится из этих долей и текущей области, поэтому
 * окно не может оказаться за её краем: после смены раскладки, ресайза браузера
 * или открытия боковой панели оно остаётся у того же края, а не «теряется».
 */
export interface FloatRect {
  /** Доля свободного места по горизонтали, 0…1. */
  x: number
  /** Доля свободного места по вертикали, 0…1. */
  y: number
  width: number
  height: number
}

/** Прямоугольник в пикселях относительно рабочей области. */
export interface PixelRect {
  left: number
  top: number
  width: number
  height: number
}

/** Где окну разрешено лежать: рабочая область без верхней и нижней панелей. */
export type WindowArea = PixelRect

export const NOTES_WINDOW_MIN_WIDTH = 240
export const NOTES_WINDOW_MIN_HEIGHT = 200
/** Верхняя граница для разбора сохранённого размера; реальный размер ограничивает область. */
export const NOTES_WINDOW_MAX_SIZE = 4000
/** Шаг стрелок на ручке окна. */
export const NOTES_WINDOW_STEP = 16
/** Отступ окна от краёв области и от панелей. */
export const NOTES_WINDOW_MARGIN = 12

/**
 * По умолчанию — у правого верхнего угла, где рядом со страницей обычно свободно.
 * Ширина 300px помещается справа от страницы DOCX на экране 1440px с открытой
 * боковой панелью; шире окно растягивают за угол.
 */
export const DEFAULT_FLOAT_RECT: FloatRect = { x: 1, y: 0, width: 300, height: 520 }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Размер не меньше минимального, но и не больше области; в крошечной области окно её заполняет. */
function fit(size: number, min: number, available: number) {
  return Math.max(0, Math.min(Math.max(size, min), available))
}

/** Доля свободного места для отступа `offset`; без свободного места доля не меняется. */
function share(offset: number, free: number, fallback: number) {
  return free > 0 ? clamp(offset / free, 0, 1) : fallback
}

/** Область окна по размеру рабочей области и высоте её верхней и нижней панелей. */
export function windowArea(width: number, height: number, insetTop: number, insetBottom: number): WindowArea {
  const top = insetTop + NOTES_WINDOW_MARGIN
  return {
    left: NOTES_WINDOW_MARGIN,
    top,
    width: Math.max(0, width - NOTES_WINDOW_MARGIN * 2),
    height: Math.max(0, height - top - insetBottom - NOTES_WINDOW_MARGIN),
  }
}

/** Где окно лежит сейчас, в пикселях. Результат всегда внутри области. */
export function resolveFloatRect(rect: FloatRect, area: WindowArea): PixelRect {
  const width = fit(rect.width, NOTES_WINDOW_MIN_WIDTH, area.width)
  const height = fit(rect.height, NOTES_WINDOW_MIN_HEIGHT, area.height)
  return {
    left: Math.round(area.left + rect.x * (area.width - width)),
    top: Math.round(area.top + rect.y * (area.height - height)),
    width: Math.round(width),
    height: Math.round(height),
  }
}

/** Переносит левый верхний угол окна в точку; за край области окно не выходит. */
export function placeFloatRect(rect: FloatRect, area: WindowArea, left: number, top: number): FloatRect {
  const current = resolveFloatRect(rect, area)
  return {
    ...rect,
    x: share(left - area.left, area.width - current.width, rect.x),
    y: share(top - area.top, area.height - current.height, rect.y),
  }
}

/**
 * Меняет размер за правый нижний угол: левый верхний угол стоит на месте, окно
 * растёт только до края области и не становится меньше минимального.
 */
export function sizeFloatRect(rect: FloatRect, area: WindowArea, width: number, height: number): FloatRect {
  const current = resolveFloatRect(rect, area)
  const maxWidth = area.left + area.width - current.left
  const maxHeight = area.top + area.height - current.top
  const nextWidth = clamp(width, Math.min(NOTES_WINDOW_MIN_WIDTH, maxWidth), maxWidth)
  const nextHeight = clamp(height, Math.min(NOTES_WINDOW_MIN_HEIGHT, maxHeight), maxHeight)
  return {
    width: Math.round(nextWidth),
    height: Math.round(nextHeight),
    // Угол остаётся на месте, а доля пересчитывается под новое свободное место.
    x: share(current.left - area.left, area.width - nextWidth, rect.x),
    y: share(current.top - area.top, area.height - nextHeight, rect.y),
  }
}

export function moveFloatRectBy(rect: FloatRect, area: WindowArea, dx: number, dy: number): FloatRect {
  const current = resolveFloatRect(rect, area)
  return placeFloatRect(rect, area, current.left + dx, current.top + dy)
}

export function resizeFloatRectBy(rect: FloatRect, area: WindowArea, dw: number, dh: number): FloatRect {
  const current = resolveFloatRect(rect, area)
  return sizeFloatRect(rect, area, current.width + dw, current.height + dh)
}

/** Разбор сохранённого прямоугольника: каждое поле проверяется отдельно. */
export function parseFloatRect(value: unknown): FloatRect {
  if (typeof value !== 'object' || value === null) return DEFAULT_FLOAT_RECT
  const record = value as Record<string, unknown>
  const number = (field: string) => {
    const item = record[field]
    return typeof item === 'number' && Number.isFinite(item) ? item : null
  }
  const x = number('x')
  const y = number('y')
  const width = number('width')
  const height = number('height')
  return {
    x: x === null ? DEFAULT_FLOAT_RECT.x : clamp(x, 0, 1),
    y: y === null ? DEFAULT_FLOAT_RECT.y : clamp(y, 0, 1),
    width: width === null ? DEFAULT_FLOAT_RECT.width : Math.round(clamp(width, NOTES_WINDOW_MIN_WIDTH, NOTES_WINDOW_MAX_SIZE)),
    height: height === null ? DEFAULT_FLOAT_RECT.height : Math.round(clamp(height, NOTES_WINDOW_MIN_HEIGHT, NOTES_WINDOW_MAX_SIZE)),
  }
}
