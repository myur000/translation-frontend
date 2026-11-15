/**
 * Раскладка заметок на полях книги. Чистые функции: где встать карточкам и
 * хватает ли для них места. DOM здесь не трогается, поэтому всё проверяется тестами.
 */

/** Ширина карточки на полях: полная и минимальная, ниже которой карточки уходят с полей. */
export const CARD_MAX_WIDTH = 260
export const CARD_MIN_WIDTH = 200
/** Раскрытый конспект: в нём пишут подолгу, поэтому поля под него шире, если есть место. */
export const SUMMARY_MAX_WIDTH = 440
/** Зазор между страницей и карточкой и между карточкой и краем колонки. */
export const CARD_EDGE_GAP = 16
/** Вертикальный зазор между соседними карточками. */
export const CARD_GAP = 8
/**
 * Запас при возвращении на поля: карточки уходят, когда места меньше минимума,
 * а возвращаются, только когда его больше минимума на столько. Иначе на границе
 * (масштаб колёсиком, ресайз окна) они мигали бы туда-сюда.
 */
export const STAGE_HYSTERESIS = 40
/** Горизонтальные отступы колонки книги слева и справа (DocumentPreview.module.css). */
export const VIEWPORT_SIDE_PADDING = 24

/** Где заметки: карточками на полях или всплывающей карточкой у метки (места нет). */
export type MarginStage = 'margin' | 'popover'

export interface MarginFit {
  stage: MarginStage
  /** Ширина карточек на полях; у `popover` — 0. */
  cardWidth: number
  /** Сколько добавить к правому отступу колонки: страница сдвигается влево, освобождая поле. */
  reservedSpace: number
}

/**
 * Хватает ли места для карточек справа от страницы. `viewportWidth` — видимая
 * ширина колонки, `pageWidth` — ширина страницы на экране (с масштабом).
 * Страница центрируется в том, что осталось, поэтому при нехватке места она
 * сначала сдвигается влево, потом карточки сужаются до минимума.
 */
export function fitMarginNotes(viewportWidth: number, pageWidth: number, current: MarginStage | null, maxWidth = CARD_MAX_WIDTH): MarginFit {
  const available = Math.floor(viewportWidth - 2 * VIEWPORT_SIDE_PADDING - pageWidth - 2 * CARD_EDGE_GAP)
  const threshold = current === 'popover' ? CARD_MIN_WIDTH + STAGE_HYSTERESIS : CARD_MIN_WIDTH
  if (available < threshold) return { stage: 'popover', cardWidth: 0, reservedSpace: 0 }
  const cardWidth = Math.min(maxWidth, available)
  return { stage: 'margin', cardWidth, reservedSpace: cardWidth + 2 * CARD_EDGE_GAP }
}

export interface CardSlot {
  key: string
  /** Где карточка хочет стоять: верх первой строки абзаца в координатах содержимого. */
  anchor: number
  height: number
}

/**
 * Верх каждой карточки без наложений. Карточки идут по порядку абзацев; нижняя
 * сдвигается вниз, если верхняя ещё не кончилась. Открытая карточка (`activeKey`)
 * главнее: она стоит точно у своего абзаца, карточки выше неё поднимаются, ниже —
 * опускаются, как комментарии в Google Docs. Выше начала содержимого ничего не уходит.
 */
export function placeCards(slots: readonly CardSlot[], activeKey: string | null, gap = CARD_GAP): Map<string, number> {
  const ordered = [...slots].sort((first, second) => first.anchor - second.anchor || first.key.localeCompare(second.key))
  const tops = ordered.map((slot) => slot.anchor)
  // Каждая карточка от `from` и ниже — не выше своего места и не выше конца предыдущей.
  const pushDown = (from: number) => {
    for (let index = from; index < ordered.length; index += 1) {
      const floor = index === 0 ? 0 : tops[index - 1] + ordered[index - 1].height + gap
      tops[index] = Math.max(tops[index], floor)
    }
  }
  const active = activeKey === null ? -1 : ordered.findIndex((slot) => slot.key === activeKey)
  if (active < 0) {
    pushDown(0)
  } else {
    pushDown(active + 1)
    for (let index = active - 1; index >= 0; index -= 1) {
      tops[index] = Math.min(ordered[index].anchor, tops[index + 1] - gap - ordered[index].height)
    }
    // Поднятые карточки упёрлись в начало содержимого: тогда раскладка обычная, сверху вниз.
    if (tops[0] < 0) {
      ordered.forEach((slot, index) => { tops[index] = slot.anchor })
      pushDown(0)
    }
  }
  return new Map(ordered.map((slot, index) => [slot.key, Math.round(tops[index])]))
}

/** Место черновика в координатах содержимого колонки: у точки экрана `viewportY` или у места чтения. */
export function draftAnchor(viewport: HTMLElement, viewportY?: number) {
  const top = viewportY === undefined
    ? viewport.scrollTop + viewport.clientHeight * 0.25
    : viewportY - viewport.getBoundingClientRect().top + viewport.scrollTop
  return Math.max(0, Math.round(top))
}
