/**
 * Страницы книги без разметки страниц (DOCX, текст с сервера). Число страниц —
 * учётные страницы книги (`billedUnits`: столько списал сервер, ≈1800 знаков), а
 * место в книге — доля прокрутки колонки: верх — первая страница, конец —
 * последняя. Номер примерный, зато совпадает с тем, что человек видит в истории
 * («списано N стр.»), и не зависит от масштаба и ширины окна.
 */

/** Сколько можно прокрутить; у колонки, где всё помещается, — ноль. */
function scrollRange(scrollHeight: number, clientHeight: number) {
  return Math.max(0, scrollHeight - clientHeight)
}

/** Номер страницы (с единицы) для текущей прокрутки. */
export function flowPage(scrollTop: number, scrollHeight: number, clientHeight: number, total: number) {
  if (total <= 1) return 1
  const range = scrollRange(scrollHeight, clientHeight)
  if (range === 0) return 1
  const fraction = Math.min(1, Math.max(0, scrollTop / range))
  return Math.min(total, Math.floor(fraction * total) + 1)
}

/**
 * Куда прокрутить, чтобы открыть страницу: её начало. Обратная к `flowPage`:
 * прокрутка к началу страницы N даёт номер N. Последняя страница — конец книги.
 */
export function flowPageTop(page: number, scrollHeight: number, clientHeight: number, total: number) {
  const range = scrollRange(scrollHeight, clientHeight)
  if (total <= 1 || range === 0) return 0
  const target = Math.min(total, Math.max(1, page))
  if (target === total) return range
  // Чуть дальше границы: округление прокрутки браузером не возвращает на страницу назад.
  return Math.min(range, Math.ceil(((target - 1) / total) * range) + 1)
}
